import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

import {
  clearSandboxSession,
  getOrCreateSandboxId,
  getSandboxSession,
  removeActiveTab,
} from '#lib/sandbox-session.ts'

export const Route = createFileRoute('/api/reset')({
  server: {
    handlers: {
      POST: async ({ request }) => handleReset(await parseBody(request)),
      GET: async ({ request }) => handleReset(parseQuery(request.url)),
    },
  },
})

type ResetPayload = {
  sessionId?: string
  tabId?: string
}

async function parseBody(request: Request): Promise<ResetPayload> {
  try {
    const body = (await request.json()) as ResetPayload
    return body
  } catch {
    return {}
  }
}

function parseQuery(url: string): ResetPayload {
  const params = new URL(url).searchParams
  return {
    sessionId: params.get('sessionId') ?? undefined,
    tabId: params.get('tabId') ?? undefined,
  }
}

async function handleReset(payload: ResetPayload) {
  const sessionId = payload.sessionId
  const tabId = payload.tabId

  if (!sessionId) {
    return json({ success: false, error: 'Missing sessionId' }, { status: 400 })
  }

  const existingSession = getSandboxSession(sessionId)
  if (!existingSession) {
    return json({ success: true, message: 'Session already destroyed' })
  }

  // Ensure session is registered so active tabs reflect latest info
  getOrCreateSandboxId(sessionId, tabId)

  const remainingTabs = removeActiveTab(sessionId, tabId)
  if (remainingTabs > 0) {
    return json({
      success: true,
      message: `Sandbox kept alive (${remainingTabs} tabs remaining)`,
      activeTabs: remainingTabs,
    })
  }

  const sandbox = getSandbox(env.Sandbox, existingSession.sandboxId, {
    keepAlive: true,
  })

  try {
    await sandbox.destroy()
    clearSandboxSession(sessionId)
    return json({
      success: true,
      message: 'Sandbox destroyed (last tab closed)',
    })
  } catch (error) {
    console.error('Failed to destroy sandbox', error)
    return json(
      { success: false, message: 'Failed to destroy sandbox' },
      { status: 500 },
    )
  }
}
