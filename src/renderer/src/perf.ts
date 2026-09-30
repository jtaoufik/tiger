/**
 * Renderer half of the dev-only startup trace (see src/main/perf.ts). Marks
 * are absolute times so the main process can line them up with its own; it
 * drops them unless it runs unpackaged or with TIGER_PERF=1.
 */
const now = (): number => performance.timeOrigin + performance.now()

export function rendererPerfMark(name: string, at: number = now()): void {
  try {
    window.tiger?.perfMark?.(name, at)
  } catch {
    /* timing must never disturb the app */
  }
}

/** Report first-contentful-paint from the browser's own paint timing. */
export function observeFirstPaint(): void {
  if (typeof PerformanceObserver === 'undefined') return
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          rendererPerfMark('fcp', performance.timeOrigin + entry.startTime)
          observer.disconnect()
        }
      }
    })
    observer.observe({ type: 'paint', buffered: true })
  } catch {
    /* paint timing unsupported */
  }
}
