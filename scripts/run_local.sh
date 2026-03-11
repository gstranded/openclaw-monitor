#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Default to a sibling claw_team/runtime if present (convenience for local dev).
DEFAULT_RUNTIME_DIR=""
if [ -d "${ROOT_DIR}/../claw_team/runtime" ]; then
  DEFAULT_RUNTIME_DIR="$(cd "${ROOT_DIR}/../claw_team/runtime" && pwd)"
fi

OPENCLAW_RUNTIME_DIR="${OPENCLAW_RUNTIME_DIR:-$DEFAULT_RUNTIME_DIR}"
PORT="${PORT:-3000}"

if [ -z "${OPENCLAW_RUNTIME_DIR}" ] || [ ! -d "${OPENCLAW_RUNTIME_DIR}" ]; then
  cat <<EOF
[openclaw-monitor] OPENCLAW_RUNTIME_DIR not set or not found.

Example:
  export OPENCLAW_RUNTIME_DIR=/abs/path/to/claw_team/runtime
  ./scripts/run_local.sh
EOF
  exit 2
fi

cd "${ROOT_DIR}"

echo "[openclaw-monitor] Using OPENCLAW_RUNTIME_DIR=${OPENCLAW_RUNTIME_DIR}"
echo "[openclaw-monitor] Backend: http://127.0.0.1:${PORT}"

export OPENCLAW_RUNTIME_DIR
export PORT

# Start backend.
node src/server.js &
BACKEND_PID=$!

cleanup() {
  if kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" || true
  fi
}
trap cleanup EXIT

# Optional: start frontend if it exists and has a build/dev script.
if [ -f web/package.json ]; then
  echo "[openclaw-monitor] Detected web/ frontend. Starting it (best-effort)…"
  ( 
    cd web
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    # Prefer dev, else start.
    if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.dev?0:1)"; then
      npm run dev
    else
      npm start
    fi
  )
else
  echo "[openclaw-monitor] No web/ directory found. Backend running; Ctrl+C to stop."
  wait "$BACKEND_PID"
fi
