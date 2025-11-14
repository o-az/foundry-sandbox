/**
 * Starts a recurring sandbox warmup loop that keeps the session container hot.
 * @param {object} options
 * @param {string} options.sessionId
 * @param {() => void} [options.onWarmupFailure]
 * @param {number} [options.intervalMs]
 * @returns {() => void} cleanup function that cancels the loop.
 */
export function startSandboxWarmup({
  sessionId,
  onWarmupFailure,
  intervalMs = 4 * 60 * 1000,
}) {
  warmupSandbox(sessionId, false, onWarmupFailure)

  const timer = window.setInterval(() => {
    warmupSandbox(sessionId, true, onWarmupFailure)
  }, intervalMs)

  return () => window.clearInterval(timer)
}

/**
 * @param {string} sessionId
 * @param {boolean} recurring
 * @param {() => void} [onWarmupFailure]
 */
function warmupSandbox(sessionId, recurring, onWarmupFailure) {
  fetch('/api/health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
    keepalive: true,
  }).catch(error => {
    if (!recurring) {
      console.debug('Sandbox warmup failed', error)
      onWarmupFailure?.()
    }
  })
}
