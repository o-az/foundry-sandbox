import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js'
import type { Terminal } from '@xterm/xterm'
import type { JSX } from 'solid-js/h/jsx-runtime'
import { useKeyDownEvent } from '@solid-primitives/keyboard'
import { createActiveElement } from '@solid-primitives/active-element'
import { createEventDispatcher } from '@solid-primitives/event-dispatcher'

type ModifierKey = (typeof MODIFIER_KEYS)[number]

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta'] as const
const MODIFIER_META: Record<ModifierKey, { code: string; short: string }> = {
  Control: { code: 'ControlLeft', short: 'ctrl' },
  Shift: { code: 'ShiftLeft', short: 'shift' },
  Alt: { code: 'AltLeft', short: 'alt' },
  Meta: { code: 'MetaLeft', short: 'meta' },
}
const LETTER_REGEX = /^[a-zA-Z]$/

function isModifierKey(value: string): value is ModifierKey {
  return (MODIFIER_KEYS as readonly string[]).includes(value)
}

function isLatchModifier(
  value: string,
): value is Extract<ModifierKey, 'Control' | 'Shift'> {
  return value === 'Control' || value === 'Shift'
}

type KeyboardButtonProps = {
  value: ModifierKey
  label: string
  pressed: boolean
  onPress: (value: ModifierKey) => void
}

type TerminalWindow = Window & { xterm?: Terminal }

type ExtraKeyboardProps = {
  onVirtualKey?: (
    event: CustomEvent<{ key: string; modifiers: string[] }>,
  ) => void
  onToggle?: (event: CustomEvent<{ hidden: boolean }>) => void
}

export function ExtraKeyboard(props: ExtraKeyboardProps) {
  const [isHidden, setIsHidden] = createSignal(true)
  const [hasInteracted, setHasInteracted] = createSignal(false)

  const keydownEvent = useKeyDownEvent()
  const activeElement = createActiveElement()
  const dispatch = createEventDispatcher(props)
  const {
    value: latchedModifiers,
    toggle: toggleModifier,
    clear: clearLatchedModifiers,
    isActive: isModifierActive,
    snapshot: snapshotModifiers,
  } = createLatchedModifiers()
  const { ready, terminal, textarea } = createTerminalBridge()

  const toggleLabel = createMemo(() => {
    if (!hasInteracted()) return 'Extra Keys'
    return isHidden() ? 'Show Extra Keys' : 'Hide Extra Keys'
  })

  let synthesizing = false

  createEffect(() => {
    const event = keydownEvent()
    if (!event || synthesizing) return
    const textareaEl = textarea()
    if (!textareaEl) return
    if (latchedModifiers().size === 0) return
    if (event.ctrlKey) return
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement)) return
    if (target !== textareaEl) return
    event.preventDefault()
    event.stopPropagation()
    sendKeyPress(event.key)
  })

  onCleanup(() => {
    clearLatchedModifiers()
  })

  const handleToggleClick = () => {
    setHasInteracted(true)
    setIsHidden(hidden => {
      const next = !hidden
      dispatch('toggle', { hidden: next })
      return next
    })
  }

  const keyboardLabelFor = (value: ModifierKey) =>
    MODIFIER_META[value]?.short ?? value.toLowerCase()

  const focusTerminalTextarea = () => {
    const active = activeElement()
    if (active instanceof HTMLTextAreaElement) {
      active.focus()
      return
    }
    textarea()?.focus()
  }

  function handleButtonPress(value: ModifierKey) {
    if (isLatchModifier(value)) {
      toggleModifier(value)
      focusTerminalTextarea()
      return
    }
    const modifiersSnapshot = snapshotModifiers()
    sendKeyPress(value)
    dispatch('virtualKey', { key: value, modifiers: modifiersSnapshot })
    focusTerminalTextarea()
  }

  function dispatchSyntheticEvent(callback: () => void) {
    if (synthesizing) {
      callback()
      return
    }
    synthesizing = true
    try {
      callback()
    } finally {
      synthesizing = false
    }
  }

  function sendModifierKey(value: ModifierKey) {
    const meta = MODIFIER_META[value]
    const textareaEl = textarea()
    if (!textareaEl || !meta) return
    dispatchSyntheticEvent(() =>
      textareaEl.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: value,
          code: meta.code,
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
  }

  function trySendControlShortcut(key: string) {
    const textareaEl = textarea()
    if (!textareaEl) return false
    if (key.length !== 1 || !LETTER_REGEX.test(key)) return false
    const upperKey = key.toUpperCase()
    const keyCode = upperKey.charCodeAt(0)
    dispatchSyntheticEvent(() =>
      textareaEl.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: upperKey,
          code: `Key${upperKey}`,
          keyCode,
          which: keyCode,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
    return true
  }

  function trySendShiftInsert(key: string) {
    const textareaEl = textarea()
    if (!textareaEl) return false
    if (key.length !== 1) return false
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', key.toUpperCase())
    dispatchSyntheticEvent(() =>
      textareaEl.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
        }),
      ),
    )
    return true
  }

  function writeToTerminal(value: string) {
    terminal()?.write(value)
  }

  function sendKeyPress(value: string) {
    if (!terminal()) return
    if (isModifierKey(value)) {
      if (isLatchModifier(value)) return
      sendModifierKey(value)
      return
    }

    const modifiers = latchedModifiers()
    const hasControl = modifiers.has('Control')
    const hasShift = modifiers.has('Shift')

    if (hasControl || hasShift) {
      if (hasControl && trySendControlShortcut(value)) {
        clearLatchedModifiers()
        return
      }
      if (hasShift && trySendShiftInsert(value)) {
        clearLatchedModifiers()
        return
      }
      writeToTerminal(value)
      clearLatchedModifiers()
      return
    }

    writeToTerminal(value)
  }

  return (
    <Show when={ready()}>
      <div
        data-hidden={isHidden() ? 'true' : 'false'}
        data-element="extra-keyboard"
        class="keyboard-container">
        <For each={MODIFIER_KEYS}>
          {value => (
            <KeyboardButton
              value={value}
              label={keyboardLabelFor(value)}
              pressed={isModifierActive(value)}
              onPress={handleButtonPress}
            />
          )}
        </For>
      </div>
      <button
        type="button"
        id="extra-keys-toggler"
        class="key-toggler"
        data-element="extra-keys-toggler"
        onClick={handleToggleClick}>
        {toggleLabel()}
      </button>
    </Show>
  )
}

