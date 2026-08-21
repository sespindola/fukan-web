// Per-frame console logging is surprisingly expensive with DevTools open and
// can itself create the latency this module is intended to diagnose.
const ENABLED = import.meta.env.DEV && import.meta.env.VITE_PERF_LOGS === 'true'

interface PerfStat {
  calls: number
  totalMs: number
  maxMs: number
  numeric: Record<string, number>
}

const stats = new Map<string, PerfStat>()
let reporterStarted = false

function record(label: string, elapsedMs: number, extra?: Record<string, unknown>): void {
  if (!ENABLED) return
  const stat = stats.get(label) ?? { calls: 0, totalMs: 0, maxMs: 0, numeric: {} }
  stat.calls++
  stat.totalMs += elapsedMs
  stat.maxMs = Math.max(stat.maxMs, elapsedMs)
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        stat.numeric[key] = (stat.numeric[key] ?? 0) + value
      }
    }
  }
  stats.set(label, stat)
  startReporter()
}

function startReporter(): void {
  if (reporterStarted || !ENABLED) return
  reporterStarted = true
  window.setInterval(() => {
    if (stats.size === 0) return
    const report = [...stats.entries()].map(([label, stat]) => ({
      label,
      calls: stat.calls,
      avg_ms: Number((stat.totalMs / stat.calls).toFixed(2)),
      max_ms: Number(stat.maxMs.toFixed(2)),
      ...stat.numeric,
    }))
    stats.clear()
    console.table(report)
  }, 1_000)

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record('browser.longtask', entry.duration)
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      // Long Task API is not available in every browser.
    }
  }
}

export function perfMark(label: string, extra?: Record<string, unknown>): void {
  record(label, 0, extra)
}

export function perfTime<T>(label: string, fn: () => T, extra?: Record<string, unknown>): T {
  if (!ENABLED) return fn()
  const start = performance.now()
  const result = fn()
  record(label, performance.now() - start, extra)
  return result
}
