import { randomUUID } from 'node:crypto'

type IncomingMessage = {
  id?: string
} & (
  | {
      type: 'exec'
      command: string
    }
  | {
      type: 'ping'
    }
)

type ExecResponse = {
  type: 'execResult'
  id: string
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

const COMMAND_TIMEOUT_MS = 25_000

/**
 * Execute a shell command inside the sandbox using Bun.spawn.
 * Returns stdout, stderr, exitCode and success state.
 */
async function runCommand(command: string): Promise<ExecResponse> {
  const id = randomUUID()
  const child = Bun.spawn(['bash', '-lc', command], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    env: process.env,
  })

  const timeout = setTimeout(() => {
    try {
      child.kill()
    } catch (error) {
      console.warn('Failed to kill timed out process', error)
    }
  }, COMMAND_TIMEOUT_MS)

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])

    return {
      type: 'execResult',
      id,
      success: exitCode === 0,
      stdout,
      stderr,
      exitCode,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function toUtf8(message: string | ArrayBuffer | ArrayBufferView): string {
  if (typeof message === 'string') return message
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message).toString('utf8')
  }
  return Buffer.from(
    message.buffer,
    message.byteOffset,
    message.byteLength,
  ).toString('utf8')
}

function parseMessage(raw: string): IncomingMessage | undefined {
  try {
    const data = JSON.parse(raw) as IncomingMessage
    if (data.type === 'exec' && typeof data.command === 'string') return data
    if (data.type === 'ping') return data
  } catch (error) {
    console.warn('Failed to parse incoming WebSocket message', error)
  }
  return undefined
}

const server = Bun.serve({
  hostname: '0.0.0.0',
  port: Number(Bun.env.WS_PORT),
  development: Bun.env.ENVIRONMENT !== 'production',
  fetch: (request, server) => {
    // upgrade the request to a WebSocket and skip response returning
    if (
      server.upgrade(request, {
        headers: {
          'x-sandbox-session-id':
            request.headers.get('x-sandbox-session-id') || '',
        },
      })
    )
      return

    return new Response('Cloudflare Sandbox WebSocket command server')
  },
  websocket: {
    open: ws => {
      ws.send(
        JSON.stringify({
          type: 'pong',
        }),
      )
    },
    message: async (ws, raw) => {
      const parsed = parseMessage(toUtf8(raw))

      if (!parsed) {
        ws.send(
          JSON.stringify({
            type: 'error',
            error: 'Invalid payload',
          }),
        )
        return
      }

      if (parsed.type === 'ping') {
        ws.send(
          JSON.stringify({
            type: 'pong',
            id: parsed.id,
          }),
        )
        return
      }

      if (!parsed.command.trim()) {
        ws.send(
          JSON.stringify({
            type: 'error',
            id: parsed.id,
            error: 'Missing command',
          }),
        )
        return
      }

      try {
        const result = await runCommand(parsed.command)
        ws.send(
          JSON.stringify({
            ...result,
            id: parsed.id ?? result.id,
          }),
        )
      } catch (error) {
        console.error(JSON.stringify(error, undefined, 2))
        const message =
          error instanceof Error ? error.message : 'Unknown execution failure'
        ws.send(
          JSON.stringify({
            type: 'error',
            id: parsed.id,
            error: message,
          }),
        )
      }
    },
    close: (_, code, reason) => {
      console.info('WebSocket closed', code, reason)
    },
  },
  error: error => {
    console.error(JSON.stringify(error, undefined, 2))
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    return new Response(errorMessage, { status: 500 })
  },
})

const stopAndExit = () => [server.stop(), process.exit(0)]

process.on('SIGINT', () => stopAndExit())
process.on('SIGTERM', () => stopAndExit())
process.on('SIGQUIT', () => stopAndExit())

console.log(
  `Sandbox WebSocket server listening on ws://${server.hostname}:${server.port}`,
)
