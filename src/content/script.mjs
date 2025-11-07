import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { LigaturesAddon } from '@xterm/addon-ligatures'

/**
 * TODO:
 * - [ ] Restore context of the terminal when the page is refreshed using [`@xterm/addon-serialization`](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-serialize)
 */

const terminal = new Terminal({
  fontSize: 18,
  scrollback: 5000,
  convertEol: true,
  cursorBlink: true,
  cursorStyle: 'bar',
  allowProposedApi: true,
  rightClickSelectsWord: true,
  drawBoldTextInBrightColors: true,
  fontFamily:
    "'Lilex', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
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

const webglAddon = new WebglAddon()
webglAddon.onContextLoss(event => {
  console.error('WebGL context lost', event)
  webglAddon.dispose()
})

const fitAddon = new FitAddon()

const terminalElement = document.querySelector('div#terminal')

if (!terminalElement) throw new Error('Terminal element not found')

terminal.loadAddon(webglAddon)
terminal.open(terminalElement)
terminal.loadAddon(fitAddon)

const clipboardAddon = new ClipboardAddon({
  readText: () => navigator.clipboard.readText(),
  writeText: text => navigator.clipboard.writeText(text),
})
terminal.loadAddon(clipboardAddon)
terminal.attachCustomKeyEventHandler(
  event =>
    !(
      event.type === 'keydown' &&
      event.key === 'c' &&
      event.ctrlKey &&
      event.metaKey
    ),
)

const ligaturesAddon = new LigaturesAddon()
terminal.loadAddon(ligaturesAddon)

const webLinksAddon = new WebLinksAddon((event, url) => {
  event.preventDefault()
  window.open(url, '_blank', 'noopener,noreferrer')
})
terminal.loadAddon(webLinksAddon)

const statusText = document.querySelector('p#status-text')
if (!statusText) throw new Error('Status text element not found')

const loading = document.querySelector('p#loading')
if (!loading) throw new Error('Loading element not found')

const terminalWrapper = document.querySelector('main#terminal-wrapper')
if (!terminalWrapper) throw new Error('Terminal wrapper element not found')

const encoder = new TextEncoder()
// const decoder = new TextDecoder()

/** @type {WebSocket | undefined} */
let socket
/** @type {Promise<void> | undefined} */
let connectPromise
/** @type {ReturnType<typeof setTimeout> | undefined} */
let reconnectTimeout
/** @type {ReturnType<typeof setInterval> | undefined} */
let pingInterval
let consecutiveFailures = 0

const sessionId =
  localStorage.getItem('sessionId') ||
  `session-${Math.random().toString(36).substring(2, 9)}`
localStorage.setItem('sessionId', sessionId)

function showLoading() {
  loading?.classList.add('active')
}

function hideLoading() {
  loading?.classList.remove('active')
  if (terminalWrapper) terminalWrapper.style.display = 'block'
}

/**
 * @param {string} text
 * @param {boolean} [isConnected=true]
 */
function updateStatus(text, isConnected = true) {
  if (!statusText) return
  statusText.textContent = text
  Object.assign(statusText.style, {
    color: isConnected ? '#4ade80' : '#ef4444',
    fontSize: '12px',
    position: 'absolute',
    height: '16px',
    bottom: 0,
    right: 0,
    margin: '0 18px 8px 0',
  })
}

const WS_ENDPOINT = '/api/ws'
const CUSTOM_WS_META_NAME = 'x-ws-url'

function resolveCustomWsUrl() {
  const globalObj = /** @type {Record<string, unknown>} */ (globalThis)
  const globalHint =
    typeof globalObj.__WS_URL === 'string' &&
    globalObj.__WS_URL.trim().length > 0
      ? globalObj.__WS_URL.trim()
      : undefined
  if (globalHint) return globalHint
  const meta = document.querySelector(
    `meta[name="${CUSTOM_WS_META_NAME}"]`,
  )?.content
  if (meta && meta.trim().length > 0) return meta.trim()
  return undefined
}

const RESOLVED_WS_BASE = resolveCustomWsUrl()

function websocketUrl() {
  if (RESOLVED_WS_BASE) {
    const separator = RESOLVED_WS_BASE.includes('?') ? '&' : '?'
    return `${RESOLVED_WS_BASE}${separator}sessionId=${encodeURIComponent(sessionId)}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const base = `${protocol}://${window.location.host}${WS_ENDPOINT}`
  return `${base}?sessionId=${encodeURIComponent(sessionId)}`
}

/**
 * @param {Record<string, unknown>} payload
 */
function sendJson(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(JSON.stringify(payload))
  } catch (error) {
    console.error('Failed to send JSON payload', error)
  }
}

/**
 * @param {Uint8Array} data
 */
function sendBinary(data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  try {
    socket.send(data)
  } catch (error) {
    console.error('Failed to send binary payload', error)
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = undefined
    connectWebSocket().catch(error => {
      console.error('WebSocket reconnect failed', error)
      scheduleReconnect()
    })
  }, 1500)
}

function clearPing() {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = undefined
  }
}

