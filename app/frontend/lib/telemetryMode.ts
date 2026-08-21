export const TELEMETRY_LOD_ENABLED = import.meta.env.VITE_TELEMETRY_LOD !== 'false'

export function aggregateModeForResolution(resolution: number): boolean {
  return TELEMETRY_LOD_ENABLED && resolution <= 4
}
