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
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from starlette.responses import FileResponse, Response
import os
import json
from datetime import datetime, timedelta
import jwt
import redis
import bcrypt
from sqlalchemy.orm import Session
from config import REDIS_URL, SECRET_KEY, API_KEY
from models import SessionLocal, User, Camera, AccessLog
from fastapi_socketio import SocketManager  # Para SocketIO
from typing import Optional
from contextlib import asynccontextmanager

# Configurações
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


# lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
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
        # Register existing cameras with go2rtc so streams are available immediately
        try:
            GO2RTC_URL = os.environ.get("GO2RTC_URL", "http://go2rtc:1984")
            cams = db.query(Camera).all()
            # Send a single PUT mapping of platform->url to go2rtc (API expects a mapping)
            streams_map = {cam.platform: cam.url for cam in cams}
            if streams_map:
                try:
                    resp = requests.put(
                        f"{GO2RTC_URL}/api/streams",
                        json=streams_map,
                        timeout=5,
                    )
                    if resp.status_code in (200, 201):
                        print(f"[INFO] Registered {len(streams_map)} streams with go2rtc")
                    else:
                        print(f"[WARN] go2rtc bulk register -> {resp.status_code}: {resp.text}")
                except Exception as e:
                    print(f"[WARN] failed to register streams with go2rtc: {e}")
        except Exception as e:
            print(f"[WARN] go2rtc bulk registration failed: {e}")
        if not db.query(Camera).first():
            cam1 = Camera(
                platform="platform1",
                name="Platform 1",
                url="rtsp://admin:airlab@200.123.238.98:554/cam/realmonitor?channel=8&subtype=0",
                zones="{}",
            )
            cam2 = Camera(
                platform="platform2", name="Platform 2", url="rtsp://...", zones="{}"
            )
            db.add(cam1)
            db.add(cam2)
            db.commit()
    finally:
        db.close()
    yield


# App
app = FastAPI(lifespan=lifespan)

# SocketIO
# SocketIO
supported_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    # Allow nginx-hosted frontend via host port mapping
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

# Configure root logging so engineio/socketio debug messages appear in the server logs
logging.basicConfig(level=logging.DEBUG)

# For local/dev convenience allow all origins for Socket.IO handshakes.
# In production, replace with a specific list for safety.
sio = SocketManager(
    app,
    cors_allowed_origins="*",
    engineio_logger=True,
    logger=True,
    async_mode="asgi",
    mount_location="/socket.io",
)

# Ensure engineio/socketio loggers are verbose for handshake diagnostics
import logging as _logging
_logging.getLogger("engineio").setLevel(_logging.DEBUG)
_logging.getLogger("socketio").setLevel(_logging.DEBUG)


# Socket.IO connect/disconnect handlers for debugging
@sio.on("connect")
def _on_connect(sid, environ):
    origin = environ.get("HTTP_ORIGIN") or environ.get("origin")
    print(f"[SOCKET] connect attempt sid={sid} origin={origin} path={environ.get('PATH_INFO')}")


@sio.on("disconnect")
def _on_disconnect(sid):
    print(f"[SOCKET] disconnect sid={sid}")

# Mount static files
app.mount("/dist", StaticFiles(directory="dist"), name="dist")

