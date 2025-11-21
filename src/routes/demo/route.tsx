import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/demo')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <main class="border-y-green-400 border-y-[1.5px] pb-6 min-size-max flex items-center overflow-y-auto">
      DEMO
    </main>
  )
}
