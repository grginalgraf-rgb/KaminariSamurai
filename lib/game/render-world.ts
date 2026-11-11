import { CONFIG, type SkylineKind } from './config'
import { mixRgb, rgba, type Palette, type RGB } from './eras'

const INK_BASE: RGB = [2, 2, 6]

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function inkColor(pal: Palette): RGB {
  return mixRgb(pal.skyline, INK_BASE, 0.7)
}

/* ---------- Sky ---------- */

const STARS = (() => {
  const r = mulberry32(42)
  return Array.from({ length: 140 }, () => ({
    x: r(),
    y: r() * 0.72,
    s: 0.4 + r() * 1.2,
    ph: r() * Math.PI * 2,
  }))
})()

export function drawSky(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gy: number,
  pal: Palette,
  time: number,
  lightning: number,
) {
  const g = ctx.createLinearGradient(0, 0, 0, gy)
  g.addColorStop(0, rgba(pal.skyTop, 1))
  g.addColorStop(0.55, rgba(pal.skyMid, 1))
  g.addColorStop(1, rgba(pal.skyBottom, 1))
  ctx.fillStyle = g
  ctx.fillRect(-20, -20, W + 40, H + 40)

  if (pal.stars > 0.01) {
    for (const s of STARS) {
      const tw = 0.55 + 0.45 * Math.sin(time * 0.002 + s.ph)
      ctx.fillStyle = rgba(pal.accent2, pal.stars * tw * 0.8)
      ctx.fillRect(s.x * W, s.y * H, s.s, s.s)
    }
  }

  if (lightning > 0) {
    const lg = ctx.createLinearGradient(0, 0, 0, gy)
    lg.addColorStop(0, rgba(pal.accent2, lightning))
    lg.addColorStop(1, rgba(pal.accent2, 0))
    ctx.fillStyle = lg
    ctx.fillRect(-20, -20, W + 40, gy + 20)
  }
}

