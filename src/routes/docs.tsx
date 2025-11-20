import { createFileRoute, redirect } from '@tanstack/solid-router'

export const Route = createFileRoute('/docs')({
  beforeLoad: () => {
    throw redirect({ to: '/demo' })
  },
})
