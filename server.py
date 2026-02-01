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
        print(f'Error fetching camera URL: {e}')
    
    # Try to get frame from persistent VideoCapture
    with video_captures_lock:
        if platform not in video_captures and camera_url:
            # Initialize VideoCapture for this platform
            cap = cv2.VideoCapture(camera_url)
            if cap and cap.isOpened():
                video_captures[platform] = cap
                print(f'Opened video stream for {platform}: {camera_url}')
            else:
                video_captures[platform] = None
                print(f'Failed to open video stream: {camera_url}')
        
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
    cv2.putText(img, "NO SIGNAL", (w//2 - 150, h//2), 
                cv2.FONT_HERSHEY_SIMPLEX, 2.0, (100, 100, 100), 4)
    cv2.putText(img, f"Platform: {platform}", (20, 40), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (150, 150, 150), 2)
    
    if camera_url:
        cv2.putText(img, f"Camera: {camera_url[:60]}", (20, h - 40), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (120, 120, 120), 1)
        cv2.putText(img, "Connection failed", (20, h - 15), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 100, 200), 1)
    else:
        cv2.putText(img, "No camera URL configured", (20, h - 20), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 120, 120), 1)
    
    return img


def _overlay_zones(img: np.ndarray, platform: str) -> None:
    try:
        key = f'zones:{platform}'
        raw = r.get(key)
        if not raw:
            return
        zones = json.loads(raw)
        for z, zd in zones.items():
            try:
                p1 = zd.get('p1')
                p2 = zd.get('p2')
                if not p1 or not p2:
                    continue
                x1, y1 = int(p1[0]), int(p1[1])
                x2, y2 = int(p2[0]), int(p2[1])
                # choose color per zone - bright, vivid colors
                colors = {'A': (0, 255, 0), 'B': (0, 165, 255), 'C': (255, 0, 255)}
                color = colors.get(z, (255, 255, 255))
                # Draw thick line for visibility
                cv2.line(img, (x1, y1), (x2, y2), color, 8)
                # Draw zone label with background
                mx, my = (x1 + x2) // 2, (y1 + y2) // 2
                cv2.rectangle(img, (mx - 50, my - 30), (mx + 50, my + 30), (0, 0, 0), -1)
                cv2.putText(img, f"Zone {z}", (mx - 35, my + 8), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)
            except Exception:
                continue
    except Exception as e:
        print('Failed to overlay zones:', e)


def _overlay_detections(img: np.ndarray, platform: str) -> None:
    """Draw YOLO detections (bounding boxes only) on the frame."""
    try:
        key = f'detections:{platform}'
        raw = r.get(key)
        if not raw:
            return
        detections = json.loads(raw)
        
        for det in detections:
            try:
                box = det.get('box')
                
                if not box:
                    continue
                
                x1, y1, x2, y2 = box
                # Draw bounding box in bright green
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 3)
                
            except Exception as e:
                print(f'Error drawing detection: {e}')
                continue
    except Exception as e:
        print('Failed to overlay detections:', e)


