// ---- SUPABASE ----

const SUPABASE_URL = 'https://jbalxjjzohyfvwgyvyof.supabase.co';

const SUPABASE_KEY =
  'sb_publishable_i56ZW1XnhmPLXZ_TLrmfXw_qxPa1yyE';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ---- VERIFICAR SESIÓN ----
const rawSession = localStorage.getItem('user_session');
if (!rawSession) {
  window.location.href = 'login.html';
}

const userSession = JSON.parse(rawSession || '{}');

document.addEventListener('DOMContentLoaded', () => {
  // Configurar interfaz según sesión y rol
  if (userSession.municipality) {
    document.getElementById('label-municipality').textContent = userSession.municipality;
  }

  let roleText = 'Ciudadano Registrado';
  if (userSession.role === 'director') {
    roleText = 'Director / Superior (Auditoría)';
  } else if (userSession.role === 'operador') {
    roleText = 'Operador / Cuadrilla (Técnico)';
  }

  document.getElementById('text-user-role').textContent = roleText;

  // Cargar datos del mapa y tabla
  cargarReportes();

  document
  .getElementById('filter-status')
  .addEventListener('change', aplicarFiltros);

document
  .getElementById('search-report')
  .addEventListener('input', aplicarFiltros);
});

function cerrarSesion() {
  localStorage.removeItem('user_session');
  window.location.href = 'login.html';
}

// ---- INICIALIZAR MAPA DE LEAFLET ----
const mapa = L.map('mapa').setView([18.8467, -97.1305], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(mapa);

let marcadoresLayer = L.layerGroup().addTo(mapa);

function crearIconoOficial(status) {
  let color = '#991B1B'; // Rojo Guinda (Registrado)
  if (status === 'en_reparacion' || status === 'proceso' || status === 'en_proceso') {
    color = '#D97706'; // Ámbar
  } else if (status === 'atendido' || status === 'reparado') {
    color = '#065F46'; // Verde Institucional
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 24 24" fill="${color}" stroke="#FFFFFF" stroke-width="1.5">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -38],
  });
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return '—';
  try {
    const d = new Date(fechaStr);
    return d.toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return fechaStr;
  }
}

