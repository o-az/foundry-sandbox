import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

import {
  getActiveTabCount,
  getOrCreateSandboxId,
} from '#lib/sandbox-session.ts'

const HEALTH_TIMEOUT_MS = 5_000

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          sessionId?: unknown
          tabId?: unknown
        } | null
        const sessionId =
          typeof body?.sessionId === 'string' ? body.sessionId : undefined
        const tabId = typeof body?.tabId === 'string' ? body.tabId : undefined

        if (!sessionId) {
          return json(
            { success: false, error: 'Missing sessionId' },
            { status: 400 },
          )
        }

        const sandboxId = getOrCreateSandboxId(sessionId, tabId)
        const sandbox = getSandbox(env.Sandbox, sandboxId, { keepAlive: true })

        try {
          await sandbox.exec('true', { timeout: HEALTH_TIMEOUT_MS })
          return json({
            success: true,
            activeTabs: getActiveTabCount(sessionId),
          })
        } catch (error) {
          console.error('Sandbox warmup failed', error)
          return json(
            { success: false, error: 'Sandbox warmup failed' },
            { status: 500 },
          )
        }
      },
    },
  },
})
