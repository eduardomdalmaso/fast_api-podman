import os

# Allow overriding via environment for containerized deployments
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///data.db")
# Keep SECRET_KEY for JWT (dev). For stronger production keys, replace this value.
# Use a longer key (>=32 chars) to avoid InsecureKeyLengthWarning from PyJWT.
SECRET_KEY = "dev-long-secret-key-please-change-in-production-2026-abcdefghijkl"
# Match frontend default development API key so requests from the built frontend are accepted.
# Frontend uses VITE_API_KEY fallback 'cylinder-api-secret-2026' when env not set.
API_KEY = "cylinder-api-secret-2026"
MODEL_PATH = "last.pt"
