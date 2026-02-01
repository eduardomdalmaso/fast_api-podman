from fastapi import (
    FastAPI,
    HTTPException,
    Depends,
    Request,
    Query,
    BackgroundTasks,
    Body,
)
import logging
import requests
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from starlette.responses import FileResponse, Response, StreamingResponse
import os
import json
from datetime import datetime, timedelta, date
import jwt
import redis
import bcrypt
import numpy as np
import cv2
import time
import base64
import threading
from sqlalchemy.orm import Session
from config import REDIS_URL, SECRET_KEY, API_KEY
from models import (
    SessionLocal,
    User,
    Camera,
    AccessLog,
)  # e, se tiver: Event, Detection...
from fastapi_socketio import SocketManager
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
import threading
from io import BytesIO

import pandas as pd
from weasyprint import HTML

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
AVAILABLE_PAGES = [
    "dashboard",
    "reports",
    "api_docs",
    "audit",
    "cameras",
    "registrations",
    "users",
]

# Nova constante para host/porta do MediaMTX (HLS serve em /{path}/index.m3u8)
MEDIA_MTX_HOST = "localhost"
MEDIA_MTX_PORT = 8888
MEDIA_MTX_API_PORT = 9997  # API do MediaMTX para configuração dinâmica


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("latin-1"), bcrypt.gensalt()).decode("latin-1")


