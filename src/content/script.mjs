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
  scrollback: 1000,
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

const webLinksAddon = new WebLinksAddon(handleLink)
terminal.loadAddon(webLinksAddon)

/**
 * @param {MouseEvent} event
 * @param {string} url
 */
function handleLink(event, url) {
  event.preventDefault()
  window.open(url, '_blank', 'noopener,noreferrer')
}

const fitTerminal = () => fitAddon.fit() ?? void 0
setTimeout(fitTerminal, 100)
window.addEventListener('resize', _ => setTimeout(fitTerminal, 50))

/** @type {Array<string>} */
const commandHistory = []
let [currentLine, cursorPosition] = ['', 0]
let [historyIndex, isExecuting] = [-1, false]

const PROMPT = '\x1b[32m$\x1b[0m '

/**
 * @param {{ leadingNewline?: boolean }} [options]
 */
function prompt(options = {}) {
  const { leadingNewline = true } = options
  currentLine = ''
  cursorPosition = 0
  if (leadingNewline) terminal.write('\r\n')
  renderCurrentInput()
}

function clearTerminal() {
  terminal.write('\x1b[H\x1b[2J')
  prompt({ leadingNewline: false })
}

const sessionId =
  localStorage.getItem('sessionId') ||
  `session-${Math.random().toString(36).substring(2, 9)}`
localStorage.setItem('sessionId', sessionId)

/**
 * @typedef {Object} ExecResultMessage
 * @property {'execResult'} type
 * @property {string} id
 * @property {boolean} success
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} exitCode
 */

/**
 * @typedef {Object} ErrorMessage
 * @property {'error'} type
 * @property {string=} id
 * @property {string} error
 */

/**
 * @typedef {Object} PongMessage
 * @property {'pong'} type
 * @property {string=} id
 */

/** @type {WebSocket | undefined} */
let socket
/** @type {Promise<WebSocket> | undefined} */
let connectPromise
/** @type {ReturnType<typeof setTimeout> | undefined} */
let reconnectTimeout
/** @type {Map<string, { resolve: (value: ExecResultMessage) => void; reject: (reason: Error) => void }>} */
const pendingCommands = new Map()

const textDecoder = new TextDecoder()
const WS_ENDPOINT = '/api/ws'

const createMessageId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `msg-${Math.random().toString(36).slice(2, 10)}`

const statusText = document.querySelector('p#status-text')
if (!statusText) throw new Error('Status text element not found')

const loading = document.querySelector('p#loading')
if (!loading) throw new Error('Loading element not found')

const terminalWrapper = document.querySelector('main#terminal-wrapper')
if (!terminalWrapper) throw new Error('Terminal wrapper element not found')

function showLoading() {
  if (!loading) return
  loading.classList.add('active')
}

function hideLoading() {
  if (!loading) return
  loading.classList.remove('active')
  if (terminalWrapper) terminalWrapper.style.display = 'block'
}

/** @param {string} text */
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

function websocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}${WS_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`
}

/**
 * @param {unknown} reason
 */
function rejectAllPending(reason) {
  if (pendingCommands.size === 0) return
  const message =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? reason.message
        : 'Connection closed'
  const error = reason instanceof Error ? reason : new Error(message)
  for (const pending of pendingCommands.values()) pending.reject(error)
  pendingCommands.clear()
}

/**
 * @param {MessageEvent['data']} data
 */
function handleServerMessage(data) {
  if (data instanceof Blob) {
    data
      .text()
      .then(text => handleServerMessage(text))
      .catch(error =>
        console.error('Failed to read binary WebSocket payload', error),
      )
    return
  }

  const raw =
    typeof data === 'string'
      ? data
      : textDecoder.decode(
          data instanceof ArrayBuffer ? new Uint8Array(data) : data,
        )

  /** @type {unknown} */
  let payload
  try {
    payload = JSON.parse(raw)
  } catch (error) {
    console.warn('Failed to parse WebSocket message', error, raw)
    return
  }

  if (!payload || typeof payload !== 'object') {
    console.warn('Received non-object WebSocket payload', payload)
    return
  }

  const record = /** @type {Record<string, unknown>} */ (payload)
  const payloadType = record.type

  if (
    typeof payloadType === 'string' &&
    payloadType === 'execResult' &&
    typeof record.id === 'string' &&
    typeof record.success === 'boolean' &&
    typeof record.stdout === 'string' &&
    typeof record.stderr === 'string' &&
    typeof record.exitCode === 'number'
  ) {
    const execPayload = /** @type {ExecResultMessage} */ (record)
    const pending = pendingCommands.get(execPayload.id)
    if (pending) {
      pendingCommands.delete(execPayload.id)
      pending.resolve(execPayload)
    } else {
      console.warn(
        'Received execResult with no pending command',
        execPayload.id,
      )
    }
    return
  }

  if (typeof payloadType === 'string' && payloadType === 'error') {
    const errorPayload = /** @type {ErrorMessage} */ (record)
    const error = new Error(
      typeof errorPayload.error === 'string'
        ? errorPayload.error
        : 'Unknown error',
    )
    if (errorPayload.id && pendingCommands.has(errorPayload.id)) {
      const pending = pendingCommands.get(errorPayload.id)
      if (pending) pending.reject(error)
      pendingCommands.delete(errorPayload.id)
      return
    }
    writeLine(`\r\n\x1b[31m${error.message}\x1b[0m`)
    return
  }

  if (
    typeof payloadType === 'string' &&
    payloadType === 'pong' &&
    (record.id === undefined || typeof record.id === 'string')
  ) {
    updateStatus('Connected', true)
    return
  }

  console.warn('Unhandled WebSocket message', payload)
}

/**
 * @param {WebSocket} ws
 */
function attachPersistentHandlers(ws) {
  ws.addEventListener(
    'message',
    /**
     * @param {MessageEvent} event
     */
    event => handleServerMessage(event.data),
  )
  ws.addEventListener(
    'error',
    /**
     * @param {Event | ErrorEvent} event
     */
    event => {
      console.error('WebSocket error', event)
    },
  )
  ws.addEventListener(
    'close',
    /**
     * @param {CloseEvent} event
     */
    event => {
      if (socket === ws) {
        socket = undefined
        updateStatus('Disconnected', false)
        rejectAllPending('Connection closed')
        scheduleReconnect()
      }
      console.info(
        `WebSocket closed (code=${event.code}, reason=${event.reason || 'n/a'})`,
      )
    },
    { once: true },
  )
}

function scheduleReconnect() {
  if (reconnectTimeout) return
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = undefined
    updateStatus('Reconnecting...', false)
    connectWebSocket().catch(error => {
      console.error('WebSocket reconnect failed', error)
      scheduleReconnect()
    })
  }, 1500)
}

function connectWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(socket)
  }
  if (connectPromise) return connectPromise

  updateStatus('Connecting...', false)

  connectPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(websocketUrl())
    ws.binaryType = 'arraybuffer'

    const cleanup = () => {
      ws.removeEventListener('open', handleOpen)
      ws.removeEventListener('error', handleError)
      ws.removeEventListener('close', handleCloseBeforeOpen)
    }

    const timeout = setTimeout(() => {
      cleanup()
      try {
        ws.close()
      } catch (_error) {
        // ignore close errors during timeout handling
      }
      reject(new Error('WebSocket connection timed out'))
    }, 10_000)

    const handleOpen = () => {
      clearTimeout(timeout)
      cleanup()
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = undefined
      }
      socket = ws
      attachPersistentHandlers(ws)
      updateStatus('Connected', true)
      resolve(ws)
    }

    /** @param {Event | ErrorEvent} event */
    const handleError = event => {
      clearTimeout(timeout)
      cleanup()
      reject(
        event instanceof ErrorEvent
          ? (event.error ?? new Error('WebSocket connection error'))
          : new Error('WebSocket connection error'),
      )
    }

    /** @param {CloseEvent} event */
    const handleCloseBeforeOpen = event => {
      clearTimeout(timeout)
      cleanup()
      reject(
        new Error(
          `WebSocket closed before opening (code=${event.code ?? 'n/a'})`,
        ),
      )
    }

    ws.addEventListener('open', handleOpen, { once: true })
    ws.addEventListener('error', handleError, { once: true })
    ws.addEventListener('close', handleCloseBeforeOpen, { once: true })
  }).finally(() => {
    connectPromise = undefined
  })

  return connectPromise
}

/**
 * @param {string} command
 * @returns {Promise<ExecResultMessage>}
 */
async function sendExecCommand(command) {
  const ws = await connectWebSocket()
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('WebSocket not connected')
  }

  const id = createMessageId()

  return new Promise((resolve, reject) => {
    pendingCommands.set(id, {
      resolve: result => {
        resolve(result)
      },
      reject: error => {
        reject(error)
      },
    })

    try {
      ws.send(
        JSON.stringify({
          type: 'exec',
          id,
          command,
        }),
      )
    } catch (error) {
      pendingCommands.delete(id)
      reject(
        error instanceof Error
          ? error
          : new Error('Failed to send command payload'),
      )
    }
  })
}

/** @param {string} text */
function writeToTerminal(text) {
  if (!terminal) return
  terminal.write(text)
}

/** @param {string} text */
function writeLine(text) {
  terminal.writeln(text)
}

function renderCurrentInput() {
  if (cursorPosition < 0) cursorPosition = 0
  if (cursorPosition > currentLine.length) cursorPosition = currentLine.length
  const moveLeft = currentLine.length - cursorPosition
  let output = `\r\x1b[K${PROMPT}${currentLine}`
  if (moveLeft > 0) output += `\x1b[${moveLeft}D`
  terminal.write(output)
}

function findPreviousWordBoundary() {
  if (cursorPosition === 0) return 0
  let index = cursorPosition
  while (index > 0 && currentLine[index - 1] === ' ') index--
  while (index > 0 && currentLine[index - 1] !== ' ') index--
  return index
}

function findNextWordBoundary() {
  if (cursorPosition === currentLine.length) return currentLine.length
  let index = cursorPosition
  while (index < currentLine.length && currentLine[index] === ' ') index++
  while (index < currentLine.length && currentLine[index] !== ' ') index++
  return index
}

/**
 * @param {string} text
 */
function insertText(text) {
  if (!text) return
  currentLine =
    currentLine.slice(0, cursorPosition) +
    text +
    currentLine.slice(cursorPosition)
  cursorPosition += text.length
  historyIndex = commandHistory.length
  renderCurrentInput()
}

function handleEnter() {
  writeLine('')
  historyIndex = commandHistory.length
  if (currentLine.trim()) {
    commandHistory.push(currentLine)
    historyIndex = commandHistory.length
    executeCommand(currentLine)
  } else prompt()
}

/**
 * @param {string} text
 */
function applyTextInput(text) {
  if (!text) return
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const segments = normalized.split('\n')
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (segment) insertText(segment)
    if (index < segments.length - 1) {
      handleEnter()
      if (isExecuting) return
    }
  }
}

terminal.attachCustomKeyEventHandler(event => {
  if (isExecuting) return true
  if (!event.metaKey || event.altKey || event.ctrlKey) return true
  const { key, code } = event
  const targetsLeft =
    key === 'ArrowLeft' || key === 'Home' || code === 'ArrowLeft'
  const targetsRight =
    key === 'ArrowRight' || key === 'End' || code === 'ArrowRight'
  if (!targetsLeft && !targetsRight) return true
  event.preventDefault()
  const targetPosition = targetsLeft ? 0 : currentLine.length
  if (cursorPosition !== targetPosition) {
    cursorPosition = targetPosition
    historyIndex = commandHistory.length
    renderCurrentInput()
  }
  return false
})

/** @param {string} command */
async function executeCommand(command) {
  if (!command.trim()) return prompt()
  isExecuting = true

  if (command.trim() === 'clear') {
    clearTerminal()
    isExecuting = false
    return
  }
  try {
    const result = await sendExecCommand(command)
    if (result.stdout) {
      const output =
        result.stdout.endsWith('\n') || result.stdout.endsWith('\r')
          ? result.stdout
          : `${result.stdout}\n`
      writeToTerminal('\r\n' + output)
    }
    if (result.stderr) {
      const errorOutput =
        result.stderr.endsWith('\n') || result.stderr.endsWith('\r')
          ? result.stderr
          : `${result.stderr}\n`
      writeToTerminal('\r\n\x1b[31m' + errorOutput + '\x1b[0m')
    }
    if (!result.success && !result.stderr) {
      writeLine(
        `\r\n\x1b[31mCommand exited with code ${result.exitCode}\x1b[0m`,
      )
    }
  } catch (error) {
    console.error(error)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    writeLine(`\r\n\x1b[31m${errorMessage}\x1b[0m`)
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      updateStatus('Disconnected', false)
      scheduleReconnect()
    }
  } finally {
    isExecuting = false
    prompt()
  }
}

terminal.onData(data => {
  if (isExecuting) return
  // biome-ignore lint/suspicious/noControlCharactersInRegex: _
  const metaNavigationMatch = data.match(/^\x1b\[[0-9]+;9([CDFH])$/)
  if (metaNavigationMatch) {
    const navigationKey = metaNavigationMatch[1]
    const targetPosition =
      navigationKey === 'D' || navigationKey === 'H' ? 0 : currentLine.length
    if (cursorPosition !== targetPosition) {
      cursorPosition = targetPosition
      historyIndex = commandHistory.length
      renderCurrentInput()
    }
    return
  }

  if (data.length > 1 && !data.includes('\x1b') && /[\r\n]/.test(data)) {
    applyTextInput(data)
    return
  }

  const code = data.charCodeAt(0)
  if (code === 13) {
    handleEnter()
    return
  }
  if (code === 3) {
    writeLine('^C')
    currentLine = ''
    cursorPosition = 0
    prompt()
    return
  }
  if (code === 12) {
    clearTerminal()
    return
  }
  if (data === '\x1b[A') {
    if (historyIndex > 0) {
      historyIndex--
      currentLine = commandHistory[historyIndex]
      cursorPosition = currentLine.length
      renderCurrentInput()
    }
    return
  }
  if (data === '\x1b[B') {
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++
      currentLine = commandHistory[historyIndex]
      cursorPosition = currentLine.length
      renderCurrentInput()
    } else if (historyIndex === commandHistory.length - 1) {
      historyIndex = commandHistory.length
      currentLine = ''
      cursorPosition = 0
      renderCurrentInput()
    }
    return
  }
  if (/^[\x20-\x7e]+$/.test(data)) {
    insertText(data)
  }
})

terminal.onKey(({ domEvent }) => {
  if (isExecuting) return
  const { key: domKey, altKey, metaKey } = domEvent

  if (domKey === 'Backspace') {
    domEvent.preventDefault()
    if (cursorPosition > 0) {
      currentLine =
        currentLine.slice(0, cursorPosition - 1) +
        currentLine.slice(cursorPosition)
      cursorPosition--
      historyIndex = commandHistory.length
      renderCurrentInput()
    }
    return
  }

  if (domKey === 'Delete') {
    domEvent.preventDefault()
    if (cursorPosition < currentLine.length) {
      currentLine =
        currentLine.slice(0, cursorPosition) +
        currentLine.slice(cursorPosition + 1)
      historyIndex = commandHistory.length
      renderCurrentInput()
    }
    return
  }

  if (domKey === 'ArrowLeft') {
    domEvent.preventDefault()
    const originalPosition = cursorPosition
    if (metaKey) cursorPosition = 0
    else if (altKey) cursorPosition = findPreviousWordBoundary()
    else if (cursorPosition > 0) cursorPosition--
    if (cursorPosition !== originalPosition) renderCurrentInput()
    return
  }

  if (domKey === 'ArrowRight') {
    domEvent.preventDefault()
    const originalPosition = cursorPosition
    if (metaKey) cursorPosition = currentLine.length
    else if (altKey) cursorPosition = findNextWordBoundary()
    else if (cursorPosition < currentLine.length) cursorPosition++
    if (cursorPosition !== originalPosition) renderCurrentInput()
    return
  }

  if (domKey === 'Home') {
    domEvent.preventDefault()
    if (cursorPosition !== 0) {
      cursorPosition = 0
      renderCurrentInput()
    }
    return
  }

  if (domKey === 'End') {
    domEvent.preventDefault()
    if (cursorPosition !== currentLine.length) {
      cursorPosition = currentLine.length
      renderCurrentInput()
    }
  }
})

async function initTerminal() {
  showLoading()
  updateStatus('Initializing...', false)
  try {
    const response = await fetch('/api/ping')
    /** @type {string} */
    const data = await response.text()
    if (data !== 'ok') throw new Error('Connection failed')
    await connectWebSocket()
    hideLoading()
    updateStatus('Connected', true)
    prompt()
  } catch (error) {
    hideLoading()
    updateStatus('Connection Failed', false)
    writeLine('Failed to connect to sandbox. Please refresh the page.')
    writeLine('')
    writeLine('')
  }
}

initTerminal().catch(error => {
  console.error(error)
  hideLoading()
  updateStatus('Connection Failed', false)
  writeLine('Failed to connect to sandbox. Please refresh the page.')
  writeLine(
    'Please report an issue at https://github.com/o-az/foundry-sandbox/issues',
  )
  writeLine('')
})
