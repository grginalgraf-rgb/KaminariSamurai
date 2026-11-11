import { CONFIG, type Band, type HitTier, type Tier } from './config'

export interface Point {
  x: number
  y: number
}

export type BoltKind = 'normal' | 'cursed'

export interface BoltCut {
  x: number
  y: number
  tier: HitTier | 'cursed'
  angle: number
  time: number
  upper: Point[]
  lower: Point[]
}

export interface Bolt {
  id: number
  kind: BoltKind
  speed: BoltSpeed
  /** Number of path points spent crawling sideways before the plunge (0 = regular bolt). */
  crawl: number
  t0: number
  T: number
  lead: number
  base: Point[]
  targetX: number
  aimX: number
  endY: number
  branches: { index: number; pts: Point[] }[]
  cut: BoltCut | null
  landed: boolean
  landedAt: number
  resolved: boolean
  outcome: Tier | 'evaded' | null
  stopCue: (() => void) | null
}

let nextId = 1

export function bandFor(year: number): Band {
  let band = CONFIG.bands[0]
  for (const b of CONFIG.bands) if (year >= b.minYear) band = b
  return band
}

export type BoltSpeed = keyof typeof CONFIG.bolt.speeds
const SPEED_ORDER: BoltSpeed[] = ['slow', 'normal', 'fast', 'stutter']

function pickSpeed(band: Band, kind: BoltKind, rand: () => number): BoltSpeed {
  const idx = Math.max(0, CONFIG.bands.indexOf(band))
  const mix = CONFIG.bolt.speedMix[Math.min(idx, CONFIG.bolt.speedMix.length - 1)]
  // Cursed bolts never stutter, so they stay readable as "let it fall".
  const weights = kind === 'cursed' ? [mix[0], mix[1] + mix[3], mix[2], 0] : mix
  const total = weights.reduce((a, w) => a + w, 0)
  let r = rand() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return SPEED_ORDER[i]
  }
  return 'normal'
}

function buildPath(sx: number, tx: number, ty: number, rand: () => number, segments: number = CONFIG.bolt.segments, sy = -20) {
  const { zigAmp, zigTaper, zigFlipChance, kinkChance } = CONFIG.bolt
  const stepY = (ty - sy) / segments
  const pts: Point[] = [{ x: sx, y: sy }]
  let dir = rand() < 0.5 ? -1 : 1
  for (let i = 1; i < segments; i++) {
    const f = i / segments
    if (rand() < zigFlipChance) dir = -dir
    const kink = rand() < kinkChance ? 1.9 : 1
    const endFade = Math.min(1, (segments - i) / 2.5)
    const amp = zigAmp * (0.55 + rand() * 0.75) * (1 - f * zigTaper) * kink * endFade
    pts.push({
      x: sx + (tx - sx) * f + dir * amp,
      y: sy + stepY * i + (rand() - 0.5) * stepY * 0.5,
    })
  }
  pts.push({ x: tx, y: ty })

  const branches: { index: number; pts: Point[] }[] = []
  const count = 1 + Math.floor(rand() * 3)
  for (let b = 0; b < count; b++) {
    const index = 3 + Math.floor(rand() * (segments - 8))
    const side = rand() < 0.5 ? -1 : 1
    const br: Point[] = [{ x: 0, y: 0 }]
    let bx = 0
    let by = 0
    const len = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < len; i++) {
      bx += i % 2 === 0 ? side * (12 + rand() * 14) : -side * (3 + rand() * 7)
      by += 9 + rand() * 12
      br.push({ x: bx, y: by })
    }
    branches.push({ index, pts: br })
  }
  return { pts, branches }
}

