# Servicio de IA de BacheTrack

Detecta baches en fotos con YOLOv8 (modelo `Logesshhh/road-anomaly-pothole-yolov8m`).
Corre en CPU, no requiere GPU.

## Requisitos
- Python 3.11 o 3.12 (en Windows, marcar "Add python.exe to PATH" al instalar)

## Instalación (solo la primera vez)

**Windows (PowerShell):**
```
cd ia-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Linux:**
```
cd ia-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
chmod +x iniciar.sh
```

## Arrancar
- Windows: doble clic en `iniciar.bat`
- Linux: `./iniciar.sh`

La primera vez descarga el modelo (156 MB). Esperar el mensaje "Modelo listo".

## Probar
Abrir http://127.0.0.1:8000/docs → POST /detectar → Try it out → subir foto → Execute.