function setupPing() {
  clearPing()
  pingInterval = setInterval(() => {
    sendJson({ type: 'ping' })
  }, 15000)
}

/**
 * @param {number} cols
 * @param {number} rows
 */
function sendResize(cols, rows) {
  sendJson({ type: 'resize', cols, rows })
}

function fitTerminal() {
  fitAddon.fit()
  const { cols, rows } = terminal
  sendResize(cols, rows)
}

async function connectWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) return
  if (connectPromise) return connectPromise

  updateStatus('Connecting...', false)
  showLoading()

  connectPromise = /** @type {Promise<void>} */ (
    new Promise((resolve, reject) => {
      const ws = new WebSocket(websocketUrl())
      ws.binaryType = 'arraybuffer'

      let attemptOpened = false

      const handleOpen = () => {
        attemptOpened = true
        consecutiveFailures = 0
        socket = ws
        hideLoading()
        updateStatus('Connected', true)
        const { cols, rows } = terminal
        sendJson({ type: 'init', cols, rows })
        setupPing()
        terminal.focus()
        resolve()
      }

      /** @param {MessageEvent} event */
      const handleMessage = event => {
        const { data } = event
        if (data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(data))
          return
        }
        if (typeof data !== 'string') return

        try {
          const parsed = JSON.parse(data)
          if (parsed && typeof parsed === 'object') {
            const record = /** @type {Record<string, unknown>} */ (parsed)
            const payloadType = record.type
            if (payloadType === 'pong') {
              updateStatus('Connected', true)
              return
            }
            if (
              payloadType === 'process-exit' &&
              typeof record.exitCode === 'number'
            ) {
              terminal.writeln(
                `\r\n\u001b[31mProcess exited with code ${record.exitCode}\u001b[0m`,
              )
              return
            }
            if (payloadType === 'ready') {
              return
            }
          }
        } catch {
          terminal.write(data)
        }
      }

      /** @param {CloseEvent} event */
      const handleClose = event => {
        if (socket === ws) socket = undefined
        clearPing()
        if (attemptOpened) {
          updateStatus('Disconnected', false)
          terminal.writeln(
            `\r\n\u001b[31mConnection closed (code ${event.code}${
              event.reason ? `, reason: ${event.reason}` : ''
            })\u001b[0m`,
          )
        } else {
          consecutiveFailures += 1
          updateStatus('Reconnecting...', false)
        }
        scheduleReconnect()
      }

      /** @param {Event | Error} error */
      const handleError = error => {
        consecutiveFailures += 1
        clearPing()
        updateStatus('Reconnecting...', false)
        scheduleReconnect()
        reject(
          error instanceof Error
            ? error
            : new Error('WebSocket connection error'),
        )
      }

      ws.addEventListener('open', handleOpen, { once: true })
      ws.addEventListener('message', handleMessage)
      ws.addEventListener('close', handleClose)
      ws.addEventListener('error', handleError, { once: true })
    })
  ).finally(() => {
    connectPromise = undefined
  })

  return connectPromise
}

terminal.onData(data => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return
  }
  sendBinary(encoder.encode(data))
})

window.addEventListener('resize', () => {
  setTimeout(() => {
    fitTerminal()
  }, 50)
})

function initialize() {
  showLoading()
  updateStatus('Connecting...', false)
  setTimeout(() => fitTerminal(), 25)
  connectWebSocket().catch(error => {
    console.error(error)
    if (consecutiveFailures > 3) {
      hideLoading()
      updateStatus('Connection Failed', false)
      terminal.writeln('Failed to connect to sandbox. Please refresh the page.')
    } else {
      updateStatus('Reconnecting...', false)
    }
  })
}

initialize()
