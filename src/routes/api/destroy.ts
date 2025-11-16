import * as z from 'zod/mini'
import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

/**
 * given a sandbox session id, destroy it.
 * this is used for cleaning up older sessions that do not have the reset endpoint.
 */

export const Route = createFileRoute('/api/destroy')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { sessionId } = params

        const sandbox = getSandbox(env.Sandbox, sessionId)
        if (!sandbox)
          return json(
            { error: `Sandbox with sessionId ${sessionId} not found` },
            { status: 404 },
          )

        await sandbox.deleteSession(sessionId)

        return json({
          success: true,
          message: 'Sandbox destroyed successfully',
        })
      },
    },
  },
  params: z.object({
    sessionId: z.string({ error: 'Missing sessionId' }),
  }),
})
