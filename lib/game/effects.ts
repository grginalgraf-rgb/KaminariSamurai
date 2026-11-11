import { CONFIG } from './config'
import { rgba, type RGB } from './eras'

export interface FxFonts {
  serif: string
  sans: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  rot: number
  vr: number
  size: number
  petal: RGB
  spark: RGB
}

interface Ripple {
  x: number
  y: number
  age: number
  life: number
  maxR: number
  color: RGB
  width: number
}

export interface PopOptions {
  x: number
  y: number
  text: string
  sub?: string
  size: number
  color: RGB
  life: number
  rise: number
  family: 'serif' | 'sans'
  spring?: boolean
}

interface Pop extends PopOptions {
  age: number
}

interface NearMiss {
  x: number
  y: number
  text: string
  dtNorm: number
  age: number
  life: number
}

interface GhostSlash {
  x: number
  y: number
  angle: number
  age: number
  life: number
}

interface Streak {
  a: number
  speed: number
  len: number
  width: number
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t: number) => {
  const c1 = 1.9
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export class Effects {
  reduced = false
  private particles: Particle[] = []
  private ripples: Ripple[] = []
  private pops: Pop[] = []
  private nearMisses: NearMiss[] = []
  private ghosts: GhostSlash[] = []
  private flashAlpha = 0
  private flashAge = 0
  private flashLife = 0
  private flashColor: RGB = [255, 255, 255]
  private flashTimes: number[] = []
  private shakePx = 0
  private shakeAge = 0
  private shakeLife = 0
  private warpAge = 0
  private warpLife = 0
  private warpColor: RGB = [255, 255, 255]
  private warpCx = 0
  private warpCy = 0
  private streaks: Streak[] = []
  private hitStopLeft = 0

  constructor(private fonts: FxFonts) {}

  clear() {
    this.particles = []
    this.ripples = []
    this.pops = []
    this.nearMisses = []
    this.ghosts = []
    this.flashLife = 0
    this.shakeLife = 0
    this.warpLife = 0
    this.hitStopLeft = 0
  }

  hitStop(ms: number) {
    this.hitStopLeft = Math.max(this.hitStopLeft, ms)
  }

  consumeHitStop(realDt: number): number {
    if (this.hitStopLeft <= 0) return realDt
    const used = Math.min(this.hitStopLeft, realDt)
    this.hitStopLeft -= used
    return realDt - used
  }

  flash(alpha: number, ms: number, color: RGB) {
    const now = performance.now()
    this.flashTimes = this.flashTimes.filter((t) => now - t < 1000)
    if (this.flashTimes.length >= CONFIG.effects.flashMaxPerSecond) return
    this.flashTimes.push(now)
    const cap = this.reduced ? CONFIG.effects.reducedFlashAlpha : CONFIG.effects.flashMaxAlpha
    this.flashAlpha = Math.min(alpha, cap)
    this.flashAge = 0
    this.flashLife = ms
    this.flashColor = color
  }

  shake(px: number, ms: number) {
    if (this.reduced || px <= 0) return
    this.shakePx = px
    this.shakeAge = 0
    this.shakeLife = ms
  }

  ripple(x: number, y: number, maxR: number, color: RGB, life: number, width: number) {
    this.ripples.push({ x, y, maxR, color, life, width, age: 0 })
  }

  warp(ms: number, color: RGB, cx: number, cy: number) {
    if (this.reduced || ms <= 0) return
    this.warpAge = 0
    this.warpLife = ms
    this.warpColor = color
    this.warpCx = cx
    this.warpCy = cy
    this.streaks = Array.from({ length: CONFIG.effects.warpStreaks }, () => ({
      a: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 0.9,
      len: 40 + Math.random() * 120,
      width: 0.6 + Math.random() * 1.8,
    }))
  }

  burst(x: number, y: number, count: number, petal: RGB, spark: RGB, power = 1) {
    const room = CONFIG.effects.maxParticles - this.particles.length
    const n = Math.min(Math.round(count), Math.max(0, room))
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = (80 + Math.random() * 260) * power
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        age: 0,
        life: 900 + Math.random() * 500,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 8,
        size: 3 + Math.random() * 3,
        petal,
        spark,
      })
    }
  }

  pop(opts: PopOptions) {
    this.pops.push({ ...opts, age: 0 })
  }

  nearMiss(x: number, y: number, text: string, dtNorm: number) {
    this.nearMisses.push({ x, y, text, dtNorm, age: 0, life: CONFIG.feedback.nearMissMs })
  }

  ghostSlash(x: number, y: number, angle: number) {
    this.ghosts.push({ x, y, angle, age: 0, life: CONFIG.feedback.ghostSlashMs })
  }

  update(dt: number) {
    const s = dt / 1000
    const drag = Math.exp(-s * 1.8)
    for (const p of this.particles) {
      p.age += dt
      p.vx *= drag
      p.vy = p.vy * drag + 70 * s
      p.x += p.vx * s
      p.y += p.vy * s
      p.rot += p.vr * s
    }
    this.particles = this.particles.filter((p) => p.age < p.life)
    for (const r of this.ripples) r.age += dt
    this.ripples = this.ripples.filter((r) => r.age < r.life)
    for (const p of this.pops) p.age += dt
    this.pops = this.pops.filter((p) => p.age < p.life)
    for (const n of this.nearMisses) n.age += dt
    this.nearMisses = this.nearMisses.filter((n) => n.age < n.life)
    for (const g of this.ghosts) g.age += dt
    this.ghosts = this.ghosts.filter((g) => g.age < g.life)
    if (this.flashLife > 0) this.flashAge += dt
    if (this.shakeLife > 0) this.shakeAge += dt
    if (this.warpLife > 0) this.warpAge += dt
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shakeLife <= 0 || this.shakeAge >= this.shakeLife) return { x: 0, y: 0 }
    const k = 1 - this.shakeAge / this.shakeLife
    const m = this.shakePx * k
    return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m }
  }

  renderWarp(ctx: CanvasRenderingContext2D, W: number) {
    if (this.warpLife <= 0 || this.warpAge >= this.warpLife) return
    const p = this.warpAge / this.warpLife
    const env = Math.sin(Math.PI * p)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    for (const s of this.streaks) {
      const r = 20 + easeOutCubic(p) * s.speed * W * 1.1
      const len = s.len * (0.4 + p)
      const cx = Math.cos(s.a)
      const cy = Math.sin(s.a)
      ctx.strokeStyle = rgba(this.warpColor, 0.55 * env)
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.moveTo(this.warpCx + cx * r, this.warpCy + cy * r)
      ctx.lineTo(this.warpCx + cx * (r + len), this.warpCy + cy * (r + len))
      ctx.stroke()
    }
    ctx.restore()
  }

  renderWorld(ctx: CanvasRenderingContext2D) {
    ctx.save()
    for (const r of this.ripples) {
      const p = r.age / r.life
      const rad = r.maxR * easeOutCubic(p)
      ctx.strokeStyle = rgba(r.color, (1 - p) * 0.9)
      ctx.lineWidth = r.width * (1 - p) + 0.5
      ctx.beginPath()
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2)
      ctx.stroke()
    }

    for (const g of this.ghosts) {
      const p = g.age / g.life
      const L = CONFIG.bolt.slashLineLength / 2
      const dx = Math.cos(g.angle) * L
      const dy = Math.sin(g.angle) * L
      ctx.setLineDash([2, 6])
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p)})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(g.x - dx, g.y - dy)
      ctx.lineTo(g.x + dx, g.y + dy)
      ctx.stroke()
      ctx.setLineDash([])
    }

    ctx.globalCompositeOperation = 'lighter'
    for (const pt of this.particles) {
      const p = pt.age / pt.life
      const a = 1 - p
      if (p < 0.45) {
        ctx.save()
        ctx.translate(pt.x, pt.y)
        ctx.rotate(pt.rot)
        ctx.fillStyle = rgba(pt.petal, a * 0.9)
        ctx.beginPath()
        ctx.ellipse(0, 0, pt.size, pt.size * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      } else {
        const flick = 0.6 + 0.4 * Math.sin(pt.age * 0.05)
        const s = Math.max(1.5, pt.size * 0.6)
        ctx.fillStyle = rgba(pt.spark, a * flick)
        ctx.fillRect(pt.x - s / 2, pt.y - s / 2, s, s)
      }
    }
    ctx.globalCompositeOperation = 'source-over'

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const n of this.nearMisses) {
      const p = n.age / n.life
      const a = p < 0.15 ? p / 0.15 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1
      ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`
      ctx.font = `500 13px ${this.fonts.sans}`
      ctx.fillText(n.text, n.x, n.y)
      const bw = 120
      const by = n.y + 16
      ctx.fillStyle = `rgba(255,255,255,${0.25 * a})`
      ctx.fillRect(n.x - bw / 2, by - 1, bw, 2)
      ctx.fillStyle = `rgba(245,207,114,${0.9 * a})`
      ctx.fillRect(n.x - 1, by - 5, 2, 10)
      const mx = n.x + Math.max(-1, Math.min(1, n.dtNorm)) * (bw / 2)
      ctx.fillStyle = `rgba(255,255,255,${a})`
      ctx.beginPath()
      ctx.arc(mx, by, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    for (const pop of this.pops) {
      const p = pop.age / pop.life
      const scale = pop.spring ? easeOutBack(Math.min(1, pop.age / 260)) : Math.min(1, 0.85 + pop.age / 600)
      const a = p > 0.65 ? 1 - (p - 0.65) / 0.35 : Math.min(1, pop.age / 80)
      const y = pop.y - pop.rise * easeOutCubic(p)
      ctx.save()
      ctx.translate(pop.x, y)
      ctx.scale(scale, scale)
      const family = pop.family === 'serif' ? this.fonts.serif : this.fonts.sans
      ctx.font = `700 ${pop.size}px ${family}`
      ctx.shadowColor = rgba(pop.color, 0.8 * a)
      ctx.shadowBlur = 16
      ctx.fillStyle = rgba(pop.color, a)
      ctx.fillText(pop.text, 0, 0)
      if (pop.sub) {
        ctx.shadowBlur = 0
        ctx.font = `600 ${Math.round(pop.size * 0.42)}px ${this.fonts.serif}`
        ctx.fillStyle = rgba(pop.color, a * 0.75)
        ctx.fillText(pop.sub, 0, pop.size * 0.72)
      }
      ctx.restore()
    }
    ctx.restore()
  }

  renderFlash(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (this.flashLife <= 0 || this.flashAge >= this.flashLife) return
    const a = this.flashAlpha * (1 - this.flashAge / this.flashLife)
    ctx.fillStyle = rgba(this.flashColor, a)
    ctx.fillRect(-20, -20, W + 40, H + 40)
  }
}
