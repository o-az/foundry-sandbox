/**
 * @typedef {{ key: string; ctrl?: boolean; shift?: boolean }} VirtualKeyPayload
 * @typedef {Object} VirtualKeyboardBridgeOptions
 * @property {import('xterm-readline').Readline} xtermReadline
 * @property {(input: string) => void} sendInteractiveInput
 * @property {() => boolean} isInteractiveMode
 */

const ALT_ARROW_SEQUENCES = {
  ArrowUp: '\u001b[1;3A',
  ArrowDown: '\u001b[1;3B',
  ArrowLeft: '\u001b[1;3D',
  ArrowRight: '\u001b[1;3C',
}

/**
 * @param {VirtualKeyboardBridgeOptions} options
 * @returns {{ sendVirtualKeyboardInput: (payload: VirtualKeyPayload) => void, handleAltNavigation: (event: KeyboardEvent) => boolean }}
 */
export function createVirtualKeyboardBridge({
  xtermReadline,
  sendInteractiveInput,
  isInteractiveMode,
}) {
  /**
   * Injects virtual-keyboard payloads into the correct input pipeline.
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function sendVirtualKeyboardInput(payload) {
    if (
      !payload ||
      typeof payload.key !== 'string' ||
      payload.key.length === 0
    ) {
      return
    }
    handleVirtualKeyboardInput({
      key: payload.key,
      ctrl: Boolean(payload.ctrl),
      shift: Boolean(payload.shift),
    })
  }

  /**
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function handleVirtualKeyboardInput(payload) {
    if (isInteractiveMode()) {
      handleVirtualInteractiveInput(payload)
      return
    }
    handleVirtualReadlineInput(payload)
  }

  /**
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function handleVirtualInteractiveInput(payload) {
    const { key, ctrl, shift } = payload
    const controlChar = ctrl ? controlCharacterForKey(key) : undefined
    if (controlChar) {
      sendInteractiveInput(controlChar)
      return
    }

    if (key === 'Enter') {
      sendInteractiveInput('\r')
      return
    }

    if (key === 'Backspace') {
      sendInteractiveInput('\u0008')
      return
    }

    if (key.length === 1) {
      const shouldUppercase = shift && /^[a-z]$/i.test(key)
      const output = shouldUppercase ? key.toUpperCase() : key
      sendInteractiveInput(output)
    }
  }

  /**
   * @param {VirtualKeyPayload} payload
   * @returns {void}
   */
  function handleVirtualReadlineInput(payload) {
    const { key, ctrl, shift } = payload
    const controlChar = ctrl ? controlCharacterForKey(key) : undefined
    const internalReadline = /** @type {any} */ (xtermReadline)
    if (controlChar) {
      internalReadline.readData(controlChar)
      return
    }

    if (key === 'Enter') {
      internalReadline.readData('\r')
      return
    }

    if (key === 'Backspace') {
      internalReadline.readData('\u007f')
      return
    }

    if (key.length === 1) {
      const shouldUppercase = shift && /^[a-z]$/i.test(key)
      const output = shouldUppercase ? key.toUpperCase() : key
      internalReadline.readData(output)
    }
  }

  /**
   * Custom Alt+key behavior shared between readline and interactive modes.
   * @param {KeyboardEvent} domEvent
   * @returns {boolean}
   */
  function handleAltNavigation(domEvent) {
    if (!domEvent.altKey || domEvent.type !== 'keydown') return false

    if (isInteractiveMode()) {
      let seq
      if (isAltArrowKey(domEvent.key)) {
        seq = ALT_ARROW_SEQUENCES[domEvent.key]
      }
      domEvent.preventDefault()
      domEvent.stopPropagation()
      if (seq) {
        sendInteractiveInput(seq)
        return true
      }
      if (domEvent.key === 'Backspace') {
        sendInteractiveInput('\u001b\u007f')
        return true
      }
      if (domEvent.key.length === 1) {
        sendInteractiveInput(`\u001b${domEvent.key}`)
        return true
      }
      return false
    }

    domEvent.preventDefault()
    domEvent.stopPropagation()

    switch (domEvent.key) {
      case 'ArrowLeft':
        moveCursorByWord('left', xtermReadline)
        return true
      case 'ArrowRight':
        moveCursorByWord('right', xtermReadline)
        return true
      case 'ArrowUp':
        moveCursorToBoundary('home', xtermReadline)
        return true
      case 'ArrowDown':
        moveCursorToBoundary('end', xtermReadline)
        return true
      case 'Backspace':
        // @ts-expect-error
        xtermReadline.readData('\u001b\u007f')
        return true
      default:
        return false
    }
  }

  return {
    sendVirtualKeyboardInput,
    handleAltNavigation,
  }
}

