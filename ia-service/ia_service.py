import io
import os
import time
import cv2
import numpy as np

from fastapi import FastAPI, File, HTTPException, UploadFile
from huggingface_hub import hf_hub_download
from PIL import Image, ImageOps, UnidentifiedImageError
from ultralytics import YOLO


# ==========================================
# CONFIGURACIÓN
# ==========================================

CONF = float(os.getenv("IA_CONF", "0.45"))


# ==========================================
# CARGAR MODELO
# ==========================================

print("Cargando modelo...")

ruta = hf_hub_download(
    "Logesshhh/road-anomaly-pothole-yolov8m",
    "potbot_yolov8m.pt"
)

model = YOLO(ruta)

# Calentamiento del modelo
model.predict(
    Image.new("RGB", (640, 640)),
    verbose=False
)

print("Modelo listo")


# ==========================================
# FASTAPI
# ==========================================

app = FastAPI(title="BacheTrack IA")


# ==========================================
# CLASIFICAR TAMAÑO APARENTE
# ==========================================

def clasificar_tamano(area_relativa: float):

    if area_relativa < 0.04:
        return "PEQUENO", 1

    elif area_relativa < 0.10:
        return "MEDIANO", 2

    elif area_relativa < 0.18:
        return "GRANDE", 3

    else:
        return "MUY_GRANDE", 4


def clasificar_gravedad_visual(img, x1, y1, x2, y2):
    """
    Analiza visualmente la región detectada como bache.

    IMPORTANTE:
    No mide profundidad real.
    Estima deterioro visual usando:
    - contraste
    - densidad de bordes
    - proporción de zona oscura
    """

    # ==========================================
    # 1. VALIDAR COORDENADAS
    # ==========================================

    x1 = max(0, int(x1))
    y1 = max(0, int(y1))
    x2 = min(img.width, int(x2))
    y2 = min(img.height, int(y2))

    if x2 <= x1 or y2 <= y1:
        return "LEVE", 1, 0, 0.0, 0.0, 0.0

    # ==========================================
    # 2. RECORTAR BACHE
    # ==========================================

    recorte = img.crop((x1, y1, x2, y2))

    recorte_np = np.array(recorte)

    gris = cv2.cvtColor(
        recorte_np,
        cv2.COLOR_RGB2GRAY
    )

    # ==========================================
    # 3. CONTRASTE
    # ==========================================

    contraste = float(np.std(gris))

    # ==========================================
    # 4. DENSIDAD DE BORDES
    # ==========================================

    bordes = cv2.Canny(
        gris,
        50,
        150
    )

    densidad_bordes = float(
        np.count_nonzero(bordes) / bordes.size
    )

    # ==========================================
    # 5. ZONA OSCURA
    # ==========================================

    brillo_medio = float(np.mean(gris))

    umbral_oscuro = brillo_medio * 0.65

    pixeles_oscuros = np.count_nonzero(
        gris < umbral_oscuro
    )

    zona_oscura = float(
        pixeles_oscuros / gris.size
    )

    # ==========================================
    # 6. PUNTOS POR CONTRASTE
    # ==========================================

    if contraste < 45:
        puntos_contraste = 0

    elif contraste <= 60:
        puntos_contraste = 1

    else:
        puntos_contraste = 2

    # ==========================================
    # 7. PUNTOS POR ZONA OSCURA
    # ==========================================

    if zona_oscura < 0.15:
        puntos_zona_oscura = 0

    elif zona_oscura <= 0.25:
        puntos_zona_oscura = 1

    else:
        puntos_zona_oscura = 2

    # ==========================================
    # 8. PUNTOS POR DENSIDAD DE BORDES
    # ==========================================

    if densidad_bordes < 0.30:
        puntos_bordes = 0

    elif densidad_bordes <= 0.34:
        puntos_bordes = 1

    else:
        puntos_bordes = 2

    # ==========================================
    # 9. SCORE VISUAL TOTAL
    # ==========================================

    score_visual = (
        puntos_contraste +
        puntos_zona_oscura +
        puntos_bordes
    )

    # ==========================================
    # 10. CLASIFICAR GRAVEDAD
    # ==========================================

    if score_visual <= 1:
        gravedad_visual = "LEVE"
        puntos_gravedad = 1

    elif score_visual <= 3:
        gravedad_visual = "MODERADA"
        puntos_gravedad = 2

    elif score_visual <= 5:
        gravedad_visual = "SEVERA"
        puntos_gravedad = 3

    else:
        gravedad_visual = "CRITICA"
        puntos_gravedad = 4

    # ==========================================
    # RESULTADO
    # ==========================================

    return (
        gravedad_visual,
        puntos_gravedad,
        score_visual,
        round(contraste, 2),
        round(densidad_bordes, 4),
        round(zona_oscura, 4)
    )

@app.get("/salud")
def salud():

    return {
        "ok": True
    }


# ==========================================
# ENDPOINT DE DETECCIÓN
# ==========================================

