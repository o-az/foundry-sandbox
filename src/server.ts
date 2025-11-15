import type { WorkerRequestContext } from '#types/request-context.ts'
import handler, { createServerEntry } from '@tanstack/solid-start/server-entry'

export default createServerEntry({
  fetch: handler.fetch,
})

declare module '@tanstack/solid-start' {
  interface Register {
    server: {
      requestContext?: WorkerRequestContext
    }
  }
}

export { Sandbox } from '@cloudflare/sandbox'