/**
 * @param {'left' | 'right'} direction
 * @param {import('xterm-readline').Readline} xtermReadline
 * @returns {void}
 */
function moveCursorByWord(direction, xtermReadline) {
  const state = /** @type {any} */ (xtermReadline).state
  if (!state?.line) return
  const buffer = state.line.buffer()
  const current = state.line.pos ?? buffer.length
  if (direction === 'left') {
    const target = findWordBoundaryLeft(buffer, current)
    if (target === current) return
    state.line.set_pos(target)
    state.moveCursor()
    return
  }
  if (direction === 'right') {
    const target = findWordBoundaryRight(buffer, current)
    if (target === current) return
    state.line.set_pos(target)
    state.moveCursor()
  }
}

/**
 * @param {'home' | 'end'} direction
 * @param {import('xterm-readline').Readline} xtermReadline
 * @returns {void}
 */
function moveCursorToBoundary(direction, xtermReadline) {
  const state = /** @type {any} */ (xtermReadline).state
  if (!state) return
  if (direction === 'home') {
    state.moveCursorHome()
  } else if (direction === 'end') {
    state.moveCursorEnd()
  }
}

/**
 * @param {string} buffer
 * @param {number} index
 * @returns {number}
 */
function findWordBoundaryLeft(buffer, index) {
  let idx = Math.max(0, index)
  if (idx === 0) return 0
  idx--
  while (idx > 0 && /\s/.test(buffer[idx])) idx--
  while (idx > 0 && !/\s/.test(buffer[idx - 1])) idx--
  return idx
}

/**
 * @param {string} buffer
 * @param {number} index
 * @returns {number}
 */
function findWordBoundaryRight(buffer, index) {
  const len = buffer.length
  let idx = Math.max(0, index)
  if (idx >= len) return len
  while (idx < len && /\s/.test(buffer[idx])) idx++
  while (idx < len && !/\s/.test(buffer[idx])) idx++
  return idx
}

/**
 * Maps printable keys to their control-character equivalent, if any.
 * @param {string} rawKey
 * @returns {string | undefined}
 */
function controlCharacterForKey(rawKey) {
  if (!rawKey) return undefined
  const trimmed = rawKey.trim()
  if (!trimmed) return undefined

  const match = trimmed.match(/([a-zA-Z@[\]\\^_])$/)
  const base = match ? match[1] : trimmed[0]
  const upper = base.toUpperCase()
  const code = upper.codePointAt(0)
  if (code === undefined) return undefined

  if (upper >= 'A' && upper <= 'Z') {
    return String.fromCharCode(code - 64)
  }
  if (upper === '@') return '\u0000'
  if (upper === '[') return '\u001b'
  if (upper === '\\') return '\u001c'
  if (upper === ']') return '\u001d'
  if (upper === '^') return '\u001e'
  if (upper === '_') return '\u001f'
  return undefined
}

/**
 * @param {string} key
 * @returns {key is keyof typeof ALT_ARROW_SEQUENCES}
 */
function isAltArrowKey(key) {
  return key in ALT_ARROW_SEQUENCES
}
