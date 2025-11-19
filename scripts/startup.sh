#!/usr/bin/env bash

set -euo pipefail

echo "[startup] Launching application server..."
bun x vite dev --config="./vite.config.ts" &

echo "[startup] starting Cloudflare Sandbox control plane..."

exec bun /container-server/dist/index.js