# Repository Guidelines

## Project Structure & Module Organization

- `src/index.ts` – Worker entry point; routes HTTP requests, proxies `/api/ws` upgrades, and manages sandbox sessions.
- `src/content/` – Static assets served to the browser (terminal UI, fonts, styling, TS/JS front-end logic).
- `scripts/` – Runtime helpers executed inside the Cloudflare sandbox container (`websocket-server.ts` streams via `script(1)`; `startup.sh` exports `WS_PORT` and boots the control plane).
- `Dockerfile` – Defines the sandbox container image, installed tooling (Foundry nightly), and startup sequence.
- `wrangler.json`, `worker-configuration.d.ts` – Cloudflare Worker configuration and typed bindings.

## Build, Test, and Development Commands

- **Critical:** when running any command, always wrap it with `~/dev/commands/command.sh` in the following format:

  ```sh
  /bin/bash ~/dev/commands/command.sh --timeout 30 <command>
  ```

  Examples:
  - `/bin/bash ~/dev/commands/command.sh --timeout 30 wrangler dev`
  - `/bin/bash ~/dev/commands/command.sh --timeout 30 bun dev`
  - `/bin/bash ~/dev/commands/command.sh --timeout 30 pnpm --filter server start`
  - and so on...
  This will ensure that the command will terminate automatically after 30 seconds if it doesn't complete. Without this, hours are wasted waiting and realizing that you ran a `dev` command and never was able to exit it and resume your work.
- `wrangler dev` – Launches the Worker locally with a live sandbox container (ensure Docker is running).
- `bun x wrangler@latest --config='wrangler.json' deploy --keep-vars` – Deploys to Cloudflare; dry-run with the same command plus `--dry-run`.
- `bun check` – Runs Biome formatting + linting with autofix, matching repository style rules.
- `bun run check:types` – Executes TypeScript type-checking (no emit) across Worker and client code.

## Coding Style & Naming Conventions

- TypeScript/JavaScript use 2-space indentation and Biome defaults (`biome.json` governs lint + format rules).
- Prefer descriptive camelCase for variables/functions (`sessionLabel`), PascalCase for exported types or classes (`Sandbox`), and kebab-case for file names except TypeScript modules.
- Keep Worker handler functions pure and dependency-light; shared utilities belong in `scripts/` or future `src/lib/` modules.
- Run `bun check` before committing; unresolved lint errors block CI.

## Testing Guidelines

- No automated test suite exists yet. When adding features, include minimal reproduction scripts or fixture commands (e.g., sample `chisel` session transcript).
- For browser-side changes, verify terminal flows by running `wrangler dev` and exercising `/api/ws` interactive sessions (open DevTools console to watch reconnection logs).
- If you add test tooling, document invocation commands in this file and ensure they run via Bun.

## Commit & Pull Request Guidelines

- Follow concise, imperative commit subjects (e.g., `Add PTY bridge logging`). Group related pipeline or formatting changes together.
- Pull requests should include: summary of behavior changes, manual verification notes (`wrangler dev`, command transcripts), and links to associated issues.
- When modifying sandbox runtime behavior, capture relevant server/browser logs in the PR description for reviewers.

## Security & Configuration Tips

- Never commit secrets; Worker bindings and Foundry auth live outside the repo (`.dev.vars`, Cloudflare dashboards).
- Keep `Dockerfile` base image aligned with the SDK version specified in `package.json` to avoid runtime mismatches.
- The shell bridge always listens on `WS_PORT` (default 8080). Only change it if you also rebuild the Docker image to expose that port and update `.dev.vars`.
- Exposed ports should remain limited to the WebSocket command channel. Validate port usage via `scripts/websocket-server.ts`.
