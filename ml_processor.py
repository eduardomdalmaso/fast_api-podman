import redis
import json
import cv2
import numpy as np
import base64
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
    # publish to pubsub for realtime consumers
    try:
        r.publish("processed_counts", json.dumps(counts_data))
    except Exception:
        pass
    # persist to a list for reports/history queries
    try:
        entry = {**counts_data, "timestamp": time.time()}
        r.rpush("reports_history", json.dumps(entry))
    except Exception:
        pass
    print(f"[{plat}] Zone {zone}: {direction} +{qty}")


def process_frame(frame_data):
    """
    Processa um frame com YOLO: detecta objetos, rastreia movimento e conta carregamentos/descarregamentos.
    """
    try:
        # Espera um dict com campos: platform, zones, image (base64)
        plat = frame_data.get("platform", "unknown")
        zones_raw = frame_data.get("zones", "{}")
        if isinstance(zones_raw, str):
            try:
                zones = json.loads(zones_raw)
            except Exception:
                zones = {}
        else:
            zones = zones_raw or {}

        image_b64 = frame_data.get("image")
        frame = None
        if image_b64 is None:
            print("No 'image' field in frame_data")
        else:
            try:
                # Normalize common payload shapes
                if isinstance(image_b64, dict):
                    # Try common nested keys
                    if 'data' in image_b64:
                        image_b64 = image_b64['data']
                    elif 'image' in image_b64:
                        image_b64 = image_b64['image']
                    else:
                        # unexpected dict - log and skip
                        print(f"Unexpected image payload dict keys: {list(image_b64.keys())}")
                if isinstance(image_b64, list):
                    # assume list of ints
                    img_bytes = bytes(image_b64)
                elif isinstance(image_b64, str):
                    # base64 string
                    img_bytes = base64.b64decode(image_b64)
                elif isinstance(image_b64, (bytes, bytearray)):
                    img_bytes = bytes(image_b64)
                else:
                    print(f"Unsupported image field type: {type(image_b64)}")
                    img_bytes = None

                if img_bytes:
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            except Exception as e:
                print(f"Error decoding base64 image: {e}")
                frame = None

        if frame is None:
            print("Failed to obtain frame image, skipping")
            return

        # Inicialize histórico se necessário
        if plat not in platform_data:
            platform_data[plat] = {"hist": {}, "last_update": 0.0}

        hist = platform_data[plat]["hist"]
        frame = cv2.resize(frame, (1020, 600))  # Resize como no original

        # Debug info
        try:
            print(f"Processing frame for platform={plat}, shape={frame.shape}")
        except Exception:
            pass

        # Rode YOLO (abaixei conf para ajudar detecções iniciais)
        try:
            results = model.track(frame, persist=True, classes=[0], conf=0.25)
        except Exception as e:
            print(f"YOLO track error: {e}")
            return

        if len(results) == 0:
            return

        res = results[0]
        detections = []  # Store detections to publish
        try:
            if getattr(res, "boxes", None) is not None and getattr(res.boxes, "id", None) is not None:
                ids = res.boxes.id.cpu().numpy().astype(int)
                boxes = res.boxes.xyxy.cpu().numpy().astype(int)
                confs = res.boxes.conf.cpu().numpy()
                
                for box, tid, conf in zip(boxes, ids, confs):
                    x1, y1, x2, y2 = box
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    
                    # Store detection for drawing
                    detections.append({
                        'id': int(tid),
                        'box': [int(x1), int(y1), int(x2), int(y2)],
                        'conf': float(conf),
                        'center': [int(cx), int(cy)]
                    })
                    
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
        except Exception as e:
            print(f"Error handling YOLO results: {e}")
        
        # Publish detections to Redis for visualization
        try:
            if detections:
                r.setex(f'detections:{plat}', 2, json.dumps(detections))  # Expire in 2s
                print(f"Published {len(detections)} detections for {plat}")
        except Exception as e:
            print(f"Failed to publish detections: {e}")

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