# CORS
app.add_middleware(
    CORSMiddleware,
    # Allow all origins in dev; restrict in production as appropriate.
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis
r = redis.Redis.from_url(REDIS_URL)

# Security
security = HTTPBearer()


# DB Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# JWT Functions
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


# Auth Dependency
def get_current_user(request: Request, db: Session = Depends(get_db)):
    """
    Resolve current user from either:
      - Authorization: Bearer <token> header, OR
      - HttpOnly cookie named `access_token`.
    This allows the frontend to store the JWT in an HttpOnly cookie so
    browser image/video tags and other requests send the token implicitly.
    """
    # Prefer Authorization header when present
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split()[1]
    else:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = payload.get("sub")
    # payload sub is stored as string
    try:
        uid = int(user_id)
    except Exception:
        uid = None
    user = db.query(User).filter(User.id == uid).first() if uid else None
    if not user or user.active == False:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def admin_required(user: User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_api_key(request: Request):
    if request.headers.get("X-API-Key") != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


def log_action(
    db: Session, action: str, details: str = "", user: User = None, ip: str = ""
):
    log = AccessLog(
        user_id=user.id if user else None,
        username=user.username if user else "guest",
        action=action,
        details=details,
        ip=ip,
    )
    db.add(log)
    db.commit()


# Password Utils
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("latin-1"), bcrypt.gensalt()).decode("latin-1")


def verify_password(plain_password: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("latin-1"), hashed.encode("latin-1"))


# Pydantic Models
class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str
    password: str


# Listener para resultados do ML (em background)
def ml_results_listener():
    pubsub = r.pubsub()
    pubsub.subscribe("processed_counts")
    for message in pubsub.listen():
        if message["type"] == "message":
            counts_data = json.loads(message["data"])
            # Emite via SocketIO para o frontend
            # Exemplo: atualiza dashboard com counts
            sio.emit("dashboard_update", counts_data)  # Ajuste conforme necessário
            print(f"Received ML counts: {counts_data}")


# Inicie listener em background
import threading

threading.Thread(target=ml_results_listener, daemon=True).start()


# NOTE: frontend-serving routes are registered at the end of the file
# to avoid intercepting API routes. They are added after all API
# endpoints so the router will match API paths first.


# Swagger UI
@app.get("/api-docs")
async def api_docs_index(request: Request):
    referer = request.headers.get("Referer", "")
    host = request.headers.get("host", "")
    if not referer or host not in referer:
        raise HTTPException(status_code=404)
    file_path = os.path.join(os.getcwd(), "dist", "api-docs", "index.html")
    return FileResponse(file_path)


@app.get("/api-docs/{subpath:path}")
async def api_docs_files(subpath: str, request: Request):
    referer = request.headers.get("Referer", "")
    host = request.headers.get("host", "")
    if not referer or host not in referer:
        raise HTTPException(status_code=404)
    file_path = os.path.join(os.getcwd(), "dist", "api-docs", subpath)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404)


@app.get("/swagger.json")
async def serve_swagger_json(request: Request):
    referer = request.headers.get("Referer", "")
    if "/api-docs" not in referer:
        raise HTTPException(status_code=404)
    file_path = os.path.join(os.getcwd(), "dist", "swagger.json")
    return FileResponse(file_path)


# Auth Endpoints
@app.post("/api/auth/login")
async def api_login(request: LoginRequest, req: Request, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()
    if user and verify_password(request.password, user.password_hash) and user.active:
        token = create_access_token({"sub": str(user.id)})
        # Cache user in Redis
        r.setex(
            f"user_session:{user.id}",
            3600,
            json.dumps(
                {
                    "id": user.id,
                    "username": user.username,
                    "role": user.role,
                    "page_permissions": user.page_permissions,
                }
            ),
        )
        log_action(
            db,
            "login_success",
            f"User {user.username} logged in",
            user,
            req.client.host,
        )
        # Set token as HttpOnly cookie so browser will send it automatically
        response.set_cookie(
            key="access_token",
            value=token,
            httponly=True,
            samesite="lax",
            path="/",
            max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
        return {
            "user": {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "page_permissions": json.loads(user.page_permissions),
            },
            "token": token,
        }
    log_action(
        db,
        "login_failed",
        f"Failed login for {request.username}",
        None,
        req.client.host,
    )
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/api/auth/logout")
async def api_logout(response: Response, user: User = Depends(get_current_user)):
    r.delete(f"user_session:{user.id}")
    # Remove cookie
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def api_auth_me(user: User = Depends(get_current_user)):
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "page_permissions": json.loads(user.page_permissions),
        }
    }


