export type StatusMode = 'online' | 'interactive' | 'error' | 'offline'

const STATUS_STYLE: Record<StatusMode, { text: string; color: string }> = {
  online: { text: 'Online', color: '#4ade80' },
  interactive: { text: 'Interactive', color: '#38bdf8' },
  error: { text: 'Error', color: '#f87171' },
  offline: { text: 'Offline', color: '#fbbf24' },
}

export class StatusIndicator {
  #element?: HTMLElement | null
  #currentStatus: StatusMode = 'offline'
  #onChange?: (mode: StatusMode) => void

  constructor(
    element?: HTMLElement | null,
    options?: { onChange?: (mode: StatusMode) => void },
  ) {
    this.#element = element ?? null
    this.#onChange = options?.onChange
  }

  setStatus(mode: StatusMode) {
    if (this.#currentStatus === mode) return
    this.#currentStatus = mode
    if (this.#element) {
      const style = STATUS_STYLE[mode]
      this.#element.textContent = style.text
      Object.assign(this.#element.style, {
        top: '6px',
        right: '6px',
        zIndex: '1000',
        fontSize: '14px',
        color: style.color,
        position: 'absolute',
        letterSpacing: '0.05em',
      })
    }
    this.#onChange?.(mode)
  }

  getCurrentStatus() {
    return this.#currentStatus
  }
}

export { STATUS_STYLE }
