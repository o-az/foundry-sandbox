import '@total-typescript/ts-reset/dom'

declare global {
  interface Window {
    xterm?: {
      textarea?: HTMLTextAreaElement | undefined
    }
  }
}
