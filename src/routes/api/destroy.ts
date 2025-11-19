import * as z from 'zod/mini'
import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

/**
 * given a sandbox session id, destroy it.
 * this is used for cleaning up older sessions that do not have the reset endpoint.
 */

const DestroyQuerySchema = z.object({
  sessionId: z.string({ error: 'Missing sessionId' }),
})

export const Route = createFileRoute('/api/destroy')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const searchParams = Object.fromEntries(url.searchParams.entries())
        const payload = DestroyQuerySchema.safeParse(searchParams)

        if (!payload.success)
          return json({ error: payload.error.message }, { status: 400 })

        const { sessionId } = payload.data

        const sandbox = getSandbox(env.Sandbox, sessionId)
        if (!sandbox)
          return json(
            { error: `Sandbox with sessionId ${sessionId} not found` },
            { status: 404 },
          )

        await Promise.all([sandbox.deleteSession(sessionId), sandbox.destroy()])

        return json({
          success: true,
          message: 'Sandbox destroyed successfully',
        })
      },
    },
  },
})
