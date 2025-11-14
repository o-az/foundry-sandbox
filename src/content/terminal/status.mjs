/**
 * @typedef {'online' | 'interactive' | 'error' | 'offline'} StatusMode
 */

export const STATUS_STYLE = /** @type {const} */ ({
  online: { text: 'Online', color: '#4ade80' },
  interactive: { text: 'Interactive', color: '#38bdf8' },
  error: { text: 'Error', color: '#f87171' },
  offline: { text: 'Offline', color: '#fbbf24' },
})

/** @type {HTMLParagraphElement | null} */
let statusElement
/** @type {StatusMode} */
let currentStatus = 'offline'

/**
 * Registers the DOM element used to display connection status.
 * @param {HTMLParagraphElement | null} element
 * @returns {void}
 */
export function initStatusIndicator(element) {
  statusElement = element ?? null
}

/**
 * @param {StatusMode} mode
 * @returns {void}
 */
export function setStatus(mode) {
  if (currentStatus === mode) return
  currentStatus = mode
  if (!statusElement) return

  const style = /** @type {(typeof STATUS_STYLE)[StatusMode]} */ (
    STATUS_STYLE[mode] ?? STATUS_STYLE.online
  )
  statusElement.style.top = '6px'
  statusElement.style.right = '6px'
  statusElement.style.zIndex = '1000'
  statusElement.style.fontSize = '14px'
  statusElement.textContent = style.text
  statusElement.style.color = style.color
  statusElement.style.position = 'absolute'
  statusElement.style.letterSpacing = '0.05em'
}

/**
 * @returns {StatusMode}
 */
export function getCurrentStatus() {
  return currentStatus
}
