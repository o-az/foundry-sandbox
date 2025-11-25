import * as z from 'zod/mini'
import { env } from 'cloudflare:workers'
import { json } from '@tanstack/solid-start'
import { getSandbox } from '@cloudflare/sandbox'
import { createFileRoute } from '@tanstack/solid-router'

/**
 * Given a sandbox ID, destroy the entire sandbox container.
 * This is used for cleaning up older sandboxes that do not have the reset endpoint.
 *
 * Note: Per Cloudflare Sandbox docs, the default session cannot be deleted -
 * use sandbox.destroy() to tear down the entire container instead.
 * @see https://developers.cloudflare.com/sandbox/concepts/sessions/
 */

const DestroyQuerySchema = z.object({
  sandboxId: z.string({ error: 'Missing sandboxId' }),
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

        const { sandboxId } = payload.data

        const sandbox = getSandbox(env.Sandbox, sandboxId)
        if (!sandbox)
          return json(
            { error: `Sandbox with ID ${sandboxId} not found` },
            { status: 404 },
          )

        // destroy() tears down the entire container including all sessions
        await sandbox.destroy()

        return json({
          success: true,
          message: 'Sandbox destroyed successfully',
        })
      },
    },
  },
})