// ---- CAMBIAR ESTADO ----
async function cambiarEstado(id, nuevoEstado) {
  try {
    const res = await fetch(`/reports/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nuevoEstado })
    });

    if (res.ok) {
      cargarReportes();
    } else {
      alert("No se pudo actualizar el estado.");
    }
  } catch (e) {
    console.error(e);
  }
}

function exportarReportePDF() {
  alert("Generando reporte de incidencias en PDF...");
}

// ---- FILTROS DE REPORTES ----
let todosLosReportes = [];

function aplicarFiltros() {

  const filtro = document.getElementById('filter-status').value;
  const busqueda = document
    .getElementById('search-report')
    .value
    .toLowerCase()
    .trim();

  let reportesFiltrados = [...todosLosReportes];

  // FILTRO PRINCIPAL
  switch (filtro) {

    case 'current':
      reportesFiltrados = reportesFiltrados.filter(r => {
        const status = (r.status || '').toLowerCase();

        return status !== 'reparado' &&
               status !== 'atendido';
      });
      break;

    case 'critical':
      reportesFiltrados = reportesFiltrados.filter(r =>
        Number(r.priority || 0) >= 80
      );
      break;

    case 'high':
      reportesFiltrados = reportesFiltrados.filter(r => {
        const prioridad = Number(r.priority || 0);

        return prioridad >= 60 && prioridad < 80;
      });
      break;

    case 'repairing':
      reportesFiltrados = reportesFiltrados.filter(r => {
        const status = (r.status || '').toLowerCase();

        return status === 'en_proceso' ||
               status === 'en_reparacion' ||
               status === 'proceso';
      });
      break;

    case 'repaired':
      reportesFiltrados = reportesFiltrados.filter(r => {
        const status = (r.status || '').toLowerCase();

        return status === 'reparado' ||
               status === 'atendido';
      });
      break;

    case 'verified':
      reportesFiltrados = reportesFiltrados.filter(r =>
        r.verified === true
      );
      break;

    case 'unverified':
      reportesFiltrados = reportesFiltrados.filter(r =>
        r.verified !== true
      );
      break;
  }

  // BUSCADOR
  if (busqueda !== '') {

    reportesFiltrados = reportesFiltrados.filter(r => {

      const texto = `
        ${r.id || ''}
        ${r.description || ''}
        ${r.status || ''}
        ${r.category || ''}
        ${r.priority || ''}
      `.toLowerCase();

      return texto.includes(busqueda);
    });
  }

  renderizarTabla(reportesFiltrados);
  renderizarMapa(reportesFiltrados);
}

// ---- METRICAS Y TABLA ----
function actualizarMetricas(reportes) {
  let pendientes = 0, proceso = 0, atendidos = 0;

  reportes.forEach(r => {
    const st = (r.status || 'registrado').toLowerCase();
    if (st === 'en_reparacion' || st === 'proceso' || st === 'en_proceso') {
      proceso++;
    } else if (st === 'atendido' || st === 'reparado') {
      atendidos++;
    } else {
      pendientes++;
    }
  });

  document.getElementById('total-reportes').textContent = reportes.length;
  document.getElementById('total-pendientes').textContent = pendientes;
  document.getElementById('total-proceso').textContent = proceso;
  document.getElementById('total-atendidos').textContent = atendidos;
}


function actualizarResumen(reportes) {

  let critica = 0;
  let alta = 0;
  let moderada = 0;
  let leve = 0;

  let verificados = 0;
  let confirmaciones = 0;

  reportes.forEach(r => {

    const prioridad = Number(r.priority || 0);

    // Clasificación por prioridad
    if (prioridad >= 80) {
      critica++;
    } else if (prioridad >= 60) {
      alta++;
    } else if (prioridad >= 30) {
      moderada++;
    } else {
      leve++;
    }

    // Reportes verificados
    if (r.verified === true) {
      verificados++;
    }

    // Total de confirmaciones ciudadanas
    confirmaciones += Number(r.confirmations || 0);
  });

  document.getElementById('resumen-critica').textContent = critica;
  document.getElementById('resumen-alta').textContent = alta;
  document.getElementById('resumen-moderada').textContent = moderada;
  document.getElementById('resumen-leve').textContent = leve;

  document.getElementById('resumen-verificados').textContent = verificados;
  document.getElementById('resumen-confirmaciones').textContent = confirmaciones;
}

function renderizarMapa(reportes) {
  marcadoresLayer.clearLayers();
  const coords = [];

  reportes.forEach((r) => {
    const lat = parseFloat(r.latitude);
    const lng = parseFloat(r.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    const st = (r.status || 'registrado').toLowerCase();
    const marcador = L.marker([lat, lng], { icon: crearIconoOficial(st) });

    const fotoHtml = r.image_url
      ? `<img src="${r.image_url}" style="width:100%;height:110px;object-fit:cover;border-radius:4px;margin-bottom:6px;"/>`
      : '';

    marcador.bindPopup(`
      <div style="font-family:Montserrat,sans-serif;max-width:200px;">
        ${fotoHtml}
        <strong>${r.description || 'Bache detectado'}</strong><br/>
        <small>📅 ${formatearFecha(r.created_at)}</small>
      </div>
    `);

    marcadoresLayer.addLayer(marcador);
    coords.push([lat, lng]);
  });

  if (coords.length > 0) {
    mapa.fitBounds(coords, { padding: [40, 40] });
  }
}

function renderizarTabla(reportes) {
  const tbody = document.getElementById('tbody-reportes');

  if (reportes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-loading">
          No hay incidencias registradas.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = reportes.map((r, i) => {

    const id = r.id || (i + 1);
    const desc = r.description || 'Sin descripción';
    const fecha = formatearFecha(r.created_at);
    const status = (r.status || 'registrado').toLowerCase();

    const prioridadNumero = Number(r.priority || 0);
    let prioridadTexto = 'Leve';
    let prioridadClase = 'low';

    if (prioridadNumero >= 80) {
      prioridadTexto = 'Crítica';
      prioridadClase = 'critical';
    } else if (prioridadNumero >= 60) {
      prioridadTexto = 'Alta';
      prioridadClase = 'high';
    } else if (prioridadNumero >= 30) {
      prioridadTexto = 'Moderada';
      prioridadClase = 'medium';
    }

    const confirmaciones = Number(r.confirmations || 0);

    const fotoHtml = r.image_url
      ? `
        <a href="${r.image_url}" target="_blank">
          <img
            src="${r.image_url}"
            class="report-thumbnail"
            alt="Evidencia de incidencia #${id}"
          >
        </a>
      `
      : `<span class="no-photo">Sin foto</span>`;

    return `
      <tr>

        <!-- INCIDENCIA -->
        <td>
          <strong>#${id}</strong>
        </td>

        <!-- EVIDENCIA -->
        <td>
          ${fotoHtml}
        </td>

        <!-- DESCRIPCIÓN -->
        <td>
          ${desc}
        </td>

        <!-- PRIORIDAD -->
        <td>
          <span class="priority-badge ${prioridadClase}">
            ${prioridadTexto}
          </span>
          <small class="priority-value">
            ${prioridadNumero}
          </small>
        </td>

        <!-- CONFIRMACIONES -->
        <td>
          <span class="confirmation-count">
            ${confirmaciones}
          </span>
        </td>

        <!-- FECHA -->
        <td class="report-date">
          ${fecha}
        </td>

        <!-- ESTADO -->
        <td>
          <span class="badge-gob ${status}">
            ${status.replaceAll('_', ' ')}
          </span>
        </td>

        <!-- GESTIÓN -->
        <td>
          <select
            class="status-select"
            onchange="cambiarEstado(${id}, this.value)"
          >
            <option
              value="registrado"
              ${status === 'registrado' ? 'selected' : ''}
            >
              Registrado
            </option>

            <option
              value="en_proceso"
              ${status === 'en_proceso' || status === 'en_reparacion' ? 'selected' : ''}
            >
              En reparación
            </option>

            <option
              value="reparado"
              ${status === 'reparado' || status === 'atendido' ? 'selected' : ''}
            >
              Reparado
            </option>
          </select>
        </td>

      </tr>
    `;
  }).join('');
}

async function cargarReportes() {
  try {

    console.log("Consultando reportes desde Supabase...");

    const { data, error } = await supabaseClient
      .from('reports')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      throw error;
    }

    const reportes = data || [];

// Guardamos una copia de todos los reportes
todosLosReportes = reportes;

console.log("Reportes recibidos de Supabase:", reportes);

actualizarMetricas(reportes);
renderizarMapa(reportes);
renderizarTabla(reportes);

    document.getElementById('ultima-sincro').textContent =
      'Última sincronización: ' +
      new Date().toLocaleTimeString('es-MX');

  } catch (e) {

    console.error(
      "Error al cargar reportes desde Supabase:",
      e
    );

  }
}