const ENABLED = import.meta.env.DEV

export function perfMark(label: string, extra?: Record<string, unknown>): void {
  if (!ENABLED) return
  if (extra) {
    // eslint-disable-next-line no-console
    console.debug(`[perf] ${label}`, extra)
  } else {
    // eslint-disable-next-line no-console
    console.debug(`[perf] ${label}`)
  }
}

export function perfTime<T>(label: string, fn: () => T, extra?: Record<string, unknown>): T {
  if (!ENABLED) return fn()
  const start = performance.now()
  const result = fn()
  const elapsed = performance.now() - start
  // eslint-disable-next-line no-console
  console.debug(`[perf] ${label} ${elapsed.toFixed(2)}ms`, extra ?? '')
  return result
}