@app.post("/detectar")
async def detectar(
    foto: UploadFile = File(...),
    conf: float = CONF
):

    datos = await foto.read()

    print("\n========== NUEVA DETECCION ==========")
    print(f"Archivo: {foto.filename}")
    print(f"Tamaño recibido: {len(datos)} bytes")
    print(f"Confianza mínima: {conf}")

    # ==========================================
    # 1. VALIDAR ARCHIVO
    # ==========================================

    if not datos:

        raise HTTPException(
            status_code=400,
            detail={
                "codigo": "IMAGEN_INVALIDA",
                "mensaje": "La imagen está vacía."
            }
        )

    try:

        img = Image.open(
            io.BytesIO(datos)
        )

        img = ImageOps.exif_transpose(
            img
        ).convert("RGB")

    except (UnidentifiedImageError, OSError):

        raise HTTPException(
            status_code=400,
            detail={
                "codigo": "IMAGEN_INVALIDA",
                "mensaje": "El archivo enviado no es una imagen válida."
            }
        )

    print(
        f"Imagen recibida: "
        f"{img.width}x{img.height}"
    )

    # ==========================================
    # 2. EJECUTAR MODELO YOLO
    # ==========================================

    inicio = time.perf_counter()

    try:

        # Usamos 0.10 para conocer todas las
        # detecciones candidatas del modelo.
        resultado = model.predict(
            img,
            conf=0.10,
            verbose=False
        )[0]

    except Exception as e:

        print(
            f"ERROR IA: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail={
                "codigo": "ERROR_IA",
                "mensaje": "No fue posible analizar la fotografía."
            }
        )

    tiempo_ms = round(
        (
            time.perf_counter() -
            inicio
        ) * 1000
    )

    alto, ancho = resultado.orig_shape

    print(
        f"Detecciones encontradas: "
        f"{len(resultado.boxes)}"
    )

    # ==========================================
    # 3. FILTRAR BACHES
    # ==========================================

    baches = []

    for i, caja in enumerate(resultado.boxes):

        # Coordenadas de la detección
        x1, y1, x2, y2 = (
            caja.xyxy[0].tolist()
        )

        confianza = float(
            caja.conf
        )

        clase = int(
            caja.cls
        )

        # ======================================
        # ÁREA RELATIVA
        # ======================================

        area_relativa = (
            (x2 - x1) *
            (y2 - y1) /
            (ancho * alto)
        )

        # ======================================
        # TAMAÑO APARENTE
        # ======================================

        tamano_aparente, puntos_tamano = (
            clasificar_tamano(
                area_relativa
            )
        )

        (
    gravedad_visual,
    puntos_gravedad,
    score_visual,
    contraste,
    densidad_bordes,
    zona_oscura
) = clasificar_gravedad_visual(
    img,
    x1,
    y1,
    x2,
    y2
)       
       
        print(
            f"Detección {i + 1}: "
            f"clase={clase}, "
            f"confianza={confianza:.3f}, "
            f"area={area_relativa:.4f}, "
            f"contraste={contraste}, "
            f"bordes={densidad_bordes}, "
            f"zona_oscura={zona_oscura}"
        )

        # ======================================
        # ACEPTAR DETECCIÓN
        # ======================================

        if confianza >= conf:

            baches.append({

                "confianza": round(
                    confianza,
                    3
                ),

                "caja": [
                    round(x1),
                    round(y1),
                    round(x2),
                    round(y2)
                ],

                "area_relativa": round(
                    area_relativa,
                    4
                ),

                "tamano_aparente": tamano_aparente,
"puntos_tamano": puntos_tamano,

"gravedad_visual": gravedad_visual,
"puntos_gravedad": puntos_gravedad,
"score_visual": score_visual,

"analisis_visual": {
    "contraste": contraste,
    "densidad_bordes": densidad_bordes,
    "zona_oscura": zona_oscura
}
            })

    # ==========================================
    # 4. NO SE DETECTÓ BACHE
    # ==========================================

    if len(baches) == 0:

        print(
            "RESULTADO: NO_BACHE"
        )

        print(
            f"Tiempo IA: {tiempo_ms} ms"
        )

        print(
            "=====================================\n"
        )

        return {

            "codigo":
                "NO_BACHE",

            "mensaje":
                "No se detectó ningún bache en la fotografía.",

            "hay_bache":
                False,

            "total":
                0,

            "baches":
                [],

            "tiempo_ms":
                tiempo_ms
        }

    # ==========================================
    # 5. BACHE DETECTADO
    # ==========================================

    print(
        "RESULTADO: OK_BACHE"
    )

    print(
        f"Baches aceptados: "
        f"{len(baches)}"
    )

    print(
        f"Tiempo IA: "
        f"{tiempo_ms} ms"
    )

    print(
        "=====================================\n"
    )

    return {

        "codigo":
            "OK_BACHE",

        "mensaje":
            "Bache detectado correctamente.",

        "hay_bache":
            True,

        "total":
            len(baches),

        "baches":
            baches,

        "tiempo_ms":
            tiempo_ms
    }