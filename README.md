Dash — Cylinder tracking (FastAPI + React)

Resumo
• Aplicação para monitoramento em tempo‑real de carregamento/descarga de cilindros usando YOLO.
• Backend: FastAPI (Python). Frontend: React + Vite. Stream ingest via MediaMTX (HLS) e snapshots/MJPEG servidos pelo backend.

Principais componentes
• server.py — API (endpoints de câmera, zonas, snapshots, MJPEG, autenticação, WebSocket).
• ml_processor.py — consumidor de frames, executa YOLO e publica contagens/detections no Redis.
• src/ — frontend (Vite + React + TypeScript).
• mediamtx_conf/ — configuração do MediaMTX (HLS server).
• last.pt — modelo YOLO (colocar aqui o arquivo do modelo).

Quickstart (desenvolvimento)
1) Pré-requisitos
   - Linux x86_64
   - Python 3.10+ (recomendo 3.11)
   - Node.js 18+ (npm)
   - Podman / Docker (opcional para MediaMTX)
   - Redis (local ou container)

2) Backend (venv)
   python -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install fastapi uvicorn[standard] sqlalchemy redis pillow opencv-python-headless ultralytics python-multipart pydantic[dotenv]

   Observação: não há requirements.txt autoritativo neste repositório — os pacotes acima refletem dependências usadas pelo projeto.

3) Frontend
   cd ./src || (na raíz do repo)
   npm ci
   npm run dev            # ambiente de desenvolvimento
   npm run build          # produção (gera /dist)

4) Serviços necessários
   - Redis: padrão em redis://localhost:6379
   - MediaMTX: responsável por ingerir RTSP e expor HLS (padrão :8888)
     Exemplo (podman/docker):
       podman run -d --name mediamtx \
         -p 8888:8888 \
         -v $(pwd)/mediamtx_conf/mediamtx.yml:/etc/mediamtx/mediamtx.yml:Z \
         -v $(pwd)/hls:/var/lib/mediamtx/hls:Z \
         -v $(pwd)/test.mjpeg:/var/lib/mediamtx/test.mjpeg:Z \
         coturn/rtsp-simple-server:latest

5) Arquivos importantes de configuração
   - `config.py` — variáveis sobrescritíveis por ENV (PORT, REDIS_URL, DB_PATH, etc.)
   - `mediamtx_conf/mediamtx.yml` — configuração do MediaMTX (HLS)
   - `last.pt` — modelo YOLO (colocar na raiz ou atualizar caminho em `ml_processor.py`)

Execução (produção - mínima)
1) Inicie Redis e MediaMTX
2) Backend (production):
   source .venv/bin/activate
   uvicorn server:app --host 0.0.0.0 --port 5000 --workers 1 --proxy-headers

3) ML processor (separado):
   source .venv/bin/activate
   python ml_processor.py --config <opcional>

4) Frontend (servir estático):
   npm run build
   servir `dist/` por nginx, caddy ou qualquer CDN

Exemplo rápido com Podman (uma instância):
# build backend image
podman build -t dash-cilindro-backend -f- . <<'EOF'
FROM python:3.11-slim
WORKDIR /app
COPY . /app
RUN python -m pip install --upgrade pip && \
    pip install fastapi uvicorn[standard] sqlalchemy redis pillow opencv-python-headless ultralytics
EXPOSE 5000
CMD ["uvicorn","server:app","--host","0.0.0.0","--port","5000"]
EOF

# run (assume redis + mediamtx já rodando)
podman run -d --name dash-api --net host -v $(pwd):/app:Z dash-cilindro-backend

Endpoints principais (rápido)
• GET /video_feed/{platform}        — MJPEG stream (contains zones + detections)
• GET /snapshot/{platform}         — single JPEG (with detections)
• GET /snapshot/{platform}/zones-only — single JPEG with zones only (editor)
• GET /get_zones/{platform}        — retorna zonas configuradas
• POST /set_zones/{platform}       — grava zonas
• GET /api/v1/today-summary        — KPIs do dia
• POST /api/v1/add_camera          — adicionar câmera
• POST /api/v1/update_camera       — atualizar câmera (adicionado recentemente)

Tamanho/escala das imagens
• Por padrão o snapshot gerado tem 1020×600 (ver `server.py` e `ml_processor.py`).
• O frontend redimensiona para caber nos cards; ajuste CSS em `src/components/VideoStream.tsx` e `PlatformGrid.tsx` se necessário.

Debug / checks rápidos
• Snapshot (zones-only):
  curl -v http://127.0.0.1:5000/snapshot/platform1/zones-only --output snapshot.jpg
• MJPEG (teste):
  curl http://127.0.0.1:5000/video_feed/platform1 | head -c 2000 > /tmp/mjpeg.head
• Verificar Redis (zonas):
  redis-cli GET "zones:platform1"
• Logs ML: rode `python ml_processor.py` manualmente e observe detecções/prints

Problemas comuns
• Tela em branco no editor de zonas — verifique `GET /snapshot/{platform}/zones-only` (backend) e permissões do CORS / cookie de sessão.
• Boundaries aparecem no modal mas não no dashboard — o dashboard usa o MJPEG gerado pelo servidor; confirme que `VideoStream` está carregando `/video_feed/{platform}` (frontend) e que `ml_processor.py` está publicando detections no Redis.

Onde alterar a resolução do snapshot
• `server.py`: procurar `w, h = 1020, 600` e ajustar conforme necessário; lembre-se de também ajustar `ZoneMappingModal.tsx` (usa 1020 como referência para coordenadas).

Deploy contínuo / systemd (exemplo de service)
[Unit]
Description=Cylinder Dashboard (uvicorn)
After=network.target redis.service

[Service]
User=www-data
WorkingDirectory=/srv/dash-cilindro
Environment="PATH=/srv/dash-cilindro/.venv/bin"
ExecStart=/srv/dash-cilindro/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 5000
Restart=on-failure

[Install]
WantedBy=multi-user.target

Contribuições / desenvolvimento
• Frontend: `src/` — componentes React + Tailwind
• Backend: `server.py`, `ml_processor.py`
• Testes manuais: `curl /snapshot/platform1` e abra a UI em `http://localhost:5173` (dev)

Licença
Veja `LICENSE` no repositório.

----
Notas rápidas:
• O `public/` contém a spec OpenAPI estática (`swagger.json`) usada pelo cliente — atualizei lá a rota `GET /snapshot/{platform}/zones-only`.
• Se quiser, eu adiciono um `requirements.txt` e um `docker-compose.yml`/`podman-compose.yml` com serviços (redis, mediamtx, api, ml).
