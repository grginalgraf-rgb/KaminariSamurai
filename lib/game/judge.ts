import { CONFIG, type HitTier } from './config'

export function tierFor(dt: number): HitTier | null {
  const a = Math.abs(dt)
  if (a <= CONFIG.judge.perfect) return 'perfect'
  if (a <= CONFIG.judge.good) return 'good'
  if (a <= CONFIG.judge.close) return 'close'
  return null
}

export function judge(slashTime: number, strikeTime: number): { tier: HitTier; dt: number } | null {
  const dt = slashTime - strikeTime
  const tier = tierFor(dt)
  return tier ? { tier, dt } : null
}

/** Intersection of segments AB and CD; u is the parameter along CD. */
export function segmentIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { s: number; u: number } | null {
  const rx = bx - ax
  const ry = by - ay
  const qx = dx - cx
  const qy = dy - cy
  const den = rx * qy - ry * qx
  if (Math.abs(den) < 1e-9) return null
  const s = ((cx - ax) * qy - (cy - ay) * qx) / den
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den
  return s >= 0 && s <= 1 && u >= 0 && u <= 1 ? { s, u } : null
}

export function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * Returns the segment parameter s in [0, 1] where the segment P0→P1 first
 * enters the circle, or null if it does not enter (including when it starts inside).
 */
export function segmentCircleEntry(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): number | null {
  const fx = x0 - cx
  const fy = y0 - cy
  const c = fx * fx + fy * fy - r * r
  if (c <= 0) return null
  const dx = x1 - x0
  const dy = y1 - y0
  const a = dx * dx + dy * dy
  if (a < 1e-6) return null
  const b = 2 * (fx * dx + fy * dy)
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const s = (-b - Math.sqrt(disc)) / (2 * a)
  return s >= 0 && s <= 1 ? s : null
}
