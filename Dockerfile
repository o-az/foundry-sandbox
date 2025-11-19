# syntax=docker/dockerfile:1
FROM docker.io/cloudflare/sandbox:0.5.1

ENV TERM="xterm-256color"
ENV COLORTERM="truecolor"
ENV FOUNDRY_DISABLE_NIGHTLY_WARNING=1
ENV NODE_OPTIONS="npm_config_yes=true"

RUN apt-get update --yes \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global \
  @foundry-rs/cast@nightly \
  @foundry-rs/forge@nightly \
  @foundry-rs/anvil@nightly \
  @foundry-rs/chisel@nightly

WORKDIR /workspace/app

COPY package.json bun.lock bunfig.toml /workspace/app/
RUN bun install --frozen-lockfile

COPY . /workspace/app/

RUN chmod +x /workspace/app/scripts/startup.sh

EXPOSE 6969 8080

CMD ["/workspace/app/scripts/startup.sh"]