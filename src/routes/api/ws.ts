import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

import { getOrCreateSandboxId } from '#lib/sandbox-session.ts'

const DEFAULT_WS_PORT = 8080

export const Route = createFileRoute('/api/ws')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId =
          url.searchParams.get('sessionId') ??
          request.headers.get('X-Session-ID') ??
          undefined

        if (!sessionId) {
          return json({ error: 'Missing sessionId' }, { status: 400 })
        }

        const sandboxId = getOrCreateSandboxId(sessionId)
        const sandbox = getSandbox(env.Sandbox, sandboxId, { keepAlive: true })
        const wsPort = Number(env.WS_PORT || DEFAULT_WS_PORT)
        return sandbox.wsConnect(request, wsPort)
      },
    },
  },
})