function buildFeintPath(width: number, tx: number, ty: number, rand: () => number) {
  const { crawlSegments, plungeSegments, startRange, dropRange, swingAmp, swings, crawlDepth, crawlJag, crawlForks } =
    CONFIG.bolt.feint
  const pick = (r: readonly number[]) => r[0] + rand() * (r[1] - r[0])
  const m = CONFIG.bolt.startMargin
  const lo = width * (m + 0.04)
  const hi = width * (1 - m - 0.04)
  const sx = width * pick(startRange)
  const dx = width * pick(dropRange)
  const dropY = ty * pick(crawlDepth)
  const lobes = swings[0] + Math.floor(rand() * (swings[1] - swings[0] + 1))

  // Spine of a meandering S/Z that winds down from the cloud: each lobe swings
  // to alternate sides of the line between start and drop point, with uneven
  // spacing and size. First and last points are phantom tangent handles.
  const spine: Point[] = [
    { x: sx, y: -70 },
    { x: sx, y: -20 },
  ]
  let side = rand() < 0.5 ? -1 : 1
  // Lobes never swing wider than their vertical spacing, so the bolt always reads as falling.
  const spacing = (dropY + 20) / (lobes + 1)
  for (let k = 1; k <= lobes; k++) {
    const f = (k - 0.15 + rand() * 0.3) / (lobes + 1)
    const amp = Math.min(width * pick(swingAmp), spacing * (0.45 + rand() * 0.15))
    spine.push({
      x: Math.max(lo, Math.min(hi, sx + (dx - sx) * f + side * amp)),
      y: -20 + (dropY + 20) * f,
    })
    side = -side
  }
  spine.push({ x: dx, y: dropY }, { x: dx, y: dropY + 70 })
  const pts = resample(catmullRom(spine, 14), crawlSegments, rand)
  crackle(pts, crawlJag, rand)

  const crawl = pts.length - 1
  const plunge = buildPath(dx, tx, ty, rand, plungeSegments, dropY)
  for (let i = 1; i < plunge.pts.length; i++) pts.push(plunge.pts[i])
  const branches = plunge.branches.map((br) => ({ index: br.index + crawl, pts: br.pts }))

  // Short tendrils hanging off the crawl, like forks of real sheet lightning.
  const forkCount = crawlForks[0] + Math.floor(rand() * (crawlForks[1] - crawlForks[0] + 1))
  for (let k = 0; k < forkCount; k++) {
    const index = 4 + Math.floor(rand() * Math.max(1, crawl - 6))
    const travel = Math.sign(pts[index + 1].x - pts[index].x) || 1
    const br: Point[] = [{ x: 0, y: 0 }]
    let bx = 0
    let by = 0
    const len = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < len; i++) {
      bx += travel * (4 + rand() * 12) * (i % 2 === 0 ? 1 : -0.4)
      by += 8 + rand() * 12
      br.push({ x: bx, y: by })
    }
    branches.push({ index, pts: br })
  }
  return { pts, branches, crawl }
}

/** Centripetal Catmull-Rom through `ctrl` (first/last are tangent handles only); no overshoot loops. */
function catmullRom(ctrl: Point[], samplesPerSpan: number): Point[] {
  const out: Point[] = []
  const knot = (a: Point, b: Point) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)))
  for (let i = 1; i < ctrl.length - 2; i++) {
    const [p0, p1, p2, p3] = [ctrl[i - 1], ctrl[i], ctrl[i + 1], ctrl[i + 2]]
    const t1 = knot(p0, p1)
    const t2 = t1 + knot(p1, p2)
    const t3 = t2 + knot(p2, p3)
    for (let s = i === 1 ? 0 : 1; s <= samplesPerSpan; s++) {
      const t = t1 + ((t2 - t1) * s) / samplesPerSpan
      const mix = (a: Point, b: Point, ta: number, tb: number): Point => ({
        x: ((tb - t) * a.x + (t - ta) * b.x) / (tb - ta),
        y: ((tb - t) * a.y + (t - ta) * b.y) / (tb - ta),
      })
      const a1 = mix(p0, p1, 0, t1)
      const a2 = mix(p1, p2, t1, t2)
      const a3 = mix(p2, p3, t2, t3)
      out.push(mix(mix(a1, a2, 0, t2), mix(a2, a3, t1, t3), t1, t2))
    }
  }
  return out
}

/** Picks `count` steps along the polyline by arc length, slightly uneven so it isn't mechanical. */
function resample(line: Point[], count: number, rand: () => number): Point[] {
  const cum = [0]
  for (let i = 1; i < line.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y))
  }
  const total = cum[cum.length - 1]
  const weights = Array.from({ length: count }, () => 0.75 + rand() * 0.5)
  const sum = weights.reduce((a, b) => a + b, 0)
  const out: Point[] = [{ ...line[0] }]
  let acc = 0
  let j = 1
  for (let k = 0; k < count - 1; k++) {
    acc += weights[k]
    const target = (acc / sum) * total
    while (j < cum.length - 1 && cum[j] < target) j++
    const f = (target - cum[j - 1]) / (cum[j] - cum[j - 1] || 1)
    out.push({
      x: line[j - 1].x + (line[j].x - line[j - 1].x) * f,
      y: line[j - 1].y + (line[j].y - line[j - 1].y) * f,
    })
  }
  out.push({ ...line[line.length - 1] })
  return out
}

/** Small perpendicular crackle on top of the smooth spine, tapered at both ends. */
function crackle(pts: Point[], amp: number, rand: () => number) {
  let walk = 0
  const n = pts.length
  const base = pts.map((p) => ({ ...p }))
  for (let i = 1; i < n - 1; i++) {
    const tx = base[i + 1].x - base[i - 1].x
    const ty = base[i + 1].y - base[i - 1].y
    const len = Math.hypot(tx, ty) || 1
    walk = walk * 0.5 + (rand() - 0.5) * amp * 1.4
    const tick = (i % 2 === 0 ? 1 : -1) * amp * 0.35 * rand()
    const taper = Math.min(1, i / 3, (n - 1 - i) / 3)
    const off = Math.max(-amp, Math.min(amp, walk + tick)) * taper
    pts[i].x += (-ty / len) * off
    pts[i].y += (tx / len) * off
  }
}

