import { createStart } from '@tanstack/solid-start'

export const startInstance = createStart(() => ({
  defaultSsr: false, // default is true
}))
