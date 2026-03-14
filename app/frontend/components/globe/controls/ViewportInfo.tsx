import { useGlobeStore } from '~/stores/globeStore'

export function ViewportInfo() {
  const height = useGlobeStore((s) => s.height)
  const cellCount = useGlobeStore((s) => s.viewportH3Cells.length)

  const formatHeight = (h: number): string => {
    if (h >= 1_000_000) return `${(h / 1_000_000).toFixed(1)}k km`
    if (h >= 1_000) return `${(h / 1_000).toFixed(0)} km`
    return `${h.toFixed(0)} m`
  }

  return (
    <div className="rounded-lg bg-gray-900/80 px-3 py-2 text-xs text-white/70 backdrop-blur">
      <span>Alt: {formatHeight(height)}</span>
      <span className="mx-2">|</span>
      <span>H3 cells: {cellCount}</span>
    </div>
  )
}
