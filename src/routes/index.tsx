import { onMount, onCleanup, createSignal } from 'solid-js'

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { createFileRoute } from '@tanstack/solid-router'

const PROMPT = ' \u001b[32m$\u001b[0m '
const LOCAL_COMMANDS = new Set(['clear', 'reset'])

export const Route = createFileRoute('/')({
  component: TerminalPage,
})

function TerminalPage() {
  const sessionId = createClientId('session')
  const tabId = createClientId('tab')
  const [status, setStatus] = createSignal('Ready')
  const [isRunning, setIsRunning] = createSignal(false)

  let terminalRef: HTMLDivElement | undefined
  let term: Terminal
  let currentLine = ''

  onMount(() => {
    if (!terminalRef) return

    term = new Terminal({
      fontSize: 17,
      lineHeight: 1.2,
      scrollback: 5000,
      convertEol: true,
      cursorBlink: true,
      allowProposedApi: true,
      scrollOnUserInput: false,
      cursorStyle: 'underline',
      rightClickSelectsWord: true,
      rescaleOverlappingGlyphs: true,
      ignoreBracketedPasteMode: true,
      cursorInactiveStyle: 'underline',
      drawBoldTextInBrightColors: true,
      fontFamily: 'Lilex, monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    const unicodeAddon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon()
    const serializeAddon = new SerializeAddon()
    const ligaturesAddon = new LigaturesAddon()
    const clipboardAddon = new ClipboardAddon()

    try {
      const webglAddon = new WebglAddon()
      term.loadAddon(webglAddon)
    } catch (error) {
      console.warn(
        'WebGL addon failed to load; falling back to canvas renderer.',
        error,
      )
    }

    term.open(terminalRef)

    term.loadAddon(fitAddon)
    fitAddon.fit()
    term.loadAddon(unicodeAddon)
    term.loadAddon(searchAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(serializeAddon)
    term.loadAddon(ligaturesAddon)
    term.loadAddon(clipboardAddon)
    term.unicode.activeVersion = '11'

    term.focus()
    term.writeln(`Session: ${sessionId}`)
    renderPrompt(term, { prependNewLine: false })

    const keyListener = term.onData(data => {
      if (!term) return
      if (isRunning() && data !== '\u0003') {
        term.write('\x07')
        return
      }

      switch (data) {
        case '\r':
          void handleCommand(term)
          return
        case '\u0003':
          term.write('^C')
          currentLine = ''
          renderPrompt(term)
          return
        case '\u007f':
          if (currentLine.length === 0) return
          currentLine = currentLine.slice(0, -1)
          term.write('\b \b')
          return
        default: {
          const code = data.charCodeAt(0)
          if (code === 0x1b) return // swallow escape sequences for now
          if (data >= ' ' && data <= '~') {
            currentLine += data
            term.write(data)
          }
        }
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit())
    })
    resizeObserver.observe(terminalRef)

    onCleanup(() => {
      keyListener.dispose()
      resizeObserver?.disconnect()
      term?.dispose()
    })

    async function handleCommand(activeTerminal: Terminal) {
      const command = currentLine.trim()
      activeTerminal.write('\r\n')
      currentLine = ''

      if (!command.length) {
        renderPrompt(activeTerminal, { prependNewLine: false })
        return
      }

      setIsRunning(true)
      setStatus(`Running: ${command}`)

      try {
        const response = await fetch('/api/exec', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ command, sessionId, tabId }),
        })

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
          details?: string
        }

        if (!response.ok || payload.error) {
          const errorMessage = payload.error || response.statusText
          activeTerminal.writeln(`\x1b[31mError: ${errorMessage}\x1b[0m`)
          if (payload.details) activeTerminal.writeln(String(payload.details))
        } else {
          const { result } = payload as { result?: SandboxExecResult }
          const stdout = result?.stdout || ''
          const stderr = result?.stderr || ''
          const duration = result?.duration

          if (stdout) activeTerminal.write(stdout.replace(/\n/g, '\r\n'))
          if (stderr) {
            activeTerminal.write(
              `\r\n\x1b[38;5;203m${stderr.replace(/\n/g, '\r\n')}\x1b[0m`,
            )
          }
          if (typeof duration === 'number') {
            activeTerminal.writeln(
              `\r\n[exit ${result?.code ?? 0} | ${duration}ms]`,
            )
          }
        }
      } catch (error) {
        activeTerminal.writeln(
          `\x1b[31mClient request failed:\x1b[0m ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      } finally {
        setIsRunning(false)
        setStatus('Ready')
        renderPrompt(activeTerminal, { prependNewLine: false })
      }
    }
  })

  return (
    <main id="terminal-wrapper">
      <div id="terminal-container">
        <div
          id="terminal"
          ref={element => (terminalRef = element || undefined)}
        />
      </div>
      <footer class="footer px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
        <span>Session {sessionId}</span>
        <span>{status()}</span>
      </footer>
    </main>
  )
}

function renderPrompt(
  term: Terminal,
  _options: { prependNewLine?: boolean } = {},
) {
  term.write(PROMPT)
}

type SandboxExecResult = {
  stdout?: string
  stderr?: string
  code?: number
  duration?: number
}

function createClientId(prefix: string) {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${id}`
}