def make_snapshot_bytes(platform: str, show_detections: bool = True) -> bytes:
    try:
        img = _base_image(platform)
        # Always draw a live timestamp on top so the UI shows current time
        try:
            ts_text = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
            cv2.putText(img, ts_text, (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
        except Exception:
            pass

        _overlay_zones(img, platform)
        if show_detections:
            _overlay_detections(img, platform)  # Draw YOLO bounding boxes
        ret, buf = cv2.imencode('.jpg', img)
        if ret:
            return buf.tobytes()
    except Exception as e:
        print('Failed to generate snapshot image:', e)
    return b''


# Zones endpoints (simple Redis-backed storage)
@app.get('/get_zones/{platform}')
async def get_zones(platform: str):
    try:
        key = f'zones:{platform}'
        raw = r.get(key)
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except Exception:
            return {}
    except Exception as e:
        print('Error fetching zones from redis:', e)
        return {}


@app.post('/set_zones/{platform}')
async def set_zones(platform: str, data: Dict[str, Any] = Body(...)):
    try:
        key = f'zones:{platform}'
        # allow empty body to clear
        if not data:
            r.delete(key)
        else:
            r.set(key, json.dumps(data))
        return {'success': True}
    except Exception as e:
        print('Error saving zones to redis:', e)
        raise HTTPException(status_code=500, detail='Failed to save zones')


@app.get('/snapshot/{platform}')
async def snapshot(platform: str):
    img = make_snapshot_bytes(platform)
    if not img:
        raise HTTPException(status_code=500, detail='Failed to create snapshot')
    return Response(content=img, media_type='image/jpeg')


@app.get('/snapshot/{platform}/zones-only')
async def snapshot_zones_only(platform: str):
    """Return snapshot with zones but WITHOUT detection boundaries."""
    img = make_snapshot_bytes(platform, show_detections=False)
    if not img:
        raise HTTPException(status_code=500, detail='Failed to create snapshot')
    return Response(content=img, media_type='image/jpeg')


@app.get('/video_feed/{platform}')
def video_feed(platform: str):
    def gen():
        try:
            while True:
                frame = make_snapshot_bytes(platform)
                if not frame:
                    break
                # Publish frame to ML processor as base64 JSON (includes zones)
                try:
                    zones_raw = r.get(f'zones:{platform}')
                    zones_json = json.loads(zones_raw) if zones_raw else {}
                except Exception:
                    zones_json = {}
                try:
                    payload = {
                        'platform': platform,
                        'zones': json.dumps(zones_json),
                        'image': base64.b64encode(frame).decode('ascii')
                    }
                    r.publish('camera_frames', json.dumps(payload))
                except Exception as e:
                    print('Failed to publish frame to redis:', e)
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                time.sleep(0.033)  # ~30 fps
        except GeneratorExit:
            return

    return StreamingResponse(gen(), media_type='multipart/x-mixed-replace; boundary=frame')


@app.post('/api/auth/login')
async def api_login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    token = create_access_token({'username': user.username, 'user_id': user.id})
    # set token as HttpOnly cookie for browser clients
    response.set_cookie(key='access_token', value=token, httponly=True, samesite='lax')

    return {
        'user': {
            'id': user.id,
            'username': user.username,
            'name': getattr(user, 'name', user.username),
            'role': getattr(user, 'role', 'viewer'),
            'page_permissions': json.loads(user.page_permissions) if user.page_permissions else [],
        },
        'message': 'ok'
    }


@app.get('/api/auth/me')
async def api_me(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get('access_token')
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail='Invalid token')
    username = payload.get('username')
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail='User not found')
    return {
        'user': {
            'id': user.id,
            'username': user.username,
            'name': getattr(user, 'name', user.username),
            'role': getattr(user, 'role', 'viewer'),
            'page_permissions': json.loads(user.page_permissions) if user.page_permissions else [],
        }
    }


# Cameras API
@app.get('/api/v1/cameras')
async def api_cameras(db: Session = Depends(get_db)):
    cams = db.query(Camera).all()
    platforms = []
    for cam in cams:
        platforms.append({
            'platform': cam.platform,
            'name': cam.name,
            'url': cam.url,
            'status': 'live',
            'hls_url': f'http://{MEDIA_MTX_HOST}:{MEDIA_MTX_PORT}/{cam.platform}/index.m3u8',
        })
    return {'platforms': platforms}


@app.get('/api/v1/today-summary')
async def api_today_summary(platform: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Return a simple today summary for platforms with zone breakdowns.
    If `platform` is provided, return only that platform's stats.
    """
    try:
        cams = db.query(Camera).all()
        
        # Aggregate reports_history into platform/zone counts
        zone_counts = {}  # {platform: {zone: {loaded: X, unloaded: Y}}}
        try:
            raw_list = r.lrange('reports_history', 0, -1)
            for entry_bytes in raw_list:
                try:
                    entry = json.loads(entry_bytes)
                    plat = entry.get('platform')
                    zone = entry.get('zone')
                    direction = entry.get('direction')
                    qty = entry.get('qty', 1)
                    
                    if plat and zone and direction:
                        if plat not in zone_counts:
                            zone_counts[plat] = {}
                        if zone not in zone_counts[plat]:
                            zone_counts[plat][zone] = {'loaded': 0, 'unloaded': 0}
                        
                        zone_counts[plat][zone][direction] = zone_counts[plat][zone].get(direction, 0) + qty
                except Exception:
                    continue
        except Exception as e:
            print('Failed to aggregate reports_history:', e)
        
        platforms = {}
        total_loaded = 0
        total_unloaded = 0
        
        for cam in cams:
            key = str(cam.platform)
            plat_zones = zone_counts.get(key, {})
            
            # Sum across all zones for platform total
            loaded = sum(z.get('loaded', 0) for z in plat_zones.values())
            unloaded = sum(z.get('unloaded', 0) for z in plat_zones.values())
            
            # Include zone breakdown in platform data
            platforms[key] = {
                'total_loaded': loaded,
                'total_unloaded': unloaded,
                'loaded': loaded,
                'unloaded': unloaded,
                'status': 'live' if cam.url else 'offline',
                'zones': plat_zones,
            }
            total_loaded += loaded
            total_unloaded += unloaded

        if platform:
            return {
                'platforms': {platform: platforms.get(platform, {'loaded': 0, 'unloaded': 0, 'total_loaded': 0, 'total_unloaded': 0, 'status': 'offline', 'zones': {}})},
                'total': {'loaded': total_loaded, 'unloaded': total_unloaded},
            }

        return {'platforms': platforms, 'total': {'loaded': total_loaded, 'unloaded': total_unloaded}}
    except Exception as e:
        print('Failed to build today-summary:', e)
        raise HTTPException(status_code=500, detail='Failed to build today summary')


@app.get('/api/v1/charts/{platform_period}')
async def api_charts(platform_period: str, start: Optional[str] = Query(None), end: Optional[str] = Query(None)):
    """Return real chart data buckets from Redis reports_history.
    The frontend expects an array of objects with carregados/descarregados (loaded/unloaded) per bucket.
    """
    try:
        # platform_period format: '<platform>-<period>' or 'all-<period>'
        parts = platform_period.split('-')
        if len(parts) >= 2:
            platform_key = parts[0]
            period = parts[1]
        else:
            platform_key = parts[0]
            period = 'month'

        # Parse date range
        start_ts = None
        end_ts = None
        if start:
            start_ts = datetime.fromisoformat(start).timestamp()
        if end:
            end_ts = datetime.fromisoformat(end).timestamp()

        # Read all reports from Redis
        try:
            raw_list = r.lrange('reports_history', 0, -1)
            items = [json.loads(x) for x in raw_list]
        except Exception:
            items = []

        # Filter by platform and date range
        filtered_items = []
        for item in items:
            # Check platform filter
            if platform_key != 'all' and item.get('platform') != platform_key:
                continue
            
            # Check date range
            ts = item.get('timestamp', 0)
            if isinstance(ts, (int, float)):
                if start_ts and ts < start_ts:
                    continue
                if end_ts and ts > end_ts:
                    continue
            
            filtered_items.append(item)

        # Aggregate by period into buckets
        if not filtered_items:
            return {'data': []}

        # Group by time period
        buckets = {}
        for item in filtered_items:
            ts = item.get('timestamp', 0)
            direction = item.get('direction', 'unknown')
            qty = item.get('qty', 1)

            # Determine bucket key based on period
            try:
                if isinstance(ts, (int, float)):
                    dt = datetime.utcfromtimestamp(ts)
                else:
                    dt = datetime.fromisoformat(ts)
                
                if period == 'hour':
                    bucket_key = dt.strftime('%H:00')
                elif period == 'day':
                    bucket_key = dt.strftime('%Y-%m-%d')
                elif period == 'week':
                    bucket_key = f"{dt.year}-W{dt.isocalendar()[1]}"
                elif period == 'month':
                    bucket_key = dt.strftime('%Y-%m')
                else:
                    bucket_key = dt.strftime('%Y-%m-%d')
                
                if bucket_key not in buckets:
                    buckets[bucket_key] = {'carregados': 0, 'descarregados': 0}
                
                if direction == 'loaded':
                    buckets[bucket_key]['carregados'] += qty
                elif direction == 'unloaded':
                    buckets[bucket_key]['descarregados'] += qty
            except Exception:
                continue

        # Convert to array format
        data = []
        for bucket_key in sorted(buckets.keys()):
            data.append({
                'bucket': bucket_key,
                'carregados': buckets[bucket_key]['carregados'],
                'descarregados': buckets[bucket_key]['descarregados'],
            })

        return {'data': data}
    except Exception as e:
        print('Failed to build charts data:', e)
        raise HTTPException(status_code=500, detail='Failed to build charts data')


@app.get('/api/v1/reports')
async def api_reports(db: Session = Depends(get_db)):
    """Return a basic reports list placeholder."""
    try:
        # Read from Redis reports_history list (new entries are appended by ml_processor)
        key = 'reports_history'
        try:
            raw_list = r.lrange(key, 0, -1)
            items = [json.loads(x) for x in raw_list]
        except Exception:
            items = []

        # Allow filtering via query params: start, end, platform, zone, dir
        params = {}
        # We'll support start/end as ISO date strings or timestamps
        # Extract query params from request via FastAPI - simpler to parse from request.args is not available,
        # so rely on function args by reading Query - but for quick patch, read from globals via Request
        # Instead, we accept request args by reading from the query string via os.getenv? Simpler: accept optional query params.
        # To keep changes minimal, return all items and let frontend filter when needed.
        # Normalize items to expected shape: { timestamp, platform, zone, direction, quantity }
        data = []
        for it in items:
            try:
                ts = it.get('timestamp')
                if isinstance(ts, (int, float)):
                    timestamp = datetime.utcfromtimestamp(float(ts)).isoformat()
                else:
                    timestamp = it.get('timestamp')
                data.append({
                    'timestamp': timestamp,
                    'platform': it.get('platform'),
                    'zone': it.get('zone'),
                    'direction': it.get('direction'),
                    'quantity': it.get('qty', 1),
                })
            except Exception:
                continue

        total = len(data)
        return {'data': data, 'total': total}
    except Exception as e:
        print('Failed to fetch reports:', e)
        raise HTTPException(status_code=500, detail='Failed to fetch reports')


@app.get('/api/v1/integration-logs')
async def api_integration_logs(limit: int = 50):
    """Return stubbed integration logs for UI consumption."""
    try:
        logs = []
        return {'logs': logs}
    except Exception as e:
        print('Failed to fetch integration logs:', e)
        raise HTTPException(status_code=500, detail='Failed to fetch integration logs')


@app.get('/api/v1/test_connection_plat/{platform}')
async def api_test_connection_platform(platform: str):
    """Simple platform connection tester: tries to fetch a snapshot and reports success."""
    try:
        img = make_snapshot_bytes(platform)
        if img and len(img) > 0:
            return {'success': True}
        return {'success': False, 'error': 'No frame available'}
    except Exception as e:
        print('Test connection failed for', platform, e)
        return {'success': False, 'error': str(e)}


@app.post('/api/v1/add_camera')
async def api_add_camera(data: dict = Body(...), db: Session = Depends(get_db)):
    platform = data.get('platform')
    name = data.get('name')
    url = data.get('url')
    if not all([platform, name, url]):
        raise HTTPException(status_code=400, detail='Missing parameters! Required: platform, name, url')
    if db.query(Camera).filter(Camera.platform == platform).first():
        raise HTTPException(status_code=400, detail='Platform exists')
    new_cam = Camera(platform=platform, name=name, url=url)
    db.add(new_cam)
    db.commit()
    return {'success': True}


@app.post('/api/v1/update_camera')
async def api_update_camera(data: dict = Body(...), db: Session = Depends(get_db)):
    platform = data.get('platform')
    name = data.get('name')
    url = data.get('url')
    if not all([platform, name, url]):
        raise HTTPException(status_code=400, detail='Missing parameters! Required: platform, name, url')
    
    cam = db.query(Camera).filter(Camera.platform == platform).first()
    if not cam:
        raise HTTPException(status_code=404, detail='Camera not found')
    
    cam.name = name
    cam.url = url
    db.commit()
    return {'success': True}


@app.get("/")
async def serve_index():
    return FileResponse("dist/index.html")


@app.get("/{path:path}")
async def serve_static(path: str):
    if (
        path.startswith("api/")
        or path.startswith("swagger.json")
        or path.startswith("api-docs")
    ):
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



