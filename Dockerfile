# ─────────────────────────────────────────────────────────────────
# Stage 1: Python venv builder
#   Builds the Python virtual environment with all ML dependencies
#   (torch, ultralytics, opencv, deep-sort) in an isolated stage.
# ─────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS python-builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    python3 \
    python3-pip \
    python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY backend/requirements.txt ./

# Install torch (CPU-only) first from the PyTorch index, then the rest
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/venv/bin/pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    --extra-index-url https://pypi.org/simple \
    torch torchvision \
  && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# ─────────────────────────────────────────────────────────────────
# Stage 2: Node.js dependency installer + Next.js builder
#   Installs all npm dependencies and builds the Next.js standalone
#   bundle. The standalone output self-contains node_modules needed
#   at runtime so the final image stays lean.
# ─────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS node-builder

WORKDIR /app

# Copy workspace manifests first to maximise layer cache hits
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json

RUN npm ci

# Copy source code
COPY frontend/ frontend/
COPY backend/  backend/

# Build Next.js in standalone mode (output: "standalone" in next.config.mjs)
RUN npm run build --workspace=frontend

# ─────────────────────────────────────────────────────────────────
# Stage 3: Final production image
#   Assembles only what is needed to run:
#     - Next.js standalone server
#     - socket-server.js (Socket.io + PostgreSQL LISTEN/NOTIFY)
#     - Python venv with YOLO / tracking libs
# ─────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS production

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SOCKET_PORT=3001 \
    FLORISIGHT_PYTHON_BIN=/opt/venv/bin/python \
    FLORISIGHT_YOLO_MODEL=/app/backend/yolov8n.pt

# Runtime system libraries required by OpenCV / PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python venv from builder
COPY --from=python-builder /opt/venv /opt/venv

# Copy the entire Next.js standalone bundle (includes its own node_modules)
COPY --from=node-builder /app/frontend/.next/standalone ./frontend/.next/standalone

# Copy static assets into the standalone bundle's expected location
COPY --from=node-builder /app/frontend/.next/static ./frontend/.next/standalone/frontend/.next/static

# Copy socket server + its dependencies.
# npm workspaces hoists packages (socket.io, pg, dotenv) to the ROOT node_modules.
# Node resolution from /app/frontend/socket-server.js walks up to /app/node_modules.
# We copy both so nothing is missed.
COPY --from=node-builder /app/frontend/socket-server.js ./frontend/socket-server.js
COPY --from=node-builder /app/frontend/node_modules     ./frontend/node_modules
COPY --from=node-builder /app/node_modules              ./node_modules

# Copy Python backend scripts and YOLO model weights
COPY backend/scripts/  ./backend/scripts/
COPY backend/yolov8n.pt ./backend/yolov8n.pt

# Copy production entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl --fail http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
