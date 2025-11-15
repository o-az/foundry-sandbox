import { uniq } from 'es-toolkit'
import type { Terminal } from '@xterm/xterm'

export type VirtualInputHandler = (payload: {
  key: string
  ctrl?: boolean
  shift?: boolean
}) => void

type Modifier = { key: string; code: string; short: string }

type ModifierKey =
  | 'AltLeft'
  | 'AltRight'
  | 'MetaLeft'
  | 'MetaRight'
  | 'ShiftLeft'
  | 'ShiftRight'
  | 'ControlLeft'
  | 'ControlRight'

export class KeyboardHandler {
  #MODIFIERS: Record<ModifierKey, Modifier> = {
    AltLeft: { key: 'Alt', code: 'AltLeft', short: 'alt' },
    AltRight: { key: 'Alt', code: 'AltRight', short: 'alt' },
    MetaLeft: { key: 'Meta', code: 'MetaLeft', short: 'meta' },
    MetaRight: { key: 'Meta', code: 'MetaRight', short: 'meta' },
    ShiftLeft: { key: 'Shift', code: 'ShiftLeft', short: 'shift' },
    ShiftRight: { key: 'Shift', code: 'ShiftRight', short: 'shift' },
    ControlLeft: { key: 'Control', code: 'ControlLeft', short: 'ctrl' },
    ControlRight: { key: 'Control', code: 'ControlRight', short: 'ctrl' },
  }

  #activeModifiers = new Set<string>()
  #synthesizing = false

  constructor(
    private options: {
      terminal?: Terminal
      virtualInput?: VirtualInputHandler
    } = {},
  ) {}

  get modifiers() {
    return this.#MODIFIERS
  }

  getModifierShort(key: string) {
    const match = Object.values(this.#MODIFIERS).find(
      modifier => modifier.key === key,
    )
    return match?.short ?? key
  }

  modifierKeys() {
    return uniq(Object.values(this.#MODIFIERS).map(modifier => modifier.key))
  }

  toggleModifier(key: string) {
    if (key === 'Control' || key === 'Shift') {
      if (this.#activeModifiers.has(key)) {
        this.#activeModifiers.delete(key)
        return false
      }
      this.#activeModifiers.add(key)
      return true
    }
    return false
  }

  clearModifiers() {
    this.#activeModifiers.clear()
  }

  getActiveModifiers() {
    return new Set(this.#activeModifiers)
  }

  isSynthesizing() {
    return this.#synthesizing
  }

  isModifierActive(key: string) {
    return this.#activeModifiers.has(key)
  }

  sendKeyPress(key: string) {
    const textarea = this.options.terminal?.textarea

    const modifierEntry = Object.entries(this.#MODIFIERS).find(
      ([, value]) => value.key === key,
    )

    if (modifierEntry) {
      const [, modifier] = modifierEntry
      if (key === 'Control' || key === 'Shift') {
        return
      }
      if (textarea) {
        const keyEvent = new KeyboardEvent('keydown', {
          key: modifier.key,
          code: modifier.code,
          bubbles: true,
          cancelable: true,
        })
        this.#dispatchSyntheticEvent(() => textarea.dispatchEvent(keyEvent))
      }
      return
    }

    const hasControl = this.#activeModifiers.has('Control')
    const hasShift = this.#activeModifiers.has('Shift')

    if (hasControl || hasShift) {
      if (typeof this.options.virtualInput === 'function') {
        this.options.virtualInput({ key, ctrl: hasControl, shift: hasShift })
        this.clearModifiers()
        return
      }

      if (
        textarea &&
        hasControl &&
        key.length === 1 &&
        /^[a-zA-Z]$/.test(key)
      ) {
        const upperKey = key.toUpperCase()
        const keyEvent = new KeyboardEvent('keydown', {
          key: upperKey,
          code: `Key${upperKey}`,
          keyCode: upperKey.charCodeAt(0),
          which: upperKey.charCodeAt(0),
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          bubbles: true,
          cancelable: true,
        })
        this.#dispatchSyntheticEvent(() => textarea.dispatchEvent(keyEvent))
        this.clearModifiers()
        return
      }

      if (textarea && hasShift && key.length === 1) {
        const dataTransfer = new DataTransfer()
        dataTransfer.setData('text/plain', key.toUpperCase())
        this.#dispatchSyntheticEvent(() =>
          textarea.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
            }),
          ),
        )
        this.clearModifiers()
        return
      }

      this.options.terminal?.write(key)
      this.clearModifiers()
      return
    }

    this.options.terminal?.write(key)
  }

  #dispatchSyntheticEvent(callback: () => void) {
    if (this.#synthesizing) {
      callback()
      return
    }
    this.#synthesizing = true
    try {
      callback()
    } finally {
      this.#synthesizing = false
    }
  }
}