def verify_password(plain_password: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("latin-1"), hashed.encode("latin-1"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


class LoginRequest(BaseModel):
    username: str
    password: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        if not db.query(User).first():
            admin_hash = hash_password("admin")
            admin = User(
                username="admin",
                password_hash=admin_hash,
                role="admin",
                page_permissions=json.dumps(AVAILABLE_PAGES),
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()
    yield


app = FastAPI(lifespan=lifespan)

supported_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

logging.basicConfig(level=logging.DEBUG)

sio = SocketManager(
    app,
    cors_allowed_origins="*",
    engineio_logger=True,
    logger=True,
    async_mode="asgi",
    mount_location="/socket.io",
)

import logging as _logging

_logging.getLogger("engineio").setLevel(_logging.DEBUG)
_logging.getLogger("socketio").setLevel(_logging.DEBUG)


@sio.on("connect")
def _on_connect(sid, environ):
    origin = environ.get("HTTP_ORIGIN") or environ.get("origin")
    print(
        f"[SOCKET] connect attempt sid={sid} origin={origin} path={environ.get('PATH_INFO')}"
    )


@sio.on("disconnect")
def _on_disconnect(sid):
    print(f"[SOCKET] disconnect sid={sid}")


# Serve swagger.json
@app.get("/swagger.json")
async def get_swagger_json():
    try:
        with open("public/swagger.json", "r") as f:
            return json.load(f)
    except Exception:
        raise HTTPException(status_code=404, detail="Swagger spec not found")


# Mount static files BEFORE middleware and other routes
app.mount("/api-docs", StaticFiles(directory="public/api-docs", html=True), name="api-docs")
app.mount("/dist", StaticFiles(directory="dist"), name="dist")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

r = redis.Redis.from_url(REDIS_URL)
security = HTTPBearer()

# Global VideoCapture instances for continuous streaming
video_captures = {}
video_captures_lock = threading.Lock()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _base_image(platform: str) -> np.ndarray:
    """Get next frame from camera source or show No Signal."""
    w, h = 1020, 600

    # Get camera URL from database
    camera_url = None
    try:
        db = next(get_db())
        from models import Camera

        cam = db.query(Camera).filter(Camera.platform == platform).first()
        if cam and cam.url:
            camera_url = cam.url
        db.close()
    except Exception as e:
        print(f"Error fetching camera URL: {e}")

    # Try to get frame from persistent VideoCapture
    with video_captures_lock:
        if platform not in video_captures and camera_url:
            # Initialize VideoCapture for this platform
            cap = cv2.VideoCapture(camera_url)
            if cap and cap.isOpened():
                video_captures[platform] = cap
                print(f"Opened video stream for {platform}: {camera_url}")
            else:
                video_captures[platform] = None
                print(f"Failed to open video stream: {camera_url}")

        cap = video_captures.get(platform)
        if cap and cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                frame = cv2.resize(frame, (w, h))
                return frame
            else:
                # Failed to read - try to reopen
                cap.release()
                if camera_url:
                    cap = cv2.VideoCapture(camera_url)
                    if cap and cap.isOpened():
                        video_captures[platform] = cap
                        ret, frame = cap.read()
                        if ret and frame is not None:
                            frame = cv2.resize(frame, (w, h))
                            return frame
                video_captures[platform] = None

    # No signal - show static image
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:] = (30, 30, 30)  # Dark gray

    # Draw "NO SIGNAL" message
    cv2.putText(
        img,
        "NO SIGNAL",
        (w // 2 - 150, h // 2),
        cv2.FONT_HERSHEY_SIMPLEX,
        2.0,
        (100, 100, 100),
        4,
    )
    cv2.putText(
        img,
        f"Platform: {platform}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (150, 150, 150),
        2,
    )

    if camera_url:
        cv2.putText(
            img,
            f"Camera: {camera_url[:60]}",
            (20, h - 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (120, 120, 120),
            1,
        )
        cv2.putText(
            img,
            "Connection failed",
            (20, h - 15),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (100, 100, 200),
            1,
        )
    else:
        cv2.putText(
            img,
            "No camera URL configured",
            (20, h - 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (120, 120, 120),
            1,
        )

    return img


def _overlay_zones(img: np.ndarray, platform: str) -> None:
    try:
        key = f"zones:{platform}"
        raw = r.get(key)
        if not raw:
            return
        zones = json.loads(raw)
        for z, zd in zones.items():
            try:
                p1 = zd.get("p1")
                p2 = zd.get("p2")
                if not p1 or not p2:
                    continue
                x1, y1 = int(p1[0]), int(p1[1])
                x2, y2 = int(p2[0]), int(p2[1])
                # choose color per zone - bright, vivid colors
                colors = {"A": (0, 255, 0), "B": (0, 165, 255), "C": (255, 0, 255)}
                color = colors.get(z, (255, 255, 255))
                # Draw thick line for visibility
                cv2.line(img, (x1, y1), (x2, y2), color, 8)
                # Draw zone label with background
                mx, my = (x1 + x2) // 2, (y1 + y2) // 2
                cv2.rectangle(
                    img, (mx - 50, my - 30), (mx + 50, my + 30), (0, 0, 0), -1
                )
                cv2.putText(
                    img,
                    f"Zone {z}",
                    (mx - 35, my + 8),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    color,
                    2,
                )
            except Exception:
                continue
    except Exception as e:
        print("Failed to overlay zones:", e)


def _overlay_detections(img: np.ndarray, platform: str) -> None:
    """Draw YOLO detections (bounding boxes only) on the frame."""
    try:
        key = f"detections:{platform}"
        raw = r.get(key)
        if not raw:
            return
        detections = json.loads(raw)

        for det in detections:
            try:
                box = det.get("box")

                if not box:
                    continue

                x1, y1, x2, y2 = box
                # Draw bounding box in bright green
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 3)

            except Exception as e:
                print(f"Error drawing detection: {e}")
                continue
    except Exception as e:
        print("Failed to overlay detections:", e)


def make_snapshot_bytes(platform: str, show_detections: bool = True) -> bytes:
    try:
        img = _base_image(platform)
        # Always draw a live timestamp on top so the UI shows current time
        try:
            ts_text = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(
                img,
                ts_text,
                (20, 80),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (200, 200, 200),
                2,
            )
        except Exception:
            pass

        _overlay_zones(img, platform)
        if show_detections:
            _overlay_detections(img, platform)  # Draw YOLO bounding boxes
        ret, buf = cv2.imencode(".jpg", img)
        if ret:
            return buf.tobytes()
    except Exception as e:
        print("Failed to generate snapshot image:", e)
    return b""


# Zones endpoints (simple Redis-backed storage)
@app.get("/get_zones/{platform}")
async def get_zones(platform: str):
    try:
        key = f"zones:{platform}"
        raw = r.get(key)
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except Exception:
            return {}
    except Exception as e:
        print("Error fetching zones from redis:", e)
        return {}


@app.post("/set_zones/{platform}")
async def set_zones(platform: str, data: Dict[str, Any] = Body(...)):
    try:
        key = f"zones:{platform}"
        # allow empty body to clear
        if not data:
            r.delete(key)
        else:
            r.set(key, json.dumps(data))
        return {"success": True}
    except Exception as e:
        print("Error saving zones to redis:", e)
        raise HTTPException(status_code=500, detail="Failed to save zones")


@app.get("/snapshot/{platform}")
async def snapshot(platform: str):
    img = make_snapshot_bytes(platform)
    if not img:
        raise HTTPException(status_code=500, detail="Failed to create snapshot")
    return Response(content=img, media_type="image/jpeg")


@app.get("/snapshot/{platform}/zones-only")
async def snapshot_zones_only(platform: str):
    """Return snapshot with zones but WITHOUT detection boundaries."""
    img = make_snapshot_bytes(platform, show_detections=False)
    if not img:
        raise HTTPException(status_code=500, detail="Failed to create snapshot")
    return Response(content=img, media_type="image/jpeg")


@app.get("/video_feed/{platform}")
def video_feed(platform: str):
    def gen():
        try:
            while True:
                frame = make_snapshot_bytes(platform)
                if not frame:
                    break
                # Publish frame to ML processor as base64 JSON (includes zones)
                try:
                    zones_raw = r.get(f"zones:{platform}")
                    zones_json = json.loads(zones_raw) if zones_raw else {}
                except Exception:
                    zones_json = {}
                try:
                    payload = {
                        "platform": platform,
                        "zones": json.dumps(zones_json),
                        "image": base64.b64encode(frame).decode("ascii"),
                    }
                    r.publish("camera_frames", json.dumps(payload))
                except Exception as e:
                    print("Failed to publish frame to redis:", e)
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n")
                time.sleep(0.033)  # ~30 fps
        except GeneratorExit:
            return

    return StreamingResponse(
        gen(), media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.post("/api/auth/login")
async def api_login(
    data: LoginRequest, response: Response, db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"username": user.username, "user_id": user.id})
    # set token as HttpOnly cookie for browser clients
    response.set_cookie(key="access_token", value=token, httponly=True, samesite="lax")

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "name": getattr(user, "name", user.username),
            "role": getattr(user, "role", "viewer"),
            "page_permissions": json.loads(user.page_permissions)
            if user.page_permissions
            else [],
        },
        "message": "ok",
    }


@app.get("/api/auth/me")
async def api_me(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    username = payload.get("username")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "name": getattr(user, "name", user.username),
            "role": getattr(user, "role", "viewer"),
            "page_permissions": json.loads(user.page_permissions)
            if user.page_permissions
            else [],
        }
    }


# Cameras API
@app.get("/api/v1/cameras")
async def api_cameras(db: Session = Depends(get_db)):
    cams = db.query(Camera).all()
    platforms = []
    for cam in cams:
        platforms.append(
            {
                "platform": cam.platform,
                "name": cam.name,
                "url": cam.url,
                "status": "live",
                "hls_url": f"http://{MEDIA_MTX_HOST}:{MEDIA_MTX_PORT}/{cam.platform}/index.m3u8",
            }
        )
    return {"platforms": platforms}


@app.get("/api/v1/today-summary")
async def api_today_summary(
    platform: Optional[str] = Query(None), db: Session = Depends(get_db)
):
    """Return a simple today summary for platforms with zone breakdowns.
    If `platform` is provided, return only that platform's stats.
    """
    try:
        cams = db.query(Camera).all()

        # Aggregate reports_history into platform/zone counts
        zone_counts = {}  # {platform: {zone: {loaded: X, unloaded: Y}}}
        try:
            raw_list = r.lrange("reports_history", 0, -1)
            for entry_bytes in raw_list:
                try:
                    entry = json.loads(entry_bytes)
                    plat = entry.get("platform")
                    zone = entry.get("zone")
                    direction = entry.get("direction")
                    qty = entry.get("qty", 1)

                    if plat and zone and direction:
                        if plat not in zone_counts:
                            zone_counts[plat] = {}
                        if zone not in zone_counts[plat]:
                            zone_counts[plat][zone] = {"loaded": 0, "unloaded": 0}

                        zone_counts[plat][zone][direction] = (
                            zone_counts[plat][zone].get(direction, 0) + qty
                        )
                except Exception:
                    continue
        except Exception as e:
            print("Failed to aggregate reports_history:", e)

        platforms = {}
        total_loaded = 0
        total_unloaded = 0

        for cam in cams:
            key = str(cam.platform)
            plat_zones = zone_counts.get(key, {})

            # Sum across all zones for platform total
            loaded = sum(z.get("loaded", 0) for z in plat_zones.values())
            unloaded = sum(z.get("unloaded", 0) for z in plat_zones.values())

            # Include zone breakdown in platform data
            platforms[key] = {
                "total_loaded": loaded,
                "total_unloaded": unloaded,
                "loaded": loaded,
                "unloaded": unloaded,
                "status": "live" if cam.url else "offline",
                "zones": plat_zones,
            }
            total_loaded += loaded
            total_unloaded += unloaded

        if platform:
            return {
                "platforms": {
                    platform: platforms.get(
                        platform,
                        {
                            "loaded": 0,
                            "unloaded": 0,
                            "total_loaded": 0,
                            "total_unloaded": 0,
                            "status": "offline",
                            "zones": {},
                        },
                    )
                },
                "total": {"loaded": total_loaded, "unloaded": total_unloaded},
            }

        return {
            "platforms": platforms,
            "total": {"loaded": total_loaded, "unloaded": total_unloaded},
        }
    except Exception as e:
        print("Failed to build today-summary:", e)
        raise HTTPException(status_code=500, detail="Failed to build today summary")


@app.get("/api/v1/charts/{platform_period}")
async def api_charts(
    platform_period: str,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    """Return real chart data buckets from Redis reports_history.
    The frontend expects an array of objects with carregados/descarregados (loaded/unloaded) per bucket.
    """
    try:
        # platform_period format: '<platform>-<period>' or 'all-<period>'
        parts = platform_period.split("-")
        if len(parts) >= 2:
            platform_key = parts[0]
            period = parts[1]
        else:
            platform_key = parts[0]
            period = "month"

        # Parse date range
        start_ts = None
        end_ts = None
        if start:
            start_ts = datetime.fromisoformat(start).timestamp()
        if end:
            end_ts = datetime.fromisoformat(end).timestamp()

        # Read all reports from Redis
        try:
            raw_list = r.lrange("reports_history", 0, -1)
            items = [json.loads(x) for x in raw_list]
        except Exception:
            items = []

        # Filter by platform and date range
        filtered_items = []
        for item in items:
            # Check platform filter
            if platform_key != "all" and item.get("platform") != platform_key:
                continue

            # Check date range
            ts = item.get("timestamp", 0)
            if isinstance(ts, (int, float)):
                if start_ts and ts < start_ts:
                    continue
                if end_ts and ts > end_ts:
                    continue

            filtered_items.append(item)

        # Aggregate by period into buckets
        if not filtered_items:
            return {"data": []}

        # Group by time period
        buckets = {}
        for item in filtered_items:
            ts = item.get("timestamp", 0)
            direction = item.get("direction", "unknown")
            qty = item.get("qty", 1)

            # Determine bucket key based on period
            try:
                if isinstance(ts, (int, float)):
                    dt = datetime.utcfromtimestamp(ts)
                else:
                    dt = datetime.fromisoformat(ts)

                if period == "hour":
                    bucket_key = dt.strftime("%H:00")
                elif period == "day":
                    bucket_key = dt.strftime("%Y-%m-%d")
                elif period == "week":
                    bucket_key = f"{dt.year}-W{dt.isocalendar()[1]}"
                elif period == "month":
                    bucket_key = dt.strftime("%Y-%m")
                else:
                    bucket_key = dt.strftime("%Y-%m-%d")

                if bucket_key not in buckets:
                    buckets[bucket_key] = {"carregados": 0, "descarregados": 0}

                if direction == "loaded":
                    buckets[bucket_key]["carregados"] += qty
                elif direction == "unloaded":
                    buckets[bucket_key]["descarregados"] += qty
            except Exception:
                continue

        # Convert to array format
        data = []
        for bucket_key in sorted(buckets.keys()):
            data.append(
                {
                    "bucket": bucket_key,
                    "carregados": buckets[bucket_key]["carregados"],
                    "descarregados": buckets[bucket_key]["descarregados"],
                }
            )

        return {"data": data}
    except Exception as e:
        print("Failed to build charts data:", e)
        raise HTTPException(status_code=500, detail="Failed to build charts data")


@app.get("/api/v1/reports")
async def api_reports(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    dir: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return reports data filtered by date/platform/zone/direction."""
    try:
        data = _get_filtered_reports(
            start=start, end=end, platform=platform, zone=zone, direction=dir
        )
        total = len(data)
        return {"data": data, "total": total}
    except Exception as e:
        print("Failed to fetch reports:", e)
        raise HTTPException(status_code=500, detail="Failed to fetch reports")


class ReportExportRequest(BaseModel):
    platform: Optional[str] = None
    zone: Optional[str] = None
    direction: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    lang: Optional[str] = None
    html: Optional[str] = None


def _normalize_direction(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = str(value).strip().lower()
    if v in ["loaded", "carregado", "carregados", "embarque", "embark"]:
        return "loaded"
    if v in ["unloaded", "descarregado", "descarregados", "desembarque", "disembark"]:
        return "unloaded"
    return v


def _parse_report_dt(value: Optional[str], is_end: bool = False) -> Optional[datetime]:
    if not value:
        return None
    try:
        raw = str(value).strip()
        if not raw:
            return None
        # date-only (YYYY-MM-DD)
        if len(raw) <= 10:
            dt = datetime.fromisoformat(raw)
            return dt + timedelta(days=1) if is_end else dt
        return datetime.fromisoformat(raw)
    except Exception:
        try:
            ts = float(value)
            return datetime.utcfromtimestamp(ts)
        except Exception:
            return None


def _get_reports_raw() -> List[Dict[str, Any]]:
    key = "reports_history"
    try:
        raw_list = r.lrange(key, 0, -1)
        return [json.loads(x) for x in raw_list]
    except Exception:
        return []


def _get_filtered_reports(
    start: Optional[str],
    end: Optional[str],
    platform: Optional[str],
    zone: Optional[str],
    direction: Optional[str],
) -> List[Dict[str, Any]]:
    items = _get_reports_raw()
    start_dt = _parse_report_dt(start, is_end=False)
    end_dt = _parse_report_dt(end, is_end=True)
    dir_norm = _normalize_direction(direction)

    data: List[Dict[str, Any]] = []
    for it in items:
        try:
            ts = it.get("timestamp") or it.get("date") or it.get("time")
            dt = None
            if isinstance(ts, (int, float)):
                dt = datetime.utcfromtimestamp(float(ts))
                timestamp = dt.isoformat()
            else:
                timestamp = str(ts) if ts is not None else ""
                dt = _parse_report_dt(timestamp, is_end=False)

            if start_dt and (dt is None or dt < start_dt):
                continue
            if end_dt and (dt is None or dt >= end_dt):
                continue

            platform_val = it.get("platform") or it.get("platform_id") or it.get(
                "platformId"
            )
            zone_val = it.get("zone")
            direction_val = _normalize_direction(
                it.get("direction") or it.get("operation")
            )
            qty = it.get("qty", it.get("quantity", it.get("count", 1)))

            if platform and platform != "all":
                if platform_val is None:
                    continue
                if str(platform_val) != str(platform) and str(platform) not in str(
                    platform_val
                ):
                    continue
            if zone and zone != "all" and str(zone_val) != str(zone):
                continue
            if dir_norm and dir_norm != "all" and direction_val != dir_norm:
                continue

            data.append(
                {
                    "timestamp": timestamp,
                    "platform": platform_val,
                    "zone": zone_val,
                    "direction": direction_val or it.get("direction") or it.get(
                        "operation"
                    ),
                    "quantity": qty,
                }
            )
        except Exception:
            continue

    return data


def _reports_dataframe(data: List[Dict[str, Any]]) -> pd.DataFrame:
    columns = ["timestamp", "platform", "zone", "direction", "quantity"]
    if not data:
        return pd.DataFrame(columns=columns)
    return pd.DataFrame(data, columns=columns)


def _default_reports_html(data: List[Dict[str, Any]], title: str) -> str:
    rows = "".join(
        f"<tr>"
        f"<td>{it.get('timestamp','')}</td>"
        f"<td>{it.get('platform','')}</td>"
        f"<td>{it.get('zone','')}</td>"
        f"<td>{it.get('direction','')}</td>"
        f"<td>{it.get('quantity','')}</td>"
        f"</tr>"
        for it in data
    )
    if not rows:
        rows = (
            "<tr><td colspan='5' style='text-align:center;'>"
            "Sem dados para o período selecionado"
            "</td></tr>"
        )
    return f"""
<!doctype html>
<html>
<head>
  <meta charset='utf-8' />
  <style>
    body {{ font-family: Arial, sans-serif; color: #111; }}
    h1 {{ font-size: 20px; margin-bottom: 8px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
    th, td {{ border: 1px solid #ddd; padding: 6px 8px; }}
    th {{ background: #f3f4f6; text-align: left; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <table>
    <thead>
      <tr>
        <th>Data/Hora</th>
        <th>Plataforma</th>
        <th>Zona</th>
        <th>Operação</th>
        <th>Quantidade</th>
      </tr>
    </thead>
    <tbody>
      {rows}
    </tbody>
  </table>
</body>
</html>
"""


@app.post("/api/v1/reports/export/csv")
async def api_reports_export_csv(payload: ReportExportRequest):
    try:
        data = _get_filtered_reports(
            start=payload.startDate,
            end=payload.endDate,
            platform=payload.platform,
            zone=payload.zone,
            direction=payload.direction,
        )
        df = _reports_dataframe(data)
        csv_content = df.to_csv(index=False)
        filename = f"relatorio_operacoes_{date.today().isoformat()}.csv"
        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        print("Failed to export CSV:", e)
        raise HTTPException(status_code=500, detail="Failed to export CSV")


@app.post("/api/v1/reports/export/excel")
async def api_reports_export_excel(payload: ReportExportRequest):
    try:
        data = _get_filtered_reports(
            start=payload.startDate,
            end=payload.endDate,
            platform=payload.platform,
            zone=payload.zone,
            direction=payload.direction,
        )
        df = _reports_dataframe(data)

        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Relatorio")
        output.seek(0)
        filename = f"relatorio_operacoes_{date.today().isoformat()}.xlsx"
        return Response(
            content=output.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        print("Failed to export Excel:", e)
        raise HTTPException(status_code=500, detail="Failed to export Excel")


@app.post("/api/v1/reports/export/pdf")
async def api_reports_export_pdf(payload: ReportExportRequest, request: Request):
    try:
        data = _get_filtered_reports(
            start=payload.startDate,
            end=payload.endDate,
            platform=payload.platform,
            zone=payload.zone,
            direction=payload.direction,
        )

        title = "Relatório de KPIs"
        html = payload.html or _default_reports_html(data, title)

        pdf_bytes = HTML(string=html, base_url=str(request.base_url)).write_pdf()
        filename = f"relatorio_kpis_{date.today().isoformat()}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        print("Failed to export PDF:", e)
        raise HTTPException(status_code=500, detail="Failed to export PDF")


@app.get("/api/v1/integration-logs")
async def api_integration_logs(limit: int = 50):
    """Return stubbed integration logs for UI consumption."""
    try:
        logs = []
        return {"logs": logs}
    except Exception as e:
        print("Failed to fetch integration logs:", e)
        raise HTTPException(status_code=500, detail="Failed to fetch integration logs")


@app.get("/api/v1/test_connection_plat/{platform}")
async def api_test_connection_platform(platform: str):
    """Simple platform connection tester: tries to fetch a snapshot and reports success."""
    try:
        img = make_snapshot_bytes(platform)
        if img and len(img) > 0:
            return {"success": True}
        return {"success": False, "error": "No frame available"}
    except Exception as e:
        print("Test connection failed for", platform, e)
        return {"success": False, "error": str(e)}


def _configure_mediamtx_path(platform: str, source_url: str) -> bool:
    """Configure MediaMTX path dynamically via API.
    
    Args:
        platform: Nome do path (ex: platform1, camera1)
        source_url: URL da fonte RTSP/RTMP (ex: rtsp://user:pass@ip:port/path)
    
    Returns:
        True se configurado com sucesso, False caso contrário
    """
    try:
        # MediaMTX API endpoint para adicionar/atualizar path
        api_url = f"http://{MEDIA_MTX_HOST}:{MEDIA_MTX_API_PORT}/v3/config/paths/add/{platform}"
        
        # Configuração do path
        config = {
            "source": source_url,
            "sourceProtocol": "automatic",
            "sourceOnDemand": False,  # Sempre ativo
            "runOnReady": "",
            "runOnNotReady": "",
        }
        
        response = requests.post(api_url, json=config, timeout=5)
        if response.status_code in [200, 201]:
            print(f"✅ MediaMTX path '{platform}' configured successfully")
            return True
        else:
            print(f"⚠️ MediaMTX API returned status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Failed to configure MediaMTX path '{platform}': {e}")
        return False


def _remove_mediamtx_path(platform: str) -> bool:
    """Remove path do MediaMTX via API."""
    try:
        api_url = f"http://{MEDIA_MTX_HOST}:{MEDIA_MTX_API_PORT}/v3/config/paths/delete/{platform}"
        response = requests.post(api_url, timeout=5)
        if response.status_code == 200:
            print(f"✅ MediaMTX path '{platform}' removed successfully")
            return True
        else:
            print(f"⚠️ Failed to remove MediaMTX path: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Failed to remove MediaMTX path '{platform}': {e}")
        return False


@app.post("/api/v1/add_camera")
async def api_add_camera(data: dict = Body(...), db: Session = Depends(get_db)):
    platform = data.get("platform")
    name = data.get("name")
    url = data.get("url")
    if not all([platform, name, url]):
        raise HTTPException(
            status_code=400, detail="Missing parameters! Required: platform, name, url"
        )
    if db.query(Camera).filter(Camera.platform == platform).first():
        raise HTTPException(status_code=400, detail="Platform exists")
    
    # Adicionar câmera no banco
    new_cam = Camera(platform=platform, name=name, url=url)
    db.add(new_cam)
    db.commit()
    
    # Configurar automaticamente no MediaMTX
    mediamtx_ok = _configure_mediamtx_path(platform, url)
    
    return {
        "success": True,
        "mediamtx_configured": mediamtx_ok,
        "message": "Camera added. MediaMTX configuration " + ("successful" if mediamtx_ok else "failed - check manually")
    }


@app.post("/api/v1/update_camera")
async def api_update_camera(data: dict = Body(...), db: Session = Depends(get_db)):
    platform = data.get("platform")
    name = data.get("name")
    url = data.get("url")
    if not all([platform, name, url]):
        raise HTTPException(
            status_code=400, detail="Missing parameters! Required: platform, name, url"
        )

    cam = db.query(Camera).filter(Camera.platform == platform).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")

    cam.name = name
    cam.url = url
    db.commit()
    
    # Reconfigurar no MediaMTX com a nova URL
    mediamtx_ok = _configure_mediamtx_path(platform, url)
    
    return {
        "success": True,
        "mediamtx_configured": mediamtx_ok,
        "message": "Camera updated. MediaMTX reconfiguration " + ("successful" if mediamtx_ok else "failed - check manually")
    }


@app.post("/api/v1/delete_camera")
async def api_delete_camera(data: dict = Body(...), db: Session = Depends(get_db)):
    """Delete a camera and remove it from MediaMTX."""
    platform = data.get("platform")
    if not platform:
        raise HTTPException(status_code=400, detail="Missing parameter: platform")
    
    cam = db.query(Camera).filter(Camera.platform == platform).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Remover do banco
    db.delete(cam)
    db.commit()
    
    # Remover do MediaMTX
    mediamtx_ok = _remove_mediamtx_path(platform)
    
    return {
        "success": True,
        "mediamtx_removed": mediamtx_ok,
        "message": "Camera deleted. MediaMTX path removal " + ("successful" if mediamtx_ok else "failed - check manually")
    }


# ============== USER MANAGEMENT ENDPOINTS ==============
def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Extract user from JWT token in cookie."""
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    username = payload.get("username")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to ensure user has admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"
    page_permissions: Optional[List[str]] = None


class UserUpdateRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    page_permissions: Optional[List[str]] = None


@app.get("/api/v1/users")
async def get_users(
    db: Session = Depends(get_db), current_user: User = Depends(require_admin)
):
    """List all users (admin only)."""
    users = db.query(User).all()
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "page_permissions": json.loads(u.page_permissions)
                if u.page_permissions
                else [],
                "active": getattr(u, "active", True),
            }
            for u in users
        ]
    }


@app.post("/api/v1/add_user")
async def add_user(
    data: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create a new user (admin only)."""
    # Check if username already exists
    existing = db.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Hash password
    password_hash = hash_password(data.password)

    # Default permissions
    permissions = data.page_permissions or ["dashboard"]

    new_user = User(
        username=data.username,
        password_hash=password_hash,
        role=data.role,
        page_permissions=json.dumps(permissions),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "success": True,
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "role": new_user.role,
            "page_permissions": permissions,
        },
    }


@app.post("/api/v1/update_user")
async def update_user(
    user_id: int = Body(...),
    data: UserUpdateRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update an existing user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.username is not None:
        user.username = data.username
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.role is not None:
        user.role = data.role
    if data.page_permissions is not None:
        user.page_permissions = json.dumps(data.page_permissions)

    db.commit()
    return {"success": True}


@app.post("/api/v1/delete_user")
async def delete_user(
    user_id: int = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db.delete(user)
    db.commit()
    return {"success": True}


# ============== STATIC FILE SERVING ==============
@app.get("/")
async def serve_index():
    return FileResponse("dist/index.html")


@app.get("/{path:path}")
async def serve_static(path: str):
    if path.startswith("api/") or path.startswith("swagger.json"):
        raise HTTPException(status_code=404)
    file_path = os.path.join("dist", path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse("dist/index.html")


@app.get("/favicon.ico")
async def favicon():
    return (
        FileResponse("dist/favicon.ico", status_code=200)
        if os.path.exists("dist/favicon.ico")
        else Response(status_code=204)
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000)
