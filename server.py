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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("latin-1"), bcrypt.gensalt()).decode("latin-1")


def verify_password(plain_password: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("latin-1"), hashed.encode("latin-1"))


class LoginRequest(BaseModel):
    username: str
    password: str


def ml_results_listener():
    pubsub = r.pubsub()
    pubsub.subscribe("processed_counts")
    for message in pubsub.listen():
        if message["type"] == "message":
            counts_data = json.loads(message["data"])
            sio.emit("dashboard_update", counts_data)
            print(f"Received ML counts: {counts_data}")


threading.Thread(target=ml_results_listener, daemon=True).start()

# ========== API DE CÂMERAS COM RETORNO MediaMTX HLS ==========


@app.get("/api/v1/cameras")
async def api_cameras(db: Session = Depends(get_db)):
    cameras = db.query(Camera).all()
    platforms = [
        {
            "platform": cam.platform,
            "name": cam.name,
            "url": cam.url,
            "status": "live",
            # MediaMTX serves HLS at /{path}/index.m3u8 (not /hls/{path}/...)
            "hls_url": f"http://{MEDIA_MTX_HOST}:{MEDIA_MTX_PORT}/{cam.platform}/index.m3u8",
        }
        for cam in cameras
    ]
    return {"platforms": platforms}


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
    new_cam = Camera(platform=platform, name=name, url=url)
    db.add(new_cam)
    db.commit()
    return {"success": True}


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
        raise HTTPException(status_code=404)
    cam.name = name
    cam.url = url
    db.commit()
    return {"success": True}


@app.post("/api/v1/delete_camera")
async def api_delete_camera(data: dict = Body(...), db: Session = Depends(get_db)):
    platform = data.get("platform") or data.get("id")
    if not platform:
        raise HTTPException(
            status_code=400, detail="Missing 'platform' or 'id' in request body"
        )
    cam = db.query(Camera).filter(Camera.platform == platform).first()
    if cam:
        db.delete(cam)
        db.commit()
        return {"success": True}
    raise HTTPException(status_code=404, detail="Camera not found")


@app.get("/api/v1/users")
async def api_get_users(db: Session = Depends(get_db)):
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


@app.post("/api/v1/add_user")
async def api_add_user(data: dict = Body(...), db: Session = Depends(get_db)):
    username = data.get("username")
    password = data.get("password")
    role = data.get("role")
    page_permissions = data.get("page_permissions", [])
    active = data.get("active", True)
    if not all([username, password, role]):
        raise HTTPException(
            status_code=400,
            detail="Missing parameters! Required: username, password, role",
        )
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username exists")
    hashed = hash_password(password)
    perms = json.dumps(page_permissions)
    new_user = User(
        username=username,
        password_hash=hashed,
        role=role,
        active=active,
        page_permissions=perms,
    )
    db.add(new_user)
    db.commit()
    return {"success": True}


@app.post("/api/v1/update_user")
async def api_update_user(data: dict = Body(...), db: Session = Depends(get_db)):
    uid = data.get("id") or data.get("user_id")
    if not uid:
        raise HTTPException(
            status_code=400, detail="Missing 'id' or 'user_id' in request body"
        )
    target_user = db.query(User).filter(User.id == uid).first()
    if not target_user:
        raise HTTPException(status_code=404)
    if "password" in data:
        target_user.password_hash = hash_password(data["password"])
    if "role" in data:
        target_user.role = data.get("role", target_user.role)
    if "active" in data:
        target_user.active = data.get("active", target_user.active)
    if "page_permissions" in data:
        target_user.page_permissions = json.dumps(
            data.get("page_permissions", json.loads(target_user.page_permissions))
        )
    db.commit()
    return {"success": True}


@app.post("/api/v1/delete_user")
async def api_delete_user(data: dict = Body(...), db: Session = Depends(get_db)):
    uid = data.get("id") or data.get("user_id")
    if not uid:
        raise HTTPException(
            status_code=400, detail="Missing 'id' or 'user_id' in request body"
        )
    target_user = db.query(User).filter(User.id == uid).first()
    if target_user:
        db.delete(target_user)
        db.commit()
    return {"success": True}


# ========== DASHBOARD / CHARTS / SUMMARY ENDPOINTS ==========
# Rotas para evitar 404 e também como base p/ buscar dados reais


@app.get("/api/v1/charts/all-month")
async def charts_all_month(db: Session = Depends(get_db)):
    # Exemplo: total de detecções por dia do mês atual, agrupando, se houver tabela Detection/Event
    # Aqui, retorna stub/vazio até implementar query real
    return {
        "data": [],  # Exemplo [{"day": "2024-01-01", "count": 5}, ...]
        "total": 0,
    }


@app.get("/api/v1/charts/{platform}-month")
async def charts_platform_month(platform: str, db: Session = Depends(get_db)):
    # Exemplo: total de detecções por dia no mês atual para a câmera
    # Query real a adaptar conforme schema/model
    return {
        "data": [],  # Exemplo [{"day": "2024-01-01", "count": 5}, ...]
        "total": 0,
    }


@app.get("/api/v1/today-summary")
async def today_summary(platform: str = "all", db: Session = Depends(get_db)):
    # Exemplo: sumarização dummy, personalize para suas tabelas de eventos
    return {
        "platform": platform,
        "counts": {"detections": 0, "alerts": 0, "other_metric": 0},
        "report_time": datetime.utcnow().isoformat(),
    }


@app.get("/api/v1/reports")
async def api_reports():
    return {"data": [], "total": 0}  # stub


@app.get("/api/v1/integration-logs")
async def api_integration_logs():
    return {"data": [], "total": 0}  # stub


@app.get("/api/v1/test_connection_plat/{plat}")
async def api_test_connection_plat(plat: str):
    return {"success": True}  # stub


# ========== FRONTEND STATIC ==========


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
