/**
 * @param ms milliseconds to sleep
 * @returns void
 */
export function sleep(ms: number): void {
  /**
   * In some environments such as Cloudflare Workers, Atomics is not defined
   * setTimeout is used as a fallback
   */
  if (typeof Atomics === 'undefined') {
    void new Promise(resolve => setTimeout(resolve, ms))
  } else {
    const AB = new Int32Array(new SharedArrayBuffer(4))
    Atomics.wait(AB, 0, 0, Math.max(1, ms | 0))
  }
}

/**
 * Wraps a synchronous or asynchronous operation and returns a Result object.
 * This function handles any thrown errors and prevents them from propagating up.
 *
 * @param operation The function to execute.
 * @returns A Result object: { ok: true, value: T } on success, or { ok: false, error: E } on failure.
 */
export async function nothrow<T>(
  operation: () => T | Promise<T>,
): Promise<Result<Awaited<T>>> {
  try {
    const value = await operation()
    return { ok: true, value: value as Awaited<T> }
  } catch (error) {
    // Ensure the error is always an Error instance for consistency
    const err = error instanceof Error ? error : new Error(String(error))
    return { ok: false, error: err }
  }
}

type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }
