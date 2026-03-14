/** Decode ClickHouse Int32 latitude to float degrees */
export const decodeLat = (v: number): number => v / 10_000_000

/** Decode ClickHouse Int32 longitude to float degrees */
export const decodeLon = (v: number): number => v / 10_000_000

/** Encode float degrees to ClickHouse Int32 */
export const encodeLat = (v: number): number => Math.round(v * 10_000_000)

/** Encode float degrees to ClickHouse Int32 */
export const encodeLon = (v: number): number => Math.round(v * 10_000_000)

/** Convert degrees to radians */
export const toRadians = (deg: number): number => (deg * Math.PI) / 180

/** Convert radians to degrees */
export const toDegrees = (rad: number): number => (rad * 180) / Math.PI
