#!/usr/bin/env bash

set -euo pipefail

echo "[startup] launching WebSocket command server..."
bun ./websocket-server.ts &

echo "[startup] starting Cloudflare Sandbox control plane..."

exec bun dist/index.js
