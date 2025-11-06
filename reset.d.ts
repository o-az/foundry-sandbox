import '@total-typescript/ts-reset/recommended'

import type * as Bun from 'bun'

declare global {
  type WebSocket = Bun.WebSocket
}
