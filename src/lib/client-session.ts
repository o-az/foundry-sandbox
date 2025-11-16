const STREAMING_COMMANDS = new Set(['anvil'])
const INTERACTIVE_COMMANDS = new Set(['chisel', 'node'])

type LogLevel = 'info' | 'debug'

export type ClientSessionState = {
  sessionId: string
  tabId: string
  isNewSession: boolean
  prefilledCommand: string | null
  embedMode: boolean
  autoRun: boolean
  logLevel: LogLevel
}

export function ensureClientSession(): ClientSessionState {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    throw new Error('Client session can only be initialized in the browser')
  }

  let sessionId = localStorage.getItem('sessionId')
  if (!sessionId) {
    sessionId = `session-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 9)}`

    localStorage.setItem('sessionId', sessionId)
  }

  let tabId = sessionStorage.getItem('tabId')
  if (!tabId) {
    tabId = `tab-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 9)}`
    sessionStorage.setItem('tabId', tabId)
  }

  const isNewSession = !sessionStorage.getItem('sessionActive')
  sessionStorage.setItem('sessionActive', 'true')

  const params = new URL(window.location.href).searchParams

  return {
    sessionId,
    tabId,
    isNewSession,
    prefilledCommand: params.get('cmd'),
    embedMode: params.get('embed') === 'true',
    autoRun: params.get('autorun') === 'true',
    logLevel: params.get('log') === 'debug' ? 'debug' : 'info',
  }
}

export function clearStoredSessionState() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('sessionId')
  sessionStorage.removeItem('tabId')
  sessionStorage.removeItem('sessionActive')
  sessionStorage.removeItem('wasRefreshing')
}

export function markRefreshIntent() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem('wasRefreshing', 'true')
}

export function consumeRefreshIntent(): boolean {
  if (typeof window === 'undefined') return false
  if (sessionStorage.getItem('wasRefreshing') === 'true') {
    sessionStorage.removeItem('wasRefreshing')
    return true
  }
  return false
}

export { STREAMING_COMMANDS, INTERACTIVE_COMMANDS }
