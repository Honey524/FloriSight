#!/bin/sh
# FloriSight production entrypoint
# Starts the Socket.io real-time server alongside the Next.js standalone server.

set -e

echo "🌿 Starting FloriSight..."

# Start Socket.io server in the background (port 3001)
node /app/frontend/socket-server.js &
SOCKET_PID=$!
echo "✅ Socket.io server started (PID $SOCKET_PID)"

# Trap signals to cleanly shut down both processes
cleanup() {
  echo "🛑 Shutting down FloriSight..."
  kill "$SOCKET_PID" 2>/dev/null || true
  exit 0
}
trap cleanup TERM INT

# Next.js standalone output in a workspace places server.js at:
#   .next/standalone/frontend/server.js  (workspace package root)
# The HOSTNAME / PORT are read from env vars set in the Dockerfile.
STANDALONE_SERVER="/app/frontend/.next/standalone/frontend/server.js"
if [ ! -f "$STANDALONE_SERVER" ]; then
  # Fallback: root-level standalone (non-workspace builds)
  STANDALONE_SERVER="/app/frontend/.next/standalone/server.js"
fi

echo "🚀 Starting Next.js server: $STANDALONE_SERVER"
exec node "$STANDALONE_SERVER"
