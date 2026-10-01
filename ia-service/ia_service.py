import io
import os
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from huggingface_hub import hf_hub_download
from PIL import Image, ImageOps, UnidentifiedImageError
from ultralytics import YOLO

CONF = float(os.getenv("IA_CONF", "0.45"))

print("Cargando modelo...")
ruta = hf_hub_download("Logesshhh/road-anomaly-pothole-yolov8m", "potbot_yolov8m.pt")
model = YOLO(ruta)
# Calentamiento: la primera predicción siempre es lenta, mejor hacerla al arrancar
model.predict(Image.new("RGB", (640, 640)), verbose=False)
print("Modelo listo")

app = FastAPI(title="BacheTrack IA")


@app.get("/salud")
def salud():
    return {"ok": True}

@app.post("/detectar")
async def detectar(foto: UploadFile = File(...), conf: float = CONF):
    datos = await foto.read()

    print("\n========== NUEVA DETECCION ==========")
    print(f"Archivo: {foto.filename}")
    print(f"Tamaño recibido: {len(datos)} bytes")
    print(f"Confianza solicitada: {conf}")

    try:
        img = Image.open(io.BytesIO(datos))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="El archivo no es una imagen válida"
        )

    print(f"Imagen recibida: {img.width}x{img.height}")

    inicio = time.perf_counter()

    # Usamos confianza baja para diagnóstico.
    # Queremos saber TODO lo que el modelo está viendo.
    r = model.predict(
        img,
        conf=0.10,
        verbose=False
    )[0]

    tiempo_ms = round((time.perf_counter() - inicio) * 1000)

    alto, ancho = r.orig_shape

    print(f"Detecciones encontradas: {len(r.boxes)}")

    baches = []

    for i, caja in enumerate(r.boxes):
        x1, y1, x2, y2 = caja.xyxy[0].tolist()
        confianza = float(caja.conf)
        clase = int(caja.cls)

        print(
            f"Detección {i + 1}: "
            f"clase={clase}, "
            f"confianza={confianza:.3f}"
        )

        # Seguimos respetando el threshold real
        if confianza >= conf:
            baches.append({
                "confianza": round(confianza, 3),
                "caja": [
                    round(x1),
                    round(y1),
                    round(x2),
                    round(y2)
                ],
                "area_relativa": round(
                    (x2 - x1) * (y2 - y1) /
                    (ancho * alto),
                    4
                ),
            })

    print(f"Baches aceptados con conf >= {conf}: {len(baches)}")
    print(f"Tiempo IA: {tiempo_ms} ms")
    print("=====================================\n")

    return {
        "hay_bache": len(baches) > 0,
        "total": len(baches),
        "baches": baches,
        "tiempo_ms": tiempo_ms,
    }