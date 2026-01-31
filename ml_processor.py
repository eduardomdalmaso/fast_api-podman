import redis
import json
import cv2
import numpy as np
from ultralytics import YOLO
import threading
import time
from config import (
    REDIS_URL,
    MODEL_PATH,
)  # Importe do config.py (adicione MODEL_PATH = "last.pt")

# Conecte ao Redis
r = redis.Redis.from_url(REDIS_URL)

# Carregue o modelo YOLO (se ativado)
model = YOLO(MODEL_PATH)
print(f"Model classes: {model.names}")

# Histórico de objetos por plataforma (para rastreamento)
platform_data = {}
frames_lock = threading.Lock()


def point_side_of_line(x, y, x1, y1, x2, y2):
    return (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)


def add_count_to_db(plat, zone, direction, qty=1):
    # Simula inserir no DB (substitua por query real se necessário)
    # Aqui, apenas publica no Redis para FastAPI consumir
    counts_data = {"platform": plat, "zone": zone, "direction": direction, "qty": qty}
    r.publish("processed_counts", json.dumps(counts_data))
    print(f"[{plat}] Zone {zone}: {direction} +{qty}")


def process_frame(frame_data):
    """
    Processa um frame com YOLO: detecta objetos, rastreia movimento e conta carregamentos/descarregamentos.
    """
    try:
        # Decodifique o frame (assumindo bytes base64 ou bytes raw)
        if isinstance(frame_data, str):
            frame = cv2.imdecode(
                np.frombuffer(frame_data.encode("latin-1"), dtype=np.uint8),
                cv2.IMREAD_COLOR,
            )
        else:
            frame = cv2.imdecode(
                np.frombuffer(frame_data, dtype=np.uint8), cv2.IMREAD_COLOR
            )

        plat = frame_data.get("platform", "unknown")
        zones = json.loads(frame_data.get("zones", "{}"))  # Zonas do frame

        # Inicialize histórico se necessário
        if plat not in platform_data:
            platform_data[plat] = {"hist": {}, "last_update": 0.0}

        hist = platform_data[plat]["hist"]
        frame = cv2.resize(frame, (1020, 600))  # Resize como no original

        # Rode YOLO
        results = model.track(frame, persist=True, classes=[0], conf=0.4)
        if results[0].boxes and results[0].boxes.id is not None:
            ids = results[0].boxes.id.cpu().numpy().astype(int)
            boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
            for box, tid in zip(boxes, ids):
                x1, y1, x2, y2 = box
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                if tid in hist:
                    px, py = hist[tid]
                    dist = ((cx - px) ** 2 + (cy - py) ** 2) ** 0.5
                    if dist > 10:
                        for z, zone_data in zones.items():
                            if z in "ABC" and "p1" in zone_data and "p2" in zone_data:
                                p1, p2 = zone_data["p1"], zone_data["p2"]
                                side1 = point_side_of_line(px, py, *p1, *p2)
                                side2 = point_side_of_line(cx, cy, *p1, *p2)
                                if side1 * side2 <= 0:
                                    direction = "loaded" if side2 < 0 else "unloaded"
                                    add_count_to_db(plat, z, direction)
                hist[tid] = (cx, cy)

        # Limpe histórico antigo (opcional)
        current_time = time.time()
        if current_time - platform_data[plat]["last_update"] > 300:  # 5 min
            hist.clear()
        platform_data[plat]["last_update"] = current_time

    except Exception as e:
        print(f"Error processing frame: {e}")


def listener():
    """
    Escuta o canal 'camera_frames' no Redis e processa frames.
    """
    pubsub = r.pubsub()
    pubsub.subscribe("camera_frames")
    print("ML Processor listening for camera frames...")
    for message in pubsub.listen():
        if message["type"] == "message":
            frame_data = json.loads(message["data"])
            # Execute em thread para não bloquear
            threading.Thread(
                target=process_frame, args=(frame_data,), daemon=True
            ).start()


# Inicie o listener
if __name__ == "__main__":
    threading.Thread(target=listener, daemon=True).start()
    # Mantenha rodando
    while True:
        time.sleep(1)
