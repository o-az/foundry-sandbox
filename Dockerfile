# syntax=docker/dockerfile:1
FROM docker.io/cloudflare/sandbox:0.4.15

ENV FOUNDRY_DISABLE_NIGHTLY_WARNING=1
ENV NODE_OPTIONS="npm_config_yes=true"

RUN npm install --global \
  @foundry-rs/cast@nightly \
  @foundry-rs/forge@nightly \
  @foundry-rs/anvil@nightly \
  @foundry-rs/chisel@nightly

COPY scripts/websocket-server.ts websocket-server.ts
COPY scripts/startup.sh startup.sh
RUN chmod +x startup.sh

ARG WS_PORT
ENV WS_PORT=${WS_PORT:-8080}

# Expose any ports you might want to use (optional)
EXPOSE ${WS_PORT}
