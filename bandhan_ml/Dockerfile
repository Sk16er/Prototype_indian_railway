# bandhan_ml/Dockerfile
# FastAPI BANDHAN scheduler / ML engine.
#
# Build context: project ROOT (not bandhan_ml/).
# Reason: bandhan_ml imports sibling packages (INDIAN_RAILWAYS-main is not needed,
# but the Python code uses relative paths that expect the repo root on sys.path).
# docker-compose.yml sets: context: .  dockerfile: bandhan_ml/Dockerfile
#
# Fixes vs. previous version:
#   - COPY ../requirements.txt was broken when context=./bandhan_ml.
#     Build context is now the project root, so paths are relative to root.
#   - HEALTHCHECK uses Python stdlib (no curl in slim image).
#   - Added --no-cache-dir and --upgrade pip for reproducibility.

FROM python:3.11-slim AS base

WORKDIR /app

# Install Python dependencies from the root requirements.txt.
# Context is the project root, so this path is correct.
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy the entire project root so that `bandhan_ml.*` imports resolve correctly.
# .dockerignore (add one) should exclude node_modules, .git, __pycache__, etc.
COPY . .

# HEALTHCHECK: uses Python stdlib — no curl/wget needed.
# Calls the real /health endpoint that verifies ML model load and source readability (Phase 3).
HEALTHCHECK --interval=20s --timeout=10s --start-period=40s --retries=5 \
  CMD python -c "\
import urllib.request, sys; \
r = urllib.request.urlopen('http://localhost:8001/health', timeout=8); \
sys.exit(0 if r.status == 200 else 1)"

EXPOSE 8001
CMD ["uvicorn", "bandhan_ml.scheduler_api.app:app", "--host", "0.0.0.0", "--port", "8001"]