function createLatchedModifiers() {
  const [value, setValue] = createSignal<Set<ModifierKey>>(new Set())

  const toggle = (modifier: ModifierKey) => {
    if (!isLatchModifier(modifier)) return
    setValue(prev => {
      const next = new Set(prev)
      if (next.has(modifier)) next.delete(modifier)
      else next.add(modifier)
      return next
    })
  }

  const clear = () => setValue(() => new Set<ModifierKey>())
  const isActive = (modifier: ModifierKey) => value().has(modifier)
  const snapshot = () => Array.from(value()) as string[]

  return { value, toggle, clear, isActive, snapshot }
}

function createTerminalBridge() {
  const [ready, setReady] = createSignal(false)
  const [terminal, setTerminal] = createSignal<Terminal>()
  const [textarea, setTextarea] = createSignal<HTMLTextAreaElement>()
  let pollHandle: number | undefined

  const attach = () => {
    const instance = (window as TerminalWindow).xterm
    if (!instance?.textarea) return false
    setTerminal(instance)
    setTextarea(instance.textarea)
    setReady(true)
    return true
  }

  onMount(() => {
    if (typeof window === 'undefined') return
    if (window.location.search.includes('embed')) return
    if (attach()) return
    pollHandle = window.setInterval(() => {
      if (attach() && typeof pollHandle === 'number') {
        window.clearInterval(pollHandle)
        pollHandle = undefined
      }
    }, 100)
  })

  onCleanup(() => {
    if (typeof pollHandle === 'number') {
      window.clearInterval(pollHandle)
      pollHandle = undefined
    }
  })

  return { ready, terminal, textarea }
}

function KeyboardButton(props: KeyboardButtonProps) {
  const handleClick: JSX.EventHandlerUnion<
    HTMLButtonElement,
    MouseEvent
  > = event => {
    event.preventDefault()
    props.onPress(props.value)
    event.currentTarget?.blur()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-key={props.value}
      data-element="extra-keyboard-key"
      data-pressed={props.pressed ? 'true' : undefined}
      class="key"
      classList={{ 'key-pressed': props.pressed }}>
      {props.label}
    </button>
  )
}
