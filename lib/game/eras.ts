import { CONFIG, type EraDef, type EraPaletteHex } from './config'

export type RGB = [number, number, number]

export interface Palette {
  skyTop: RGB
  skyMid: RGB
  skyBottom: RGB
  accent: RGB
  accent2: RGB
  skyline: RGB
  stars: number
}

export const ERAS: EraDef[] = CONFIG.eras

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgba(c: RGB, a: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function resolve(p: EraPaletteHex): Palette {
  return {
    skyTop: hexToRgb(p.skyTop),
    skyMid: hexToRgb(p.skyMid),
    skyBottom: hexToRgb(p.skyBottom),
    accent: hexToRgb(p.accent),
    accent2: hexToRgb(p.accent2),
    skyline: hexToRgb(p.skyline),
    stars: p.stars,
  }
}

const RESOLVED: Palette[] = ERAS.map((e) => resolve(e.palette))

export function paletteFor(index: number): Palette {
  return RESOLVED[Math.max(0, Math.min(RESOLVED.length - 1, index))]
}

export function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  if (t <= 0) return a
  if (t >= 1) return b
  return {
    skyTop: mixRgb(a.skyTop, b.skyTop, t),
    skyMid: mixRgb(a.skyMid, b.skyMid, t),
    skyBottom: mixRgb(a.skyBottom, b.skyBottom, t),
    accent: mixRgb(a.accent, b.accent, t),
    accent2: mixRgb(a.accent2, b.accent2, t),
    skyline: mixRgb(a.skyline, b.skyline, t),
    stars: a.stars + (b.stars - a.stars) * t,
  }
}

export function eraIndexFor(year: number): number {
  let idx = 0
  for (let i = 0; i < ERAS.length; i++) {
    if (year >= ERAS[i].start) idx = i
  }
  return idx
}
