/**
 * @typedef {Set<string>} CommandSet
 */

/** @type {CommandSet} */
const STREAMING_COMMANDS = new Set(['anvil'])
/** @type {CommandSet} */
const INTERACTIVE_COMMANDS = new Set(['chisel', 'node'])
/** @type {string} */
const API_ENDPOINT = '/api/exec'
/** @type {string} */
const WS_ENDPOINT = '/api/ws'

/** @type {string} */
const sessionId =
  localStorage.getItem('sessionId') ||
  `session-${Math.random().toString(36).slice(2, 9)}`
localStorage.setItem('sessionId', sessionId)

const params = new URLSearchParams(window.location.search)
/** @type {string | null} */
const prefilledCommand = params.get('cmd')
/** @type {boolean} */
const embedMode = params.get('embed') === 'true'
/** @type {boolean} */
const autoRun = params.get('autorun') === 'true'

export {
  API_ENDPOINT,
  WS_ENDPOINT,
  STREAMING_COMMANDS,
  INTERACTIVE_COMMANDS,
  sessionId,
  prefilledCommand,
  embedMode,
  autoRun,
}
