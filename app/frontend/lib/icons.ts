/**
 * Canvas-generated icons for CesiumJS BillboardCollections.
 * Generated once, reused via CesiumJS internal texture atlas.
 */

export function createAircraftIcon(
  size = 32,
  color = '#00e5ff',
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.4

  // Upward-pointing chevron (north = 0° rotation in CesiumJS)
  ctx.beginPath()
  ctx.moveTo(cx, cy - r) // top (nose)
  ctx.lineTo(cx + r * 0.6, cy + r * 0.7) // bottom-right
  ctx.lineTo(cx, cy + r * 0.3) // notch
  ctx.lineTo(cx - r * 0.6, cy + r * 0.7) // bottom-left
  ctx.closePath()

  ctx.fillStyle = color
  ctx.fill()

  return canvas
}
