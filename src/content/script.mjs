import {
  getTerminal,
  getReadline,
  getFitAddon,
  initTerminal,
  getSerializeAddon,
  disposeTerminal,
} from './terminal/instance.mjs'
import {
  autoRun,
  sessionId,
  embedMode,
  prefilledCommand,
  INTERACTIVE_COMMANDS,
} from './state/session.mjs'
import { startSandboxWarmup } from './state/warmup.mjs'
import { createCommandRunner } from './commands/runner.mjs'
import { createVirtualKeyboardBridge } from './input/virtual.mjs'
import { createInteractiveSession } from './interactive/session.mjs'
import { initStatusIndicator, setStatus } from './terminal/status.mjs'

const PROMPT = '\u001b[32m$\u001b[0m '
const LOCAL_COMMANDS = new Set(['clear'])

let awaitingInput = false
let commandInProgress = false
let hasPrefilledCommand = false

/** @type {(event: KeyboardEvent) => boolean} */
let altNavigationDelegate = () => false

initTerminal({
  onAltNavigation: event => altNavigationDelegate(event),
})

const terminal = getTerminal()
const fitAddon = getFitAddon()
const xtermReadline = getReadline()
const serializeAddon = getSerializeAddon()

const statusText = document.querySelector('p#status-text')
if (statusText) initStatusIndicator(statusText)

terminal.writeln('\n')
terminal.focus()
setStatus(navigator.onLine ? 'online' : 'offline')

const footer = document.querySelector('footer#footer')
if (footer && !embedMode) footer.classList.add('footer')
else footer?.classList.remove('footer')

const stopWarmup = startSandboxWarmup({ sessionId })

const { runCommand } = createCommandRunner({
  sessionId,
  terminal,
  serializeAddon,
  setStatus,
  displayError,
})

const {
  startInteractiveSession,
  sendInteractiveKey,
  sendInteractiveInput,
  notifyResize,
  isInteractiveMode,
} = createInteractiveSession({
  terminal,
  serializeAddon,
  setStatus,
  onSessionExit: () => {
    commandInProgress = false
    startInputLoop()
  },
})

const { sendVirtualKeyboardInput, handleAltNavigation } =
  createVirtualKeyboardBridge({
    xtermReadline,
    sendInteractiveInput,
    isInteractiveMode,
  })
altNavigationDelegate = handleAltNavigation

const interactiveTextarea = /** @type {HTMLTextAreaElement | null} */ (
  terminal.textarea
)
interactiveTextarea?.addEventListener('paste', event => {
  if (!isInteractiveMode()) return
  const text = event.clipboardData?.getData('text')
  if (!text) return
  event.preventDefault()
  sendInteractiveInput(text)
})

xtermReadline.setCtrlCHandler(() => {
  if (isInteractiveMode() || commandInProgress) return
  xtermReadline.println('^C')
  setStatus('online')
  startInputLoop()
})

terminal.onKey(event => {
  if (event.domEvent.defaultPrevented) return
  if (!isInteractiveMode()) return
  event.domEvent.preventDefault()
  sendInteractiveKey(event.key, event.domEvent)
})

window.addEventListener('online', () => {
  if (!isInteractiveMode()) setStatus('online')
})
window.addEventListener('offline', () => setStatus('offline'))

window.addEventListener('message', event => {
  if (event.data?.type === 'execute') {
    terminal.options.disableStdin = false
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
    })
    terminal.textarea?.dispatchEvent(enterEvent)
    setTimeout(() => {
      if (embedMode) {
        terminal.options.disableStdin = true
      }
    }, 200)
  }
})

window.addEventListener('resize', () => {
  if (!document.hidden) {
    fitAddon.fit()
    notifyResize({
      cols: terminal.cols,
      rows: terminal.rows,
    })
  }
})

// Tear down the sandbox when the page is closed to avoid idle containers.
let teardownScheduled = false
function teardownSandbox() {
  if (teardownScheduled) return
  teardownScheduled = true
  stopWarmup?.()
  disposeTerminal()
  const body = JSON.stringify({ sessionId })
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    navigator.sendBeacon('/api/reset', blob)
    return
  }
  fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Ignore network errors; page is unloading.
  })
}

window.addEventListener('pagehide', teardownSandbox, { once: true })
window.addEventListener('beforeunload', teardownSandbox, { once: true })

startInputLoop()

/**
 * Kicks off the readline prompt loop unless an interactive session is active.
 * @returns {void}
 */
function startInputLoop() {
  if (isInteractiveMode() || awaitingInput) return
  awaitingInput = true

  xtermReadline
    .read(PROMPT)
    .then(async rawCommand => {
      awaitingInput = false
      await processCommand(rawCommand)
      startInputLoop()
    })
    .catch(error => {
      awaitingInput = false
      if (isInteractiveMode()) return
      console.error('xtermReadline error', error)
      setStatus('error')
      startInputLoop()
    })

  if (!hasPrefilledCommand && prefilledCommand) {
    hasPrefilledCommand = true
    setTimeout(() => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', prefilledCommand ?? '')
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
      })
      terminal.textarea?.dispatchEvent(pasteEvent)

      if (embedMode && !autoRun) terminal.options.disableStdin = true

      if (autoRun) {
        setTimeout(() => {
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          })
          terminal.textarea?.dispatchEvent(enterEvent)
        }, 100)
      }
    }, 50)
  }
}

/**
 * @param {string} rawCommand
 * @returns {Promise<void>}
 */
async function processCommand(rawCommand) {
  const trimmed = rawCommand.trim()
  if (!trimmed) {
    setStatus('online')
    return
  }

  if (isLocalCommand(trimmed)) {
    executeLocalCommand(trimmed)
    return
  }

  if (INTERACTIVE_COMMANDS.has(trimmed)) {
    commandInProgress = true
    await startInteractiveSession(rawCommand)
    return
  }

  commandInProgress = true
  setStatus('online')

  try {
    await runCommand(rawCommand)
    if (!isInteractiveMode()) setStatus('online')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus('error')
    displayError(message)
  } finally {
    commandInProgress = false
  }
}

/**
 * @param {string} command
 * @returns {boolean}
 */
function isLocalCommand(command) {
  return LOCAL_COMMANDS.has(command.trim().toLowerCase())
}

/**
 * @param {string} command
 * @returns {void}
 */
function executeLocalCommand(command) {
  if (command.trim().toLowerCase() === 'clear') {
    terminal.clear()
    setStatus('online')
  }
}

/**
 * @param {string} message
 */
function displayError(message) {
  terminal.writeln(`\u001b[31m${message}\u001b[0m`, () => {
    console.info(serializeAddon.serialize())
  })
}

export { getTerminal, sendVirtualKeyboardInput }
