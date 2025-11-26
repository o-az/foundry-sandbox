import * as z from 'zod/mini'
import { Terminal } from '@xterm/xterm'
import { SerializeAddon } from '@xterm/addon-serialize'
import { createFileRoute } from '@tanstack/solid-router'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'

export const Route = createFileRoute('/command')({
  component: RouteComponent,
  validateSearch: z.object({
    cmd: z.string().check(z.minLength(2)),
    o: z.optional(z.string()), // compressed output
  }),
})

function RouteComponent() {
  const search = Route.useSearch()
  const { cmd, o } = search()

  if (o) return <PreEncodedOutput command={cmd} encoded={o} />

  return <FreshCommandOutput command={cmd} />
}

async function decompressAndDecode(encoded: string): Promise<string> {
  // Convert base64url back to base64
  let base64 = encoded.replaceAll(/-/g, '+').replaceAll(/_/g, '/')
  // Add padding if needed
  while (base64.length % 4) base64 += '='

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)

  const decompressionStream = new DecompressionStream('gzip')
  const writer = decompressionStream.writable.getWriter()
  writer.write(bytes)
  writer.close()

  const decompressed = await new Response(decompressionStream.readable).text()
  return decompressed
}

function PreEncodedOutput(props: { command: string; encoded: string }) {
  const [loading, setLoading] = createSignal(true)
  const [showRerun, setShowRerun] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [htmlContent, setHtmlContent] = createSignal<string | null>(null)

  onMount(async () => {
    try {
      const rawHtml = await decompressAndDecode(props.encoded)
      // Extract just the content inside <pre>...</pre>
      const preMatch = rawHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)
      const html = preMatch ? preMatch[1] : rawHtml
      setHtmlContent(html)
      setShowRerun(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  })

  function handleRerun() {
    // Navigate to same command without the encoded output
    const url = new URL(window.location.href)
    url.searchParams.delete('o')
    window.location.href = url.toString()
  }

  return (
    <main class="min-h-screen h-screen overflow-auto p-4">
      <Show when={loading()}>
        <div class="text-white/50">Loading...</div>
      </Show>
      <Show when={error()}>
        <div class="text-red-500">{error()}</div>
      </Show>
      <Show when={htmlContent()}>
        <pre
          class="font-mono text-sm overflow-x-auto"
          innerHTML={htmlContent()!}
        />
      </Show>
      <Show when={showRerun()}>
        <div class="fixed bottom-4 right-4">
          <button
            type="button"
            onClick={handleRerun}
            class="flex items-center gap-2 rounded bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] transition-colors">
            <RerunIcon />
            Re-run command
          </button>
        </div>
      </Show>
    </main>
  )
}

const ExecResultSchema = z.object({
  stdout: z.optional(z.string()),
  stderr: z.optional(z.string()),
  error: z.optional(z.string()),
  success: z.optional(z.boolean()),
  exitCode: z.optional(z.number()),
})

function FreshCommandOutput(props: { command: string }) {
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [htmlContent, setHtmlContent] = createSignal<string | null>(null)

  let disposed = false
  let terminal: Terminal
  let serializeAddon: SerializeAddon | undefined
  onMount(async () => {
    // Create a hidden terminal to render the output
    terminal = new Terminal({
      cols: 120,
      rows: 24,
      convertEol: true,
      scrollback: 10_000,
      allowProposedApi: true,
      windowOptions: {
        getWinSizePixels: true,
      },
      theme: {
        background: 'transparent',
      },
    })

    serializeAddon = new SerializeAddon()
    terminal.loadAddon(serializeAddon)

    // Create hidden container and open terminal
    const hiddenContainer = document.createElement('div')
    Object.assign(hiddenContainer, {
      style: {
        left: '-9999px',
        position: 'absolute',
        visibility: 'hidden',
      },
    })
    document.body.appendChild(hiddenContainer)
    terminal.open(hiddenContainer)

    try {
      // Use a fixed session ID for the /command route to reuse sandbox instances

      const sessionId = 'html-command-shared'

      const response = await fetch('/api/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: props.command, sessionId }),
      })

      if (!response.ok)
        throw new Error((await response.text()) || 'Command failed')

      const json = await response.json()
      const result = ExecResultSchema.parse(json)

      // Show the command first with a prompt
      terminal.writeln(`\x1b[32m$\x1b[0m ${props.command}`)
      terminal.writeln('')

      if (result.stdout) terminal.write(result.stdout)
      if (result.stdout && result.stderr) terminal.writeln('')
      if (result.stderr) terminal.write(`\x1b[31m${result.stderr}\x1b[0m`)
      if (result.error) terminal.write(`\x1b[31m${result.error}\x1b[0m`)

      // Give terminal a moment to render
      await new Promise(resolve => setTimeout(resolve, 50))

      if (disposed || !serializeAddon) return

      const rawHtml = serializeAddon.serializeAsHTML({
        includeGlobalBackground: true,
      })
      // Extract just the content inside <pre>...</pre>
      const preMatch = rawHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)
      const html = preMatch ? preMatch[1] : rawHtml
      setHtmlContent(html)

      // Cleanup hidden container
      document.body.removeChild(hiddenContainer)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  })

  onCleanup(() => {
    disposed = true
    serializeAddon?.dispose()
    terminal?.dispose()
  })

  return (
    <main class="min-h-screen h-screen overflow-auto p-4">
      <Show when={loading()}>
        <div class="text-white/50">Running command...</div>
      </Show>
      <Show when={error()}>
        <div class="text-red-500">{error()}</div>
      </Show>
      <Show when={htmlContent()}>
        <pre
          class="font-mono text-sm overflow-x-auto"
          innerHTML={htmlContent()!}
        />
      </Show>
    </main>
  )
}

function RerunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}