export function createBolt(
  kind: BoltKind,
  t0: number,
  band: Band,
  samuraiX: number,
  headY: number,
  roofY: number,
  width: number,
  rand: () => number = Math.random,
  forceFeint = false,
): Bolt {
  const m = CONFIG.bolt.startMargin
  const sx = width * (m + rand() * (1 - m * 2))
  let tx = samuraiX
  let ty = headY
  if (kind === 'cursed') {
    const lo = width * CONFIG.leap.minX
    const hi = width * CONFIG.leap.maxX
    const minD = CONFIG.cut.cursedMinDistance
    tx = lo + rand() * (hi - lo)
    for (let i = 0; i < 20 && Math.abs(tx - samuraiX) < minD; i++) tx = lo + rand() * (hi - lo)
    if (Math.abs(tx - samuraiX) < minD) tx = samuraiX < width / 2 ? Math.min(hi, samuraiX + minD) : Math.max(lo, samuraiX - minD)
    ty = roofY - 4
  }
  const fc = CONFIG.bolt.feint
  const bandIdx = Math.max(0, CONFIG.bands.indexOf(band))
  const feint = kind === 'normal' && (forceFeint || rand() < fc.chance[Math.min(bandIdx, fc.chance.length - 1)])
  const speed = feint ? 'normal' : pickSpeed(band, kind, rand)
  const leadMul = feint ? fc.leadMul : CONFIG.bolt.speeds[speed].leadMul
  const lead = (kind === 'cursed' ? band.lead * 1.1 : band.lead) * leadMul
  const { pts, branches, crawl } = feint ? buildFeintPath(width, tx, ty, rand) : { ...buildPath(sx, tx, ty, rand), crawl: 0 }
  return {
    id: nextId++,
    kind,
    speed,
    crawl,
    t0,
    T: t0 + lead,
    lead,
    base: pts,
    targetX: tx,
    aimX: tx,
    endY: ty,
    branches,
    cut: null,
    landed: false,
    landedAt: 0,
    resolved: false,
    outcome: null,
    stopCue: null,
  }
}

export function growth(b: Bolt, now: number): number {
  const p = Math.max(0, Math.min(1, (now - b.t0) / b.lead))
  if (b.crawl > 0) return feintGrowth(b, p)
  const sp = CONFIG.bolt.speeds[b.speed]
  return Math.pow(sp.steps > 0 ? stepped(p, sp.steps) : p, sp.curve)
}

/** Steady sideways crawl, a brief hesitation at the drop point, then an accelerating plunge. */
function feintGrowth(b: Bolt, p: number): number {
  const { crawlTime, holdTime, plungeCurve } = CONFIG.bolt.feint
  const split = b.crawl / (b.base.length - 1)
  if (p < crawlTime) return (p / crawlTime) * split
  if (p < crawlTime + holdTime) return split
  const k = (p - crawlTime - holdTime) / (1 - crawlTime - holdTime)
  return split + Math.pow(k, plungeCurve) * (1 - split)
}

/** True while a feint bolt hovers at its drop point, about to plunge. */
export function isPoised(b: Bolt, now: number): boolean {
  if (!b.crawl) return false
  const { crawlTime, holdTime } = CONFIG.bolt.feint
  const p = (now - b.t0) / b.lead
  return p >= crawlTime && p < crawlTime + holdTime
}

/** Holds still for part of each step, then lurches forward. */
function stepped(p: number, steps: number): number {
  if (p >= 1) return 1
  const s = p * steps
  const i = Math.floor(s)
  const fr = s - i
  const hold = 0.5
  const k = fr < hold ? 0 : (fr - hold) / (1 - hold)
  return (i + k * k * (3 - 2 * k)) / steps
}

/** True while a stuttering bolt is paused between lurches. */
export function isHolding(b: Bolt, now: number): boolean {
  const steps = CONFIG.bolt.speeds[b.speed].steps
  if (!steps) return false
  const p = (now - b.t0) / b.lead
  if (p <= 0 || p >= 1) return false
  return (p * steps) % 1 < 0.5
}

/** Current path; normal bolts bend their lower section toward the samurai. */
export function livePoints(b: Bolt): Point[] {
  const shift = b.aimX - b.targetX
  if (Math.abs(shift) < 0.01) return b.base
  const n = b.base.length - 1
  const from = b.crawl
  return b.base.map((p, i) => ({ x: p.x + shift * Math.pow(Math.max(0, (i - from) / (n - from)), 1.6), y: p.y }))
}

/** Points up to the growing tip (fraction f of the segment count). */
export function visiblePoints(pts: Point[], f: number): Point[] {
  const count = pts.length - 1
  const lim = f * count
  const out: Point[] = [pts[0]]
  for (let i = 1; i <= count; i++) {
    if (i <= lim) out.push(pts[i])
    else {
      const k = lim - (i - 1)
      if (k > 0) out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k })
      break
    }
  }
  return out
}
