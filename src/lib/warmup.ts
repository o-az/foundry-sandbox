/**
 * Starts a recurring sandbox warmup loop that keeps the session container hot.
 */
export function startSandboxWarmup({
  sessionId,
  tabId,
  onWarmupFailure,
  intervalMs = 4 * 60 * 1000,
}: {
  sessionId: string
  tabId: string
  onWarmupFailure?: () => void
  intervalMs?: number
}) {
  if (typeof window === 'undefined') return () => {}

  void warmupSandbox(sessionId, tabId, false, onWarmupFailure)

  const timer = window.setInterval(() => {
    void warmupSandbox(sessionId, tabId, true, onWarmupFailure)
  }, intervalMs)

  return () => window.clearInterval(timer)
}

async function warmupSandbox(
  sessionId: string,
  tabId: string,
  recurring: boolean,
  onWarmupFailure?: () => void,
) {
  try {
    await fetch('/api/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, tabId }),
      keepalive: true,
    })
  } catch (error) {
    if (!recurring) {
      console.debug('Sandbox warmup failed', error)
      onWarmupFailure?.()
    }
  }
}