export function drawAurora(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Palette, time: number, alpha: number) {
  if (alpha <= 0.01) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = rgba(i % 2 === 0 ? pal.accent : pal.accent2, 0.09 * alpha)
    ctx.lineWidth = 28 - i * 6
    ctx.beginPath()
    for (let x = -20; x <= W + 20; x += 12) {
      const y = H * (0.18 + i * 0.07) + Math.sin(x * 0.012 + time * 0.0004 + i * 1.7) * 22
      if (x === -20) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/* ---------- Skylines ---------- */

interface Building {
  x: number
  w: number
  h: number
  type: number
  seed: number
  windows: [number, number][]
}

const SPECS: Record<SkylineKind, { w: [number, number]; h: [number, number]; gap: [number, number]; special: number }> = {
  edo: { w: [40, 80], h: [22, 48], gap: [2, 10], special: 0.12 },
  meiji: { w: [30, 60], h: [30, 74], gap: [2, 8], special: 0.25 },
  modern: { w: [22, 50], h: [60, 190], gap: [3, 10], special: 0.3 },
  future: { w: [14, 34], h: [120, 330], gap: [6, 16], special: 0.5 },
  neon: { w: [20, 44], h: [90, 270], gap: [4, 12], special: 0.5 },
  deep: { w: [8, 22], h: [30, 120], gap: [60, 140], special: 0 },
  beyond: { w: [0, 0], h: [0, 0], gap: [0, 0], special: 0 },
}

const layerCache = new Map<string, Building[]>()

function getLayer(kind: SkylineKind, layer: number, W: number): Building[] {
  const key = `${kind}:${layer}:${Math.round(W)}`
  const cached = layerCache.get(key)
  if (cached) return cached
  const spec = SPECS[kind]
  const out: Building[] = []
  if (kind !== 'beyond') {
    const r = mulberry32(kind.length * 997 + layer * 131 + 7)
    const hMul = layer === 0 ? 0.7 : 1
    let x = 0
    while (x < W * 2) {
      const w = lerp(spec.w[0], spec.w[1], r())
      const h = lerp(spec.h[0], spec.h[1], r()) * hMul
      const type = r() < spec.special ? 1 : 0
      const windows: [number, number][] = []
      if (layer === 1 && (kind === 'modern' || kind === 'meiji')) {
        const n = Math.floor(h / 18)
        for (let i = 0; i < n; i++) if (r() < 0.35) windows.push([4 + r() * (w - 8), 6 + r() * (h - 12)])
      }
      out.push({ x, w, h, type, seed: r() * 1000, windows })
      x += w + lerp(spec.gap[0], spec.gap[1], r())
    }
  }
  layerCache.set(key, out)
  return out
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  kind: SkylineKind,
  b: Building,
  x: number,
  base: number,
  pal: Palette,
  layer: number,
  time: number,
  alpha: number,
) {
  const top = base - b.h
  const w = b.w
  switch (kind) {
    case 'edo': {
      if (b.type === 1) {
        const tiers = 4
        const th = (b.h * 2.2) / tiers
        for (let i = 0; i < tiers; i++) {
          const tw = w * (1 - i * 0.17)
          const cx = x + w / 2
          const ty = base - (i + 1) * th
          ctx.fillRect(cx - tw * 0.3, ty, tw * 0.6, th)
          ctx.beginPath()
          ctx.moveTo(cx - tw / 2 - 6, ty + 3)
          ctx.quadraticCurveTo(cx, ty - th * 0.3, cx + tw / 2 + 6, ty + 3)
          ctx.closePath()
          ctx.fill()
        }
        ctx.fillRect(x + w / 2 - 1, base - tiers * th - 18, 2, 18)
      } else {
        ctx.fillRect(x, top, w, b.h)
        ctx.beginPath()
        ctx.moveTo(x - 6, top + 2)
        ctx.quadraticCurveTo(x + w * 0.25, top - 2, x + w / 2, top - w * 0.26)
        ctx.quadraticCurveTo(x + w * 0.75, top - 2, x + w + 6, top + 2)
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'meiji': {
      ctx.fillRect(x, top, w, b.h)
      if (b.type === 1) ctx.fillRect(x + w * 0.65, top - 16, 6, 16)
      break
    }
    case 'modern': {
      ctx.fillRect(x, top, w, b.h)
      if (b.type === 1) ctx.fillRect(x + w / 2 - 0.75, top - 22, 1.5, 22)
      break
    }
    case 'future': {
      ctx.fillRect(x, top, w, b.h)
      if (b.type === 1) {
        ctx.beginPath()
        ctx.moveTo(x, top)
        ctx.lineTo(x + w / 2, top - 40)
        ctx.lineTo(x + w, top)
        ctx.closePath()
        ctx.fill()
      }
      if (layer === 1) {
        const save = ctx.fillStyle
        ctx.fillStyle = rgba(pal.accent2, 0.55 * alpha)
        ctx.fillRect(x + w - 1.5, top, 1.5, b.h)
        const blink = 0.5 + 0.5 * Math.sin(time * 0.003 + b.seed)
        ctx.fillStyle = rgba(pal.accent, blink * alpha)
        ctx.fillRect(x + w / 2 - 1.5, top - (b.type === 1 ? 42 : 3), 3, 3)
        ctx.fillStyle = save
      }
      break
    }
    case 'neon': {
      ctx.fillRect(x, top, w, b.h)
      if (layer === 1) {
        const save = ctx.fillStyle
        ctx.fillStyle = rgba(b.seed % 2 > 1 ? pal.accent : pal.accent2, 0.7 * alpha)
        ctx.fillRect(x + 3, top + 6, 2, b.h * 0.6)
        if (b.type === 1) {
          ctx.fillStyle = rgba(pal.accent2, 0.5 * alpha)
          ctx.fillRect(x + 6, top + 20, w - 12, 8)
        }
        ctx.fillStyle = save
      }
      break
    }
    case 'deep': {
      const cy = base - 150 - b.h * 0.8 + Math.sin(time * 0.0008 + b.seed) * 6
      const cx = x + w / 2
      ctx.beginPath()
      ctx.moveTo(cx, cy - b.h / 2)
      ctx.lineTo(cx + w / 2, cy)
      ctx.lineTo(cx, cy + b.h / 2)
      ctx.lineTo(cx - w / 2, cy)
      ctx.closePath()
      ctx.fill()
      const save = ctx.strokeStyle
      ctx.strokeStyle = rgba(pal.accent, 0.35 * alpha)
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.strokeStyle = save
      break
    }
    default:
      break
  }

  if (b.windows.length > 0) {
    const save = ctx.fillStyle
    ctx.fillStyle = rgba(pal.accent, 0.45 * alpha)
    for (const [wx, wy] of b.windows) ctx.fillRect(x + wx, top + wy, 2, 2.5)
    ctx.fillStyle = save
  }
}

export function drawSkyline(
  ctx: CanvasRenderingContext2D,
  kind: SkylineKind,
  W: number,
  gy: number,
  offset: number,
  pal: Palette,
  alpha: number,
  time: number,
) {
  if (alpha <= 0.01 || kind === 'beyond') return
  const span = W * 2
  for (let layer = 0; layer < 2; layer++) {
    const list = getLayer(kind, layer, W)
    const speed = layer === 0 ? 0.35 : 1
    const color = layer === 0 ? mixRgb(pal.skyline, pal.skyMid, 0.5) : pal.skyline
    const base = gy + 6 - (layer === 0 ? 10 : 0)
    ctx.fillStyle = rgba(color, alpha)
    for (const b of list) {
      const xPos = (((b.x - offset * speed) % span) + span) % span
      for (const px of [xPos, xPos - span]) {
        if (px < W + 10 && px + b.w > -10) drawBuilding(ctx, kind, b, px, base, pal, layer, time, alpha)
      }
    }
  }
}

/* ---------- Foreground ---------- */

export function rooftopY(gy: number) {
  return gy + 1
}

export function drawRooftop(ctx: CanvasRenderingContext2D, W: number, H: number, gy: number, pal: Palette) {
  const ink = mixRgb(inkColor(pal), pal.skyline, 0.3)
  ctx.fillStyle = rgba(ink, 1)
  ctx.beginPath()
  ctx.moveTo(-20, gy + 4)
  ctx.quadraticCurveTo(W / 2, gy - 2, W + 20, gy + 4)
  ctx.lineTo(W + 20, H + 20)
  ctx.lineTo(-20, H + 20)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = rgba(pal.accent, 0.28)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(-20, gy + 4)
  ctx.quadraticCurveTo(W / 2, gy - 2, W + 20, gy + 4)
  ctx.stroke()

  ctx.strokeStyle = rgba(pal.accent2, 0.05)
  for (let x = -40; x < W + 60; x += 14) {
    ctx.beginPath()
    ctx.moveTo(x, gy + 10)
    ctx.lineTo(x - 30, H)
    ctx.stroke()
  }

  ctx.fillStyle = rgba(ink, 1)
  for (const cx of [10, W - 10]) {
    ctx.beginPath()
    ctx.arc(cx, gy + 2, 7, Math.PI, 0)
    ctx.fill()
  }
}

export function drawHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rift: number,
  pal: Palette,
  contract: number,
) {
  if (contract <= 0.001) return
  const k = rift / CONFIG.run.maxRift
  const r = (46 + rift * 0.75) * contract
  const a = (0.12 + k * 0.38) * Math.min(1, contract * 1.4)
  const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r)
  g.addColorStop(0, rgba(pal.accent, a * 0.6))
  g.addColorStop(0.6, rgba(pal.accent, a * 0.3))
  g.addColorStop(1, rgba(pal.accent, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = rgba(pal.accent2, a * 0.7)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(x, y, r * 0.88, 0, Math.PI * 2)
  ctx.stroke()
}

export interface SamuraiPose {
  tension: number
  slash: number
  time: number
}

export function drawSamurai(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: SamuraiPose,
  pal: Palette,
) {
  const ink = rgba(inkColor(pal), 1)
  const rim = rgba(pal.accent, 0.5)
  const te = easeInOut(Math.max(0, Math.min(1, pose.tension)))
  const sl = Math.max(0, Math.min(1, pose.slash))
  const c = te * 7
  const t = pose.time / 1000

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const neckX = -3
  const neckY = -64 + c
  let px = neckX
  let py = neckY
  const n = 12
  for (let i = 1; i <= n; i++) {
    const f = i / n
    const nx = neckX - i * 4.2
    const ny = neckY + i * 1.1 + Math.sin(t * 5 - i * 0.6) * (1.5 + i * 0.55)
    ctx.strokeStyle = rgba(pal.accent, 0.95 - f * 0.5)
    ctx.lineWidth = 4.2 * (1 - f) + 0.8
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    px = nx
    py = ny
  }

  ctx.fillStyle = ink
  ctx.strokeStyle = rim
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(-11, -42 + c)
  ctx.lineTo(11, -42 + c)
  ctx.lineTo(23 + c * 0.6, 0)
  ctx.lineTo(5, 0)
  ctx.lineTo(0, -15 + c * 0.5)
  ctx.lineTo(-5, 0)
  ctx.lineTo(-23 - c * 0.6, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(-12, -65 + c)
  ctx.lineTo(12, -65 + c)
  ctx.lineTo(17, -55 + c)
  ctx.lineTo(11, -41 + c)
  ctx.lineTo(-11, -41 + c)
  ctx.lineTo(-17, -55 + c)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = rgba(pal.accent, 0.85)
  ctx.fillRect(-11.5, -45 + c, 23, 4)

  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.arc(0, -72 + c, 6.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(1.5, -80 + c, 3.4, 2, -0.3, 0, Math.PI * 2)
  ctx.fill()

  let hx = lerp(10, -8, te)
  let hy = lerp(-46, -50, te)
  let ang = lerp(0.9, -2.5, te)
  if (sl > 0) {
    hx = lerp(hx, 20, sl)
    hy = lerp(hy, -60, sl)
    ang = lerp(ang, -0.2, sl)
  }
  hy += c

  if (sl > 0.05) {
    ctx.strokeStyle = rgba(pal.accent2, sl * 0.55)
    ctx.lineWidth = 10 * sl
    ctx.beginPath()
    ctx.arc(4, -58 + c, 52, -2.6, -0.15)
    ctx.stroke()
  }

  ctx.strokeStyle = ink
  ctx.lineWidth = 5.5
  for (const sx of [8, -8]) {
    ctx.beginPath()
    ctx.moveTo(sx, -62 + c)
    ctx.lineTo(hx, hy)
    ctx.stroke()
  }

  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(hx - dx * 9, hy - dy * 9)
  ctx.lineTo(hx, hy)
  ctx.stroke()

  const blade = mixRgb(pal.accent2, [255, 255, 255], 0.5)
  ctx.strokeStyle = rgba(pal.accent2, 0.25)
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(hx + dx * 2, hy + dy * 2)
  ctx.lineTo(hx + dx * 48, hy + dy * 48)
  ctx.stroke()
  ctx.strokeStyle = rgba(blade, 0.95)
  ctx.lineWidth = 1.8
  ctx.stroke()

  ctx.fillStyle = rgba(pal.accent, 0.9)
  ctx.beginPath()
  ctx.arc(hx, hy, 2.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

/* ---------- Rain ---------- */

export class Rain {
  private drops: { x: number; y: number; len: number; spd: number }[] = []

  constructor() {
    for (let i = 0; i < CONFIG.rain.count; i++) {
      this.drops.push({
        x: Math.random() * CONFIG.world.width,
        y: Math.random() * CONFIG.world.height,
        len: 8 + Math.random() * 14,
        spd: 0.7 + Math.random() * 0.6,
      })
    }
  }

  update(dt: number, W: number, H: number) {
    const v = CONFIG.rain.speed
    for (const d of this.drops) {
      d.y += d.spd * v * dt
      d.x += CONFIG.rain.wind * d.spd * v * dt * 0.3
      if (d.y > H) {
        d.y = -d.len - Math.random() * 40
        d.x = Math.random() * (W + 40) - 40
      }
      if (d.x > W + 10) d.x -= W + 20
    }
  }

  draw(ctx: CanvasRenderingContext2D, pal: Palette) {
    ctx.strokeStyle = rgba(pal.accent2, 0.18)
    ctx.lineWidth = 1
    ctx.beginPath()
    const wx = CONFIG.rain.wind * 0.3
    for (const d of this.drops) {
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x + d.len * wx, d.y + d.len)
    }
    ctx.stroke()
  }
}
