import { Terminal } from '@xterm/xterm'
import { Readline } from 'xterm-readline'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { ImageAddon } from '@xterm/addon-image'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { LigaturesAddon } from '@xterm/addon-ligatures'

/**
 * Shared xterm.js terminal instance.
 * @type {Terminal}
 */
const terminal = new Terminal({
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
  fontFamily: "'Lilex', monospace",
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

/** @type {FitAddon} */
const fitAddon = new FitAddon()
/** @type {WebglAddon} */
const webglAddon = new WebglAddon()
/** @type {Unicode11Addon} */
const unicode11Addon = new Unicode11Addon()
/** @type {SerializeAddon} */
const serializeAddon = new SerializeAddon()
/** @type {SearchAddon} */
const searchAddon = new SearchAddon({ highlightLimit: 50 })
/** @type {ImageAddon} */
const imageAddon = new ImageAddon({ showPlaceholder: true })
/** @type {ClipboardAddon} */
const clipboardAddon = new ClipboardAddon()
/** @type {LigaturesAddon} */
const ligaturesAddon = new LigaturesAddon()
/** @type {WebLinksAddon} */
const webLinksAddon = new WebLinksAddon((event, url) => {
  event.preventDefault()
  window.open(url, '_blank', 'noopener,noreferrer')
})
/** @type {Readline} */
const xtermReadline = new Readline()

const disposables = [
  fitAddon,
  webglAddon,
  unicode11Addon,
  serializeAddon,
  searchAddon,
  imageAddon,
  clipboardAddon,
  ligaturesAddon,
  webLinksAddon,
  xtermReadline,
]

webglAddon.onContextLoss(() => webglAddon.dispose())
terminal.onBell(() => {
  console.info('bell')
})
terminal.loadAddon(webglAddon)

let initialized = false

/**
 * @typedef {Object} TerminalInitOptions
 * @property {(event: KeyboardEvent) => boolean} [onAltNavigation]
 */

/**
 * Initializes the terminal singleton and attaches it to the DOM.
 * @param {TerminalInitOptions} [options]
 * @returns {Terminal}
 */
export function initTerminal({ onAltNavigation } = {}) {
  if (initialized) return terminal
  const terminalElement = document.querySelector('div#terminal')
  if (!terminalElement) throw new Error('Terminal element not found')

  terminal.open(terminalElement)
  // Attach terminal instance to DOM element for context-like access
  // @ts-expect-error - xterm property is not typed
  terminalElement.xterm = terminal

  terminal.loadAddon(fitAddon)
  terminal.loadAddon(searchAddon)
  terminal.loadAddon(clipboardAddon)
  terminal.loadAddon(unicode11Addon)
  terminal.unicode.activeVersion = '11'
  terminal.loadAddon(serializeAddon)
  terminal.loadAddon(ligaturesAddon)
  terminal.loadAddon(webLinksAddon)
  terminal.loadAddon(imageAddon)
  terminal.loadAddon(xtermReadline)

  terminal.attachCustomKeyEventHandler(event => {
    if (typeof onAltNavigation === 'function' && onAltNavigation(event)) {
      return false
    }
    if (
      event.type === 'keydown' &&
      event.key === 'c' &&
      event.ctrlKey &&
      event.metaKey
    ) {
      return false
    }
    return true
  })

  scheduleInitialFit()
  initialized = true
  return terminal
}

/**
 * @returns {Terminal}
 */
export function getTerminal() {
  if (!initialized) throw new Error('Terminal not initialized')
  return terminal
}

/**
 * @returns {Readline}
 */
export function getReadline() {
  if (!initialized) throw new Error('Terminal not initialized')
  return xtermReadline
}

/**
 * @returns {FitAddon}
 */
export function getFitAddon() {
  if (!initialized) throw new Error('Terminal not initialized')
  return fitAddon
}

/**
 * @returns {SerializeAddon}
 */
export function getSerializeAddon() {
  if (!initialized) throw new Error('Terminal not initialized')
  return serializeAddon
}

/**
 * Disposes the terminal instance and all loaded addons.
 */
export function disposeTerminal() {
  if (!initialized) return
  try {
    terminal.dispose()
  } finally {
    for (const addon of disposables) {
      if (typeof addon.dispose === 'function') addon.dispose()
    }
  }
  initialized = false
}

function scheduleInitialFit() {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready.then(() => fitAddon.fit()).catch(() => fitAddon.fit())
    return
  }
  setTimeout(() => fitAddon.fit(), 25)
}
