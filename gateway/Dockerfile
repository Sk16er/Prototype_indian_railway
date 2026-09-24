# gateway/Dockerfile
# Node/Express BANDHAN gateway.
#
# Fixes vs. previous version:
#   - Adds curl (needed by HEALTHCHECK and docker compose healthcheck).
#   - Uses `curl -fs` in HEALTHCHECK — -f fails on HTTP errors, -s suppresses progress.
#   - Pins node:20-alpine for reproducibility.
#   - Copies package-lock.json explicitly so `npm ci` is fully reproducible.

FROM node:20-alpine AS base

# curl is not in node:20-alpine by default — required for HEALTHCHECK.
RUN apk add --no-cache curl

WORKDIR /app

# Install production dependencies only (no devDependencies in the image).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Application source
COPY store.mjs server.mjs ./

# HEALTHCHECK calls the real /health endpoint (Phase 3):
#   - Postgres connectivity
#   - FastAPI scheduler reachability
#   - Free disk space
# -f: fail on HTTP error status, -s: silent (no progress meter)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fs http://localhost:3001/health | grep -q '"status":"healthy"' || exit 1

EXPOSE 3001
CMD ["node", "server.mjs"]