@app.post("/signup")
async def signup(request: SignupRequest, req: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == request.username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    hashed = hash_password(request.password)
    new_user = User(
        username=request.username,
        password_hash=hashed,
        role="viewer",
        page_permissions="[]",
    )
    db.add(new_user)
    db.commit()
    log_action(
        db, "signup", f"New viewer user: {request.username}", None, req.client.host
    )
    return {"message": "Signup successful"}


@app.get("/forgot_password")
async def forgot_password():
    return {"message": "Contact support"}


# Reports and Data (Stubbed, integrate with DB later)
@app.get("/get_report_data")
async def get_report_data(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    log_action(db, "view_report", "Accessed report data", user)
    return {"data": []}  # Stub


@app.get("/api/v1/counts")
async def api_counts(_: bool = Depends(require_api_key)):
    return {"data": []}  # Stub


@app.get("/api/v1/platforms")
async def api_platforms(
    _: bool = Depends(require_api_key), db: Session = Depends(get_db)
):
    cameras = db.query(Camera).all()
    return {cam.platform: cam.name for cam in cameras}


@app.get("/api/v1/reports")
async def api_reports(_: bool = Depends(require_api_key)):
    return {"data": [], "total": 0}  # Stub


@app.post("/api/v1/record_counts")
async def api_record_counts(_: bool = Depends(require_api_key)):
    return {"success": True, "inserted": 0}  # Stub


@app.post("/api/v1/reports/export/{fmt}")
async def api_reports_export(fmt: str, _: bool = Depends(require_api_key)):
    if fmt not in ["csv", "excel", "pdf"]:
        raise HTTPException(status_code=400)
    return {"error": "Not implemented"}  # Stub


@app.get("/api/v1/integration-logs")
async def api_integration_logs(
    _: bool = Depends(require_api_key), db: Session = Depends(get_db)
):
    logs = db.query(AccessLog).order_by(AccessLog.timestamp.desc()).limit(100).all()
    data = [
        {
            "id": log.id,
            "date": log.timestamp.isoformat(),
            "system": log.action,
            "message": log.details or "",
            "status": "success" if log.details else "error",
            "user": log.username,
            "ip": log.ip,
        }
        for log in logs
    ]
    return {"data": data, "total": len(data)}


@app.get("/api/v1/today-summary")
async def api_today_summary(_: bool = Depends(require_api_key)):
    return {"platforms": {}, "total": {"loaded": 0, "unloaded": 0}}  # Stub


@app.get("/api/v1/charts/{platform_period}")
async def api_charts(platform_period: str, _: bool = Depends(require_api_key)):
    return {"data": []}  # Stub


# Camera Management
@app.get("/api/v1/cameras")
async def api_cameras(
    _: bool = Depends(require_api_key), db: Session = Depends(get_db)
):
    cameras = db.query(Camera).all()
    # Debug logging to help trace why frontend may not see cameras
    try:
        cam_list = [c.platform for c in cameras]
        print(f"[DEBUG] /api/v1/cameras called - found {len(cameras)} cameras: {cam_list}")
    except Exception as e:
        print(f"[DEBUG] /api/v1/cameras - error enumerating cameras: {e}")
    platforms = [
        {"platform": cam.platform, "name": cam.name, "url": cam.url, "status": "live"}
        for cam in cameras
    ]
    return {"platforms": platforms}


@app.post("/api/v1/add_camera")
async def api_add_camera(
    data: dict,
    _: bool = Depends(require_api_key),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    if db.query(Camera).filter(Camera.platform == data["platform"]).first():
        raise HTTPException(status_code=400, detail="Platform exists")
    new_cam = Camera(platform=data["platform"], name=data["name"], url=data["url"])
    db.add(new_cam)
    db.commit()
    log_action(db, "add_camera", f"Added {data['platform']}", user)
    # Try registering the stream with go2rtc so it can convert RTSP -> WebRTC/HLS
    GO2RTC_URL = os.environ.get("GO2RTC_URL", "http://127.0.0.1:1984")
    go2rtc_result = None
    try:
        # Use PUT with a mapping {platform: url} to register the stream
        resp = requests.put(
            f"{GO2RTC_URL}/api/streams",
            json={data["platform"]: data["url"]},
            timeout=5,
        )
        if resp.status_code in (200, 201):
            go2rtc_result = {"ok": True, "status_code": resp.status_code}
        else:
            go2rtc_result = {"ok": False, "status_code": resp.status_code, "text": resp.text}
    except Exception as e:
        go2rtc_result = {"ok": False, "error": str(e)}

    return {"success": True, "go2rtc": go2rtc_result}


@app.post("/api/v1/update_camera")
async def api_update_camera(
    data: dict,
    _: bool = Depends(require_api_key),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    cam = db.query(Camera).filter(Camera.platform == data["platform"]).first()
    if not cam:
        raise HTTPException(status_code=404)
    cam.name = data["name"]
    cam.url = data["url"]
    db.commit()
    log_action(db, "update_camera", f"Updated {cam.platform}", user)
    return {"success": True}


@app.post("/api/v1/delete_camera")
async def api_delete_camera(
    data: dict = Body(...),
    _: bool = Depends(require_api_key),
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    print(f"[DEBUG] /api/v1/delete_camera called by {user.username} with data={data}")
    platform = data.get("platform")
    if not platform:
        raise HTTPException(status_code=400, detail="Missing 'platform' in request body")
    cam = db.query(Camera).filter(Camera.platform == platform).first()
    if cam:
        db.delete(cam)
        db.commit()
        log_action(db, "delete_camera", f"Deleted {cam.platform}", user)
        # Try to remove stream from go2rtc as well
        GO2RTC_URL = os.environ.get("GO2RTC_URL", "http://127.0.0.1:1984")
        try:
            resp = requests.delete(f"{GO2RTC_URL}/api/streams/{platform}", timeout=5)
            if resp.status_code not in (200, 204):
                print(f"[WARN] go2rtc delete returned {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[WARN] failed to notify go2rtc about deletion: {e}")
        return {"success": True}
    raise HTTPException(status_code=404, detail="Camera not found")


# User Management
@app.get("/api/v1/users")
async def api_get_users(
    user: User = Depends(admin_required), db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "active": u.active,
                "page_permissions": json.loads(u.page_permissions),
            }
            for u in users
        ]
    }


@app.get("/api/v1/viewer_users")
async def api_get_viewer_users(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # Viewers can only see themselves
    return {
        "users": [
            {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "active": user.active,
                "page_permissions": json.loads(user.page_permissions),
            }
        ]
    }


@app.post("/api/v1/add_user")
async def api_add_user(
    data: dict, user: User = Depends(admin_required), db: Session = Depends(get_db)
):
    if db.query(User).filter(User.username == data["username"]).first():
        raise HTTPException(status_code=400, detail="Username exists")
    hashed = hash_password(data["password"])
    perms = json.dumps(data.get("page_permissions", []))
    new_user = User(
        username=data["username"],
        password_hash=hashed,
        role=data["role"],
        active=data.get("active", True),
        page_permissions=perms,
    )
    db.add(new_user)
    db.commit()
    log_action(db, "add_user", f"Created {data['username']}", user)
    return {"success": True}


@app.post("/api/v1/update_user")
async def api_update_user(
    data: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    uid = data["id"]
    target_user = db.query(User).filter(User.id == uid).first()
    if not target_user:
        raise HTTPException(status_code=404)
    if user.role != "admin" and uid != user.id:
        raise HTTPException(status_code=403)
    if "password" in data:
        target_user.password_hash = hash_password(data["password"])
    if user.role == "admin":
        target_user.role = data.get("role", target_user.role)
        target_user.active = data.get("active", target_user.active)
        target_user.page_permissions = json.dumps(
            data.get("page_permissions", json.loads(target_user.page_permissions))
        )
    db.commit()
    log_action(db, "update_user", f"Updated user {uid}", user)
    return {"success": True}


@app.post("/api/v1/delete_user")
async def api_delete_user(
    data: dict, user: User = Depends(admin_required), db: Session = Depends(get_db)
):
    uid = data["id"]
    if uid == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete self")
    target_user = db.query(User).filter(User.id == uid).first()
    if target_user:
        db.delete(target_user)
        db.commit()
        log_action(db, "delete_user", f"Deleted {target_user.username}", user)
    return {"success": True}


# ML Integration: Novo endpoint para processar frame via Redis
@app.post("/process_frame/{platform}")
async def process_frame(
    platform: str,
    data: dict = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Capture um frame (simulado: mock bytes; em produção, capture da câmera)
    mock_frame_bytes = (
        b"mock_frame_data"  # Substitua por captura real (ex.: cv2.imread ou stream)
    )
    zones = get_zones(platform, user, db)  # Reuse função existente
    # Publique no Redis para o ML processar
    r.publish(
        "camera_frames",
        json.dumps(
            {
                "platform": platform,
                "frame": mock_frame_bytes.decode("latin-1"),
                "zones": zones,
            }
        ),
    )
    return {"status": "Frame sent to ML"}


# Other Stubs
@app.get("/snapshot/{platform}")
async def snapshot(platform: str, user: User = Depends(get_current_user)):
    return Response(content=b"mock image", media_type="image/jpeg")


@app.get("/video_feed/{platform}")
async def video_feed(
    platform: str,
    request: Request,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Serve a mocked video feed. Browsers won't send Authorization headers for <img/src> requests,
    so we accept either:
      - Authorization: Bearer <token> header (normal flow), OR
      - `token` query parameter with a valid JWT, OR
      - X-API-Key header matching API_KEY (dev fallback)

    Note: passing JWT in query params is a convenience for local/dev only — treat as insecure
    for production unless you implement short-lived tokens and HTTPS.
    """
    # Allow API key for dev flows
    if request.headers.get("X-API-Key") == API_KEY:
        auth_user = None
        used = "api_key"
    else:
        # Try Authorization header, then cookie, then token query param
        auth_header = request.headers.get("Authorization")
        payload = None
        used = None
        if auth_header and auth_header.startswith("Bearer "):
            payload = verify_token(auth_header.split()[1])
            used = "auth_header"
        if not payload:
            cookie_token = request.cookies.get("access_token")
            if cookie_token:
                payload = verify_token(cookie_token)
                used = "cookie"
        if not payload and token:
            payload = verify_token(token)
            used = "query_token"
        if not payload:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = payload.get("sub")
        try:
            uid = int(user_id)
        except Exception:
            uid = None
        auth_user = db.query(User).filter(User.id == uid).first() if uid else None
        if not auth_user or auth_user.active == False:
            raise HTTPException(status_code=401, detail="User not found or inactive")
    print(f"[DEBUG] /video_feed auth method={used} auth_user={getattr(auth_user,'username',None)}")

    print(f"[DEBUG] /video_feed serving platform={platform} auth_user={getattr(auth_user,'username',None)}")
    return Response(
        content=b"mock stream", media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/get_zones/{platform}")
async def get_zones(
    platform: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    cam = db.query(Camera).filter(Camera.platform == platform).first()
    return json.loads(cam.zones) if cam else {}


@app.post("/set_zones/{platform}")
async def set_zones(
    platform: str,
    data: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cam = db.query(Camera).filter(Camera.platform == platform).first()
    if not cam:
        raise HTTPException(status_code=404)
    cam.zones = json.dumps(data)
    db.commit()
    # Emit via SocketIO
    await sio.emit("zones_update", {"platform": platform, "zones": data})
    return {"ok": True}


@app.get("/get_camera/{platform}")
async def get_camera(
    platform: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    cam = db.query(Camera).filter(Camera.platform == platform).first()
    return {"name": cam.name, "url": cam.url} if cam else {}


@app.get("/test_connection")
async def test_connection(
    url: str = Query(...), user: User = Depends(get_current_user)
):
    return {"success": True}


@app.get("/test_connection_plat/{plat}")
async def test_connection_plat(plat: str, user: User = Depends(get_current_user)):
    return {"success": True}


# API-compatible endpoints (frontend uses /api/v1/* paths)
@app.get("/api/v1/test_connection")
async def api_test_connection(url: str = Query(...), user: User = Depends(get_current_user)):
    # Reuse existing test_connection logic (stubbed to always succeed for now)
    return await test_connection(url=url, user=user)


@app.get("/api/v1/test_connection_plat/{plat}")
async def api_test_connection_plat(
    plat: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # Find camera by platform and reuse test_connection logic
    cam = db.query(Camera).filter(Camera.platform == plat).first()
    if not cam:
        return {"success": False, "error": "Camera not found"}
    return await test_connection(url=cam.url, user=user)

# Serve Frontend (ensure these are registered before the server starts)
@app.get("/")
async def serve_index():
    return FileResponse("dist/index.html")


@app.get("/{path:path}")
async def serve_static(path: str):
    # Prevent the catch-all from intercepting API or docs routes
    if path.startswith("api/") or path.startswith("swagger.json") or path.startswith("api-docs"):
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
