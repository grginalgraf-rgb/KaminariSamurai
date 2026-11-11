import { GameAudio } from './audio'
import { CONFIG, type HitTier, type SkylineKind, type Tier } from './config'
import { Effects, type FxFonts } from './effects'
import { ERAS, eraIndexFor, hexToRgb, lerpPalette, mixRgb, paletteFor, rgba, type Palette, type RGB } from './eras'
import { formatYear } from './format'
import { PointerInput } from './input'
import { pointSegmentDistance, segmentIntersect } from './judge'
import { drawAurora, drawHalo, drawRooftop, drawSamurai, drawSky, drawSkyline, Rain, rooftopY } from './render-world'
import { comboAfter, jumpYears, riftAfter } from './scoring'
import { bandFor, createBolt, growth, isHolding, isPoised, livePoints, visiblePoints, type Bolt, type BoltKind, type Point } from './strikes'
import { readNumber, writeNumber } from './storage'

export type Mode = 'title' | 'playing' | 'ending' | 'arrival'

export interface RunSummary {
  year: number
  eraName: string
  eraJp: string
  best: number
  previousBest: number
  newBest: boolean
  perfects: number
  bestCombo: number
  jumps: number
}

export interface EngineEventMap {
  yearChanged: { from: number; to: number; duration: number; delay: number; jump: number }
  riftChanged: { rift: number }
  comboChanged: { combo: number; pulse: boolean }
  eraChanged: { name: string; jp: string; year: number; index: number; announce: boolean }
  runStarted: { year: number; best: number }
  runEnded: RunSummary
  paused: boolean
}

type Listener<T> = (payload: T) => void

interface StrokeState {
  cuts: number
  angle: number
  start: number
  dist: number
  blocked: boolean
}

interface Leap {
  fromX: number
  toX: number
  lift: number
  start: number
}

const WHITE: RGB = [255, 255, 255]
const GOLD = hexToRgb(CONFIG.colors.gold)
const SAKURA = hexToRgb(CONFIG.colors.sakura)
const CURSED = hexToRgb(CONFIG.bolt.cursedColor)
const CURSED2 = hexToRgb(CONFIG.bolt.cursedColor2)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export class Engine {
  W = CONFIG.world.width
  H = CONFIG.world.height
  mode: Mode = 'title'
  paused = false
  reduceFlashes = false
  best = 0

  private ctx: CanvasRenderingContext2D
  private bgCtx: CanvasRenderingContext2D | null
  private dpr = 1
  private scale = 1
  private raf = 0
  private lastFrame = 0
  private frameCount = 0
  private ro: ResizeObserver | null = null
  private listeners = new Map<keyof EngineEventMap, Set<Listener<unknown>>>()

  private pausedAt = 0
  private pausedTotal = 0

  private year = CONFIG.run.startYear
  private rift = CONFIG.run.startRift
  private riftEmitted = CONFIG.run.startRift
  private combo = 0
  private bestCombo = 0
  private perfects = 0
  private jumps = 0

  private bolts: Bolt[] = []
  private nextSpawnAt: number | null = null
  private spawnedAny = false
  private boltsSinceFeint = 0
  private cutHintShown = false
  private cursedHintShown = false
  private lastRevealAt = -Infinity
  private endingStart = 0
  private arrivalStart = -Infinity

  private samX = CONFIG.world.width / 2
  private facing = 1
  private leap: Leap | null = null

  private eraIndex = 0
  private palFrom: Palette = paletteFor(0)
  private palTo: Palette = paletteFor(0)
  private palStart = 0
  private palDur = 1
  private skyFrom: SkylineKind = ERAS[0].skyline
  private skyTo: SkylineKind = ERAS[0].skyline

  private visual = 0
  private worldSpeed = 1
  private parallax = 0
  private ambientNext = 0
  private ambientStart = -Infinity

  private effects: Effects
  private audio = new GameAudio()
  private input: PointerInput
  private rain = new Rain()
  private strokeStates = new Map<number, StrokeState>()
  private slashPoseAt = -Infinity
  private struckAt = -Infinity
  private bladeReadyAt = -Infinity
  private whiffAt = -Infinity

  constructor(
    private canvas: HTMLCanvasElement,
    private bg: HTMLCanvasElement | null,
    private fonts: FxFonts,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D not supported')
    this.ctx = ctx
    this.bgCtx = bg ? bg.getContext('2d') : null
    this.effects = new Effects(fonts)
    this.best = readNumber(CONFIG.storage.best, 0)

    this.input = new PointerInput(canvas, {
      toLogical: (cx, cy) => {
        const r = canvas.getBoundingClientRect()
        const s = r.width / this.W
        return { x: (cx - r.left) / s, y: (cy - r.top) / s }
      },
      toGameTime: (perf) => perf - this.pausedTotal,
      isActive: () => this.mode === 'playing' && !this.paused,
      onDown: (id) => this.beginStroke(id),
      onMove: (id, x0, y0, t0, x1, y1, t1) => this.onMove(id, x0, y0, x1, y1, t1),
      onEnd: (id) => this.endStroke(id),
    })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    if (bg) this.ro.observe(bg)
    this.resize()

    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('blur', this.onBlur)

    this.ambientNext = this.now() + 1500
    this.lastFrame = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    this.input.destroy()
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('blur', this.onBlur)
    this.audio.cancelScheduled()
    this.audio.suspend()
    this.listeners.clear()
  }

  /* ---------- events ---------- */

  on<K extends keyof EngineEventMap>(type: K, fn: Listener<EngineEventMap[K]>): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(fn as Listener<unknown>)
    return () => set.delete(fn as Listener<unknown>)
  }

  private emit<K extends keyof EngineEventMap>(type: K, payload: EngineEventMap[K]) {
    this.listeners.get(type)?.forEach((fn) => fn(payload))
  }

  /* ---------- public controls ---------- */

  unlockAudio() {
    this.audio.unlock()
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m)
  }

  setReduceFlashes(v: boolean) {
    this.reduceFlashes = v
    this.effects.reduced = v
  }

  startRun() {
    const now = this.now()
    this.clearBolts()
    this.input.reset()
    this.strokeStates.clear()
    this.effects.clear()
    this.year = CONFIG.run.startYear
    this.rift = CONFIG.run.startRift
    this.riftEmitted = this.rift
    this.combo = 0
    this.bestCombo = 0
    this.perfects = 0
    this.jumps = 0
    this.spawnedAny = false
    this.boltsSinceFeint = 0
    this.cutHintShown = false
    this.cursedHintShown = false
    this.lastRevealAt = -Infinity
    this.arrivalStart = -Infinity
    this.struckAt = -Infinity
    this.bladeReadyAt = -Infinity
    this.whiffAt = -Infinity
    this.samX = this.W / 2
    this.leap = null
    this.facing = 1
    this.nextSpawnAt = now + CONFIG.run.firstStrikeDelay
    const idx = eraIndexFor(this.year)
    if (idx !== this.eraIndex) this.transitionPalette(idx, CONFIG.palette.resetMs, now)
    this.eraIndex = idx
    this.mode = 'playing'
    this.emit('runStarted', { year: this.year, best: this.best })
    this.emit('yearChanged', { from: this.year, to: this.year, duration: 0, delay: 0, jump: 0 })
    this.emit('riftChanged', { rift: this.rift })
    this.emit('comboChanged', { combo: 0, pulse: false })
    const era = ERAS[idx]
    this.emit('eraChanged', { name: era.name, jp: era.jp, year: this.year, index: idx, announce: false })
  }

  toTitle() {
    const now = this.now()
    this.clearBolts()
    this.input.reset()
    this.nextSpawnAt = null
    this.samX = this.W / 2
    this.leap = null
    this.mode = 'title'
    if (this.eraIndex !== 0) this.transitionPalette(0, CONFIG.palette.resetMs, now)
    this.eraIndex = 0
  }

  pause() {
    if (this.paused || (this.mode !== 'playing' && this.mode !== 'ending')) return
    this.paused = true
    this.pausedAt = performance.now()
    this.input.reset()
    this.strokeStates.clear()
    this.audio.suspend()
    this.emit('paused', true)
  }

  resume() {
    if (!this.paused) return
    this.pausedTotal += performance.now() - this.pausedAt
    this.paused = false
    this.lastFrame = performance.now()
    this.audio.resume()
    this.emit('paused', false)
  }

  private onVisibility = () => {
    if (document.hidden) this.pause()
  }

  private onBlur = () => this.pause()

  private now(): number {
    return (this.paused ? this.pausedAt : performance.now()) - this.pausedTotal
  }

  private clearBolts() {
    for (const b of this.bolts) b.stopCue?.()
    this.bolts = []
    this.audio.cancelScheduled()
  }

  /* ---------- sizing ---------- */

  private resize() {
    const cssW = this.canvas.clientWidth || this.W
    const cssH = this.canvas.clientHeight || this.H
    this.dpr = Math.min(CONFIG.world.dprCap, window.devicePixelRatio || 1)
    this.scale = cssW / CONFIG.world.width
    this.W = CONFIG.world.width
    this.H = cssH / this.scale
    this.canvas.width = Math.round(cssW * this.dpr)
    this.canvas.height = Math.round(cssH * this.dpr)
    if (this.bg) {
      const bw = CONFIG.world.bgCanvasWidth
      const ratio = (this.bg.clientHeight || 1) / (this.bg.clientWidth || 1)
      this.bg.width = bw
      this.bg.height = Math.max(1, Math.round(bw * ratio))
    }
  }

  /* ---------- geometry ---------- */

  private roofY() {
    return rooftopY(this.H * CONFIG.world.groundY)
  }

  private headY() {
    return this.roofY() - CONFIG.cut.headOffset
  }

  private samuraiPos(now: number): { x: number; lift: number; k: number } {
    const lp = this.leap
    if (!lp) return { x: this.samX, lift: 0, k: 1 }
    const k = clamp01((now - lp.start) / CONFIG.leap.ms)
    return { x: lp.fromX + (lp.toX - lp.fromX) * easeInOut(k), lift: Math.sin(Math.PI * k) * lp.lift, k }
  }

  /* ---------- palette ---------- */

  private paletteProgress(now: number) {
    return easeInOut(clamp01((now - this.palStart) / this.palDur))
  }

  private palette(now: number): Palette {
    return lerpPalette(this.palFrom, this.palTo, this.paletteProgress(now))
  }

  private transitionPalette(index: number, ms: number, now: number) {
    const k = this.paletteProgress(now)
    this.palFrom = this.palette(now)
    this.skyFrom = k >= 0.5 ? this.skyTo : this.skyFrom
    this.palTo = paletteFor(index)
    this.skyTo = ERAS[index].skyline
    this.palStart = now
    this.palDur = Math.max(1, ms)
  }

  private boltPalette(kind: BoltKind, pal: Palette): Palette {
    return kind === 'cursed' ? { ...pal, accent: CURSED, accent2: CURSED2 } : pal
  }

  /* ---------- input → cutting ---------- */

  private beginStroke(id: number) {
    const now = this.now()
    this.strokeStates.set(id, {
      cuts: 0,
      angle: CONFIG.feedback.defaultSlashAngle,
      start: now,
      dist: 0,
      blocked: now < this.bladeReadyAt,
    })
  }

  private endStroke(id: number) {
    const st = this.strokeStates.get(id)
    this.strokeStates.delete(id)
    if (!st || st.blocked || st.cuts > 0 || this.mode !== 'playing') return
    if (st.dist >= CONFIG.cut.whiffMinDistance) this.whiff()
  }

  private whiff() {
    const now = this.now()
    this.bladeReadyAt = now + CONFIG.cut.whiffCooldownMs
    this.whiffAt = now
    this.combo = 0
    this.rift = Math.max(0, this.rift - CONFIG.cut.whiffRift)
    this.riftEmitted = this.rift
    this.emit('riftChanged', { rift: this.rift })
    this.emit('comboChanged', { combo: 0, pulse: false })
    const pos = this.samuraiPos(now)
    this.effects.pop({
      x: Math.max(70, Math.min(this.W - 70, pos.x)),
      y: this.headY() - pos.lift - 70,
      text: 'WHIFF',
      sub: '空振り',
      size: 16,
      color: hexToRgb(CONFIG.colors.softWhite),
      life: CONFIG.feedback.labelMs,
      rise: 14,
      family: 'serif',
      spring: false,
    })
    this.audio.softTone()
    if (this.rift <= 0) this.beginEnding(now)
  }

  private onMove(id: number, x0: number, y0: number, x1: number, y1: number, t: number) {
    const st = this.strokeStates.get(id)
    if (!st || st.blocked) return
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (len < 1.5) return
    if (t - st.start > CONFIG.cut.strokeLiveMs) return
    st.dist += len
    st.angle = Math.atan2(y1 - y0, x1 - x0)

    for (const b of this.bolts) {
      if (b.resolved || t < b.t0) continue
      const pts = visiblePoints(livePoints(b), growth(b, t))
      if (pts.length < 2) continue

      let hit: { s: number; x: number; y: number; seg: number } | null = null
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const c = pts[i]
        const r = segmentIntersect(x0, y0, x1, y1, a.x, a.y, c.x, c.y)
        if (r && (!hit || r.s < hit.s)) hit = { s: r.s, x: a.x + (c.x - a.x) * r.u, y: a.y + (c.y - a.y) * r.u, seg: i - 1 }
      }
      if (!hit) {
        const tip = pts[pts.length - 1]
        if (pointSegmentDistance(tip.x, tip.y, x0, y0, x1, y1) <= CONFIG.cut.tipRadius) {
          hit = { s: 1, x: tip.x, y: tip.y, seg: pts.length - 2 }
        }
      }
      if (!hit || hit.y < 0) continue
      this.cutBolt(b, hit.x, hit.y, hit.seg, pts, st)
      if (this.mode !== 'playing') return
    }
  }

  private cutBolt(b: Bolt, x: number, y: number, seg: number, pts: Point[], st: StrokeState) {
    const now = this.now()
    const cutPt = { x, y }
    const pos = this.samuraiPos(now)
    let tier: HitTier | 'cursed' = 'cursed'
    if (b.kind === 'normal') {
      const d = Math.hypot(x - pos.x, y - (this.headY() - pos.lift))
      tier = d <= CONFIG.cut.perfectRadius ? 'perfect' : d <= CONFIG.cut.goodRadius ? 'good' : 'close'
    }
    b.cut = {
      x,
      y,
      tier,
      angle: st.angle,
      time: now,
      upper: [...pts.slice(0, seg + 1), cutPt],
      lower: [cutPt, ...pts.slice(seg + 1)],
    }
    b.stopCue?.()
    b.stopCue = null
    st.cuts++
    this.slashPoseAt = now
    this.audio.slash()
    if (b.kind === 'normal') this.startLeap(x, y, now)
    this.resolve(b, tier, x, y, st.cuts)
  }

  private startLeap(x: number, y: number, now: number) {
    const pos = this.samuraiPos(now)
    const { minX, maxX, minLift, maxLift } = CONFIG.leap
    const toX = Math.max(this.W * minX, Math.min(this.W * maxX, x))
    this.facing = toX >= pos.x ? 1 : -1
    this.leap = {
      fromX: pos.x,
      toX,
      lift: Math.max(minLift, Math.min(maxLift, (this.roofY() - y) * 0.45)),
      start: now,
    }
  }

  /* ---------- loop ---------- */

  private frame = (ts: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const realDt = Math.min(CONFIG.world.maxFrameDt, Math.max(0, ts - this.lastFrame))
    this.lastFrame = ts
    if (!this.paused) this.update(realDt)
    this.render()
    if (this.bgCtx && this.bg && this.frameCount++ % CONFIG.world.bgCopyEveryFrames === 0) {
      this.bgCtx.drawImage(this.canvas, 0, 0, this.bg.width, this.bg.height)
    }
  }

  private tension(now: number) {
    let t = 0
    for (const b of this.bolts) if (!b.resolved && b.kind === 'normal') t = Math.max(t, growth(b, now))
    return t
  }

  private update(realDt: number) {
    const now = this.now()
    const visDt = this.effects.consumeHitStop(realDt)
    this.visual += visDt

    const target = this.tension(now) > 0.72 ? CONFIG.telegraph.worldSpeed : 1
    this.worldSpeed += (target - this.worldSpeed) * clamp01((realDt / 1000) * CONFIG.telegraph.worldSpeedLerp)
    const worldDt = visDt * this.worldSpeed
    this.rain.update(worldDt, this.W, this.H)
    this.parallax += worldDt * CONFIG.world.parallaxSpeed
    this.effects.update(visDt)
    this.input.prune(performance.now())

    if (now >= this.ambientNext) {
      const { minGap, maxGap } = CONFIG.ambientLightning
      this.ambientNext = now + minGap + Math.random() * (maxGap - minGap)
      if (this.tension(now) === 0) this.ambientStart = now
    }

    if (this.leap && now - this.leap.start >= CONFIG.leap.ms) {
      this.samX = this.leap.toX
      this.leap = null
    }

    if (this.mode === 'playing') this.updatePlaying(now, realDt)
    if (this.mode === 'ending' && now - this.endingStart >= CONFIG.ending.durationMs) this.finishRun(now)
  }

  private updatePlaying(now: number, dt: number) {
    const band = bandFor(this.year)

    if (this.spawnedAny) {
      this.rift = Math.max(0, this.rift - (band.drain * dt) / 1000)
      if (Math.abs(this.rift - this.riftEmitted) >= 0.5 || this.rift <= 0) {
        this.riftEmitted = this.rift
        this.emit('riftChanged', { rift: this.rift })
      }
      if (this.rift <= 0) {
        this.beginEnding(now)
        return
      }
    }

    const pos = this.samuraiPos(now)
    const homing = clamp01((dt / 1000) * CONFIG.cut.homingRate)
    for (const b of this.bolts) {
      if (b.resolved) continue
      if (b.kind === 'normal') b.aimX += (pos.x - b.aimX) * homing
      if (now >= b.T) {
        this.land(b, now, pos.x)
        if (this.mode !== 'playing') return
      }
    }

    if (this.nextSpawnAt !== null && now >= this.nextSpawnAt) {
      const active = this.bolts.filter((b) => !b.resolved && b.kind === 'normal').length
      if (active < band.maxActive) {
        this.spawn('normal', now, band)
        if (Math.random() < band.cursedChance) this.spawn('cursed', now + 160, band)
        this.nextSpawnAt = now + band.gap * (0.85 + Math.random() * 0.3)
      } else {
        this.nextSpawnAt = now + 120
      }
    }

    this.bolts = this.bolts.filter((b) => {
      if (!b.resolved) return true
      const at = b.cut ? b.cut.time : b.landedAt
      return now - at < 1400
    })
  }

  private spawn(kind: BoltKind, t0: number, band: ReturnType<typeof bandFor>) {
    const now = this.now()
    const pos = this.samuraiPos(now)
    const fc = CONFIG.bolt.feint
    const bandIdx = Math.max(0, CONFIG.bands.indexOf(band))
    const maxGap = fc.maxGap[Math.min(bandIdx, fc.maxGap.length - 1)]
    const forceFeint = kind === 'normal' && this.boltsSinceFeint >= maxGap
    const b = createBolt(kind, t0, band, pos.x, this.headY(), this.roofY(), this.W, Math.random, forceFeint)
    if (kind === 'normal') this.boltsSinceFeint = b.crawl > 0 ? 0 : this.boltsSinceFeint + 1
    if (kind === 'normal') b.stopCue = this.audio.scheduleCue(t0 - now, b.lead)
    this.bolts.push(b)
    this.spawnedAny = true

    if (kind === 'normal' && !this.cutHintShown && this.best <= CONFIG.run.startYear) {
      this.cutHintShown = true
      this.effects.pop({
        x: this.W / 2,
        y: this.H * 0.3,
        text: 'SWIPE THROUGH THE BOLT',
        sub: '雷を斬れ',
        size: 20,
        color: WHITE,
        life: CONFIG.cut.hintMs,
        rise: 10,
        family: 'serif',
        spring: false,
      })
    }
    if (kind === 'cursed' && !this.cursedHintShown) {
      this.cursedHintShown = true
      this.effects.pop({
        x: this.W / 2,
        y: this.H * 0.36,
        text: 'LET RED BOLTS FALL',
        sub: '赤は斬るな',
        size: 20,
        color: CURSED2,
        life: CONFIG.cut.hintMs,
        rise: 10,
        family: 'serif',
        spring: false,
      })
    }
  }

  private land(b: Bolt, now: number, samuraiX: number) {
    b.landed = true
    b.landedAt = now
    b.resolved = true
    b.stopCue = null
    const endX = b.kind === 'normal' ? b.aimX : b.targetX
    const hitsSamurai = Math.abs(endX - samuraiX) < CONFIG.cut.strikeRadius
    this.audio.scheduleThunder(0)
    this.effects.flash(
      this.reduceFlashes ? CONFIG.effects.reducedFlashAlpha * 0.5 : CONFIG.effects.boltFlashAlpha,
      CONFIG.effects.boltFlashMs,
      WHITE,
    )
    const pal = this.palette(now)
    if (hitsSamurai) {
      this.resolve(b, 'slipped', samuraiX, this.headY())
      return
    }
    b.outcome = 'evaded'
    const color = b.kind === 'cursed' ? CURSED : pal.accent2
    this.effects.ripple(endX, b.endY, 70, color, 520, 2)
    this.effects.burst(endX, b.endY, 10, color, color, 0.6)
    if (b.kind === 'normal') {
      this.effects.pop({
        x: Math.max(70, Math.min(this.W - 70, endX)),
        y: b.endY - 40,
        text: 'EVADED',
        sub: '避',
        size: 16,
        color: mixRgb(pal.accent2, WHITE, 0.4),
        life: CONFIG.feedback.labelMs,
        rise: 20,
        family: 'serif',
        spring: false,
      })
    }
  }

  private resolve(b: Bolt, tier: Tier, x: number, y: number, multi = 1) {
    b.resolved = true
    b.outcome = tier
    const now = this.now()
    const prevYear = this.year
    const prevEra = this.eraIndex
    const travelled = this.year - CONFIG.run.startYear

    this.combo = comboAfter(this.combo, tier)
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    this.rift = riftAfter(this.rift, tier)
    this.riftEmitted = this.rift

    let jump = 0
    if (tier === 'cursed') {
      jump = -Math.min(travelled, jumpYears('cursed', 0, travelled))
    } else if (tier !== 'slipped') {
      const speedMul = b.crawl > 0 ? CONFIG.bolt.feint.yearsMul : CONFIG.bolt.speeds[b.speed].yearsMul
      jump = Math.round(jumpYears(tier, this.combo, travelled) * (1 + CONFIG.cut.multiBonus * (multi - 1)) * speedMul)
    }
    this.year += jump
    if (tier === 'perfect') this.perfects++
    if (jump > 0) this.jumps++

    this.emit('riftChanged', { rift: this.rift })
    this.emit('comboChanged', { combo: this.combo, pulse: tier === 'perfect' || multi > 1 })

    const pal = this.palette(now)
    if (tier === 'slipped') this.feedbackStruck(x, y, pal)
    else if (tier === 'cursed') this.feedbackCursed(x, y, jump, prevYear)
    else this.feedbackCut(x, y, tier, jump, multi, prevYear, pal, now)

    const newEra = eraIndexFor(this.year)
    if (newEra !== prevEra) {
      this.eraIndex = newEra
      this.transitionPalette(newEra, CONFIG.palette.blendMs, now)
      const era = ERAS[newEra]
      const next = paletteFor(newEra)
      this.effects.burst(this.W / 2, this.H * 0.4, CONFIG.effects.eraParticles, next.accent, next.accent2, 1.4)
      this.effects.ripple(this.W / 2, this.H * 0.4, this.W * 0.8, next.accent, 900, 3)
      this.emit('eraChanged', { name: era.name, jp: era.jp, year: this.year, index: newEra, announce: true })
    }

    if (this.rift <= 0) this.beginEnding(now)
  }

  private label(x: number, y: number, tier: Tier, color: RGB) {
    const lbl = CONFIG.labels[tier]
    this.effects.pop({
      x: Math.max(70, Math.min(this.W - 70, x)),
      y: Math.max(140, y - 56),
      text: lbl.en.toUpperCase(),
      sub: lbl.jp,
      size: tier === 'perfect' ? 28 : 20,
      color,
      life: CONFIG.feedback.labelMs,
      rise: 26,
      family: 'serif',
      spring: tier === 'perfect',
    })
  }

  private haptic(ms: number) {
    if (ms <= 0 || typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    try {
      navigator.vibrate(ms)
    } catch {
      // haptics unavailable
    }
  }

  private feedbackCut(
    x: number,
    y: number,
    tier: HitTier,
    jump: number,
    multi: number,
    prevYear: number,
    pal: Palette,
    now: number,
  ) {
    const cfg = CONFIG.reveal[tier]
    const overlap = now - this.lastRevealAt < CONFIG.overlapWindow
    this.lastRevealAt = now

    if (cfg.hitStop > 0 && !overlap) this.effects.hitStop(cfg.hitStop)
    if (cfg.flashMs > 0) this.effects.flash(cfg.flashAlpha, cfg.flashMs, WHITE)
    if (cfg.shakePx > 0) this.effects.shake(cfg.shakePx, cfg.shakeMs)
    this.effects.ripple(x, y, cfg.rippleRadius, hexToRgb(cfg.rippleColor), cfg.rippleMs, cfg.rippleWidth)
    if (cfg.warpMs > 0 && !overlap) this.effects.warp(cfg.warpMs, pal.accent2, this.W / 2, this.H * 0.42)
    this.effects.burst(x, y, overlap ? cfg.particles / 2 : cfg.particles, SAKURA, tier === 'perfect' ? GOLD : pal.accent)

    const popColor = hexToRgb(cfg.popColor)
    if (jump > 0) {
      this.effects.pop({
        x: this.W / 2,
        y: CONFIG.feedback.popY,
        text: `+${formatYear(jump)} YEARS`,
        size: cfg.popSize * (overlap ? 0.8 : 1),
        color: popColor,
        life: CONFIG.feedback.popMs,
        rise: 40,
        family: 'sans',
        spring: tier !== 'close',
      })
    }
    this.label(x, y, tier, tier === 'perfect' ? GOLD : popColor)
    if (multi > 1) {
      this.effects.pop({
        x: Math.max(80, Math.min(this.W - 80, x)),
        y: Math.max(180, y - 100),
        text: multi === 2 ? 'DOUBLE CUT' : 'TRIPLE CUT',
        sub: multi === 2 ? '二連' : '三連',
        size: 22,
        color: GOLD,
        life: CONFIG.feedback.popMs,
        rise: 30,
        family: 'serif',
        spring: true,
      })
    }
    this.haptic(cfg.haptic)

    if (tier === 'perfect') {
      this.audio.perfectChime(this.combo)
      this.audio.whoosh(cfg.rollMs)
    } else if (tier === 'good') {
      this.audio.goodChime()
      this.audio.whoosh(cfg.rollMs)
    } else {
      this.audio.softTone()
    }

    if (jump > 0) {
      this.emit('yearChanged', { from: prevYear, to: this.year, duration: cfg.rollMs, delay: cfg.rollDelay, jump })
    }
  }

  private feedbackCursed(x: number, y: number, jump: number, prevYear: number) {
    this.effects.flash(this.reduceFlashes ? CONFIG.effects.reducedFlashAlpha : 0.35, 140, CURSED)
    this.effects.shake(6, 260)
    this.effects.ripple(x, y, 160, CURSED, 600, 4)
    this.effects.burst(x, y, 30, CURSED, CURSED2, 1)
    this.label(x, y, 'cursed', CURSED2)
    if (jump < 0) {
      this.effects.pop({
        x: this.W / 2,
        y: CONFIG.feedback.popY,
        text: `−${formatYear(-jump)} YEARS`,
        size: 34,
        color: CURSED2,
        life: CONFIG.feedback.popMs,
        rise: -30,
        family: 'sans',
        spring: false,
      })
      this.emit('yearChanged', { from: prevYear, to: this.year, duration: 700, delay: 60, jump })
    }
    this.audio.softTone()
    this.haptic(60)
  }

  private feedbackStruck(x: number, y: number, pal: Palette) {
    this.struckAt = this.now()
    this.effects.flash(this.reduceFlashes ? CONFIG.effects.reducedFlashAlpha : 0.55, 180, WHITE)
    this.effects.shake(11, 340)
    this.effects.ripple(x, y, 120, mixRgb(pal.accent2, WHITE, 0.5), 600, 3)
    this.effects.burst(x, y, 24, pal.accent2, WHITE, 1)
    this.label(x, y, 'slipped', hexToRgb(CONFIG.colors.softWhite))
    this.audio.softTone()
    this.haptic(80)
  }

  private beginEnding(now: number) {
    this.mode = 'ending'
    this.endingStart = now
    for (const b of this.bolts) b.stopCue?.()
    this.bolts = this.bolts.filter((b) => b.resolved)
    this.nextSpawnAt = null
    this.audio.cancelScheduled()
    this.audio.arrival()
    this.input.reset()
    this.strokeStates.clear()
  }

  private finishRun(now: number) {
    this.mode = 'arrival'
    this.arrivalStart = now
    const previousBest = this.best
    const newBest = this.year > Math.max(previousBest, CONFIG.run.startYear)
    if (newBest) {
      this.best = this.year
      writeNumber(CONFIG.storage.best, this.year)
      this.effects.burst(this.W / 2, this.H * 0.36, 80, GOLD, GOLD, 1.3)
      this.effects.ripple(this.W / 2, this.H * 0.36, 200, GOLD, 900, 3)
    }
    const era = ERAS[this.eraIndex]
    this.emit('runEnded', {
      year: this.year,
      eraName: era.name,
      eraJp: era.jp,
      best: this.best,
      previousBest,
      newBest,
      perfects: this.perfects,
      bestCombo: this.bestCombo,
      jumps: this.jumps,
    })
  }

  /* ---------- rendering ---------- */

  private ambientAlpha(now: number) {
    const age = now - this.ambientStart
    if (age < 0 || age > 260) return 0
    const a = CONFIG.ambientLightning.alpha
    if (age < 70) return a
    if (age < 130) return a * 0.15
    if (age < 200) return a * 0.6
    return 0
  }

  private render() {
    const { ctx, W, H } = this
    const now = this.now()
    const pal = this.palette(now)
    const k = this.paletteProgress(now)
    const gy = H * CONFIG.world.groundY
    const roofY = rooftopY(gy)
    const pos = this.samuraiPos(now)

    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0)
    const shake = this.effects.shakeOffset()
    ctx.save()
    ctx.translate(shake.x, shake.y)

    drawSky(ctx, W, H, gy, pal, this.visual, this.ambientAlpha(now))
    const auroraFrom = this.skyFrom === 'beyond' ? 1 - k : 0
    const auroraTo = this.skyTo === 'beyond' ? k : 0
    drawAurora(ctx, W, H, pal, this.visual, auroraFrom + auroraTo)
    if (k < 1 && this.skyFrom !== this.skyTo) drawSkyline(ctx, this.skyFrom, W, gy, this.parallax, pal, 1 - k, this.visual)
    drawSkyline(ctx, this.skyTo, W, gy, this.parallax, pal, this.skyFrom === this.skyTo ? 1 : k, this.visual)

    const contract =
      this.mode === 'ending'
        ? 1 - easeInOut(clamp01((now - this.endingStart) / CONFIG.ending.durationMs))
        : this.mode === 'playing'
          ? 1
          : 0.55
    const riftForHalo = this.mode === 'playing' || this.mode === 'ending' ? this.rift : 60
    drawHalo(ctx, pos.x, roofY - 48 - pos.lift, riftForHalo, pal, contract)

    drawRooftop(ctx, W, H, gy, pal)

    if (this.mode === 'playing') this.drawZones(ctx, now, pos, roofY, pal)
    this.drawSamuraiLayer(ctx, now, pos, roofY, pal)

    this.drawBolts(ctx, now, pal)
    this.effects.renderWarp(ctx, W)
    this.effects.renderWorld(ctx)
    this.drawTrails(ctx, pal)
    this.rain.draw(ctx, pal)
    ctx.restore()

    this.effects.renderFlash(ctx, W, H)

    let white = 0
    if (this.mode === 'ending') {
      white = CONFIG.ending.whiteFade * easeInOut(clamp01((now - this.endingStart) / CONFIG.ending.durationMs))
    } else if (this.mode === 'arrival') {
      white = CONFIG.ending.whiteFade * (1 - clamp01((now - this.arrivalStart) / CONFIG.ending.arrivalFadeMs))
    }
    if (white > 0) {
      ctx.fillStyle = `rgba(255,255,255,${white})`
      ctx.fillRect(-20, -20, W + 40, H + 40)
    }
  }

  private drawZones(
    ctx: CanvasRenderingContext2D,
    now: number,
    pos: { x: number; lift: number },
    roofY: number,
    pal: Palette,
  ) {
    const cx = pos.x
    const cy = roofY - CONFIG.cut.headOffset - pos.lift
    let near = 0
    for (const b of this.bolts) {
      if (b.resolved || b.kind !== 'normal') continue
      const pts = visiblePoints(livePoints(b), growth(b, now))
      const tip = pts[pts.length - 1]
      const d = Math.hypot(tip.x - cx, tip.y - cy)
      near = Math.max(near, clamp01(1 - (d - CONFIG.cut.perfectRadius) / CONFIG.cut.goodRadius))
    }
    const pulse = 0.5 + 0.5 * Math.sin(now / 90)

    ctx.save()
    ctx.setLineDash([3, 7])
    ctx.lineWidth = 1
    ctx.strokeStyle = rgba(pal.accent2, 0.06 + near * 0.12)
    ctx.beginPath()
    ctx.arc(cx, cy, CONFIG.cut.goodRadius, Math.PI, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = 1.4 + near * 1.2
    ctx.strokeStyle = rgba(GOLD, 0.14 + near * (0.35 + 0.2 * pulse))
    ctx.beginPath()
    ctx.arc(cx, cy, CONFIG.cut.perfectRadius, Math.PI * 1.02, Math.PI * 1.98)
    ctx.stroke()
    if (near > 0.05) {
      ctx.fillStyle = rgba(GOLD, near * 0.8)
      ctx.font = `600 11px ${this.fonts.serif}`
      ctx.textAlign = 'center'
      ctx.fillText('雷切', cx, cy - CONFIG.cut.perfectRadius - 6)
    }
    if (now < this.bladeReadyAt) {
      const k = clamp01((now - this.whiffAt) / CONFIG.cut.whiffCooldownMs)
      const r = 34
      ctx.lineWidth = 3
      ctx.strokeStyle = rgba(WHITE, 0.12)
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = rgba(WHITE, 0.75)
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k)
      ctx.stroke()
      ctx.fillStyle = rgba(WHITE, 0.7)
      ctx.font = `600 11px ${this.fonts.serif}`
      ctx.textAlign = 'center'
      ctx.fillText('納刀', cx, cy + r + 14)
    }
    ctx.restore()
  }

  private drawSamuraiLayer(
    ctx: CanvasRenderingContext2D,
    now: number,
    pos: { x: number; lift: number; k: number },
    roofY: number,
    pal: Palette,
  ) {
    const scale = CONFIG.world.samuraiScale
    const slash = this.leap ? 1 : 1 - clamp01((now - this.slashPoseAt) / CONFIG.samurai.slashPoseMs)
    const tension = this.tension(now)
    const struck = clamp01(1 - (now - this.struckAt) / 300)
    const draw = (x: number, lift: number, alpha: number) => {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(x + (struck > 0 ? (Math.random() - 0.5) * 6 * struck : 0), roofY - lift)
      ctx.scale(this.facing, 1)
      drawSamurai(ctx, 0, 0, scale, { tension, slash, time: this.visual }, pal)
      ctx.restore()
    }

    const lp = this.leap
    if (lp) {
      for (let j = CONFIG.leap.afterimages; j >= 1; j--) {
        const kj = pos.k - j * 0.07
        if (kj <= 0) continue
        const x = lp.fromX + (lp.toX - lp.fromX) * easeInOut(kj)
        draw(x, Math.sin(Math.PI * kj) * lp.lift, 0.28 * (1 - j / (CONFIG.leap.afterimages + 1)))
      }
    }
    draw(pos.x, pos.lift, 1)
  }

  /** Small per-frame jitter on interior points so live bolts crackle; hit-testing uses the stable path. */
  private crackle(pts: Point[], now: number, seed: number): Point[] {
    const amp = CONFIG.bolt.crackle
    const frame = Math.floor(now / 45) + seed * 97
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p
      const h = Math.sin((frame + i * 13.7) * 12.9898) * 43758.5453
      const n = (h - Math.floor(h)) * 2 - 1
      return { x: p.x + n * amp, y: p.y }
    })
  }

  private strokeBolt(ctx: CanvasRenderingContext2D, pts: Point[], alpha: number, pal: Palette, width = 1) {
    if (alpha <= 0.01 || pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = rgba(pal.accent, 0.25 * alpha)
    ctx.lineWidth = 10 * width
    ctx.stroke()
    ctx.strokeStyle = rgba(pal.accent2, 0.65 * alpha)
    ctx.lineWidth = 4 * width
    ctx.stroke()
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`
    ctx.lineWidth = 1.6 * width
    ctx.stroke()
    ctx.restore()
  }

  private glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: RGB, alpha: number) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, rgba(color, alpha))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawBolts(ctx: CanvasRenderingContext2D, now: number, pal: Palette) {
    const cfg = CONFIG.bolt
    for (const b of this.bolts) {
      const bp = this.boltPalette(b.kind, pal)

      if (b.cut) {
        const c = b.cut
        const since = now - c.time
        const a = Math.max(0, 1 - since / (cfg.afterglowMs + cfg.cutLingerMs))
        if (a <= 0) continue
        const sep = clamp01(since / 180) * 10
        const nx = -Math.sin(c.angle)
        const ny = Math.cos(c.angle)
        const drop = Math.pow(since / 1000, 2) * 500
        const upper = c.upper.map((p) => ({ x: p.x - nx * sep, y: p.y - ny * sep - since * 0.04 }))
        const lower = c.lower.map((p) => ({ x: p.x + nx * sep, y: p.y + ny * sep + drop }))
        this.strokeBolt(ctx, upper, a, bp)
        this.strokeBolt(ctx, lower, a * 0.7, bp, 0.8)

        const la = Math.max(0, 1 - since / cfg.slashLineMs)
        if (la > 0) {
          const L = (cfg.slashLineLength / 2) * clamp01(since / 60 + 0.2)
          const dx = Math.cos(c.angle) * L
          const dy = Math.sin(c.angle) * L
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          ctx.lineCap = 'round'
          ctx.strokeStyle = rgba(c.tier === 'perfect' ? GOLD : bp.accent, 0.55 * la)
          ctx.lineWidth = 9
          ctx.beginPath()
          ctx.moveTo(c.x - dx, c.y - dy)
          ctx.lineTo(c.x + dx, c.y + dy)
          ctx.stroke()
          ctx.strokeStyle = `rgba(255,255,255,${la})`
          ctx.lineWidth = 3
          ctx.stroke()
          ctx.restore()
        }
        continue
      }

      if (b.landed) {
        const age = now - b.landedAt
        if (age > cfg.afterglowMs) continue
        const alpha = 1 - age / cfg.afterglowMs
        const pts = livePoints(b)
        this.strokeBolt(ctx, pts, alpha, bp, 1.2)
        for (const br of b.branches) {
          const o = pts[br.index]
          this.strokeBolt(ctx, br.pts.map((p) => ({ x: p.x + o.x, y: p.y + o.y })), alpha * 0.6, bp, 0.6)
        }
        const end = pts[pts.length - 1]
        this.glow(ctx, end.x, end.y, 46, bp.accent2, 0.55 * alpha)
        continue
      }

      if (now < b.t0) continue
      const f = growth(b, now)
      const sp = cfg.speeds[b.speed]
      const pts = this.crackle(visiblePoints(livePoints(b), f), now, b.id)
      const tip = pts[pts.length - 1]

      if (b.speed === 'fast') {
        const hot = { ...bp, accent2: mixRgb(bp.accent2, WHITE, 0.55) }
        const flicker = 0.7 + 0.3 * Math.abs(Math.sin(now * 0.11 + b.id))
        this.strokeBolt(ctx, pts, (0.55 + 0.45 * f) * flicker, hot, sp.width * (0.8 + 0.5 * f))
        this.glow(ctx, tip.x, tip.y, 20 + 18 * f, hot.accent2, 0.6 + 0.3 * f)
      } else if (b.speed === 'slow') {
        const pulse = 0.88 + 0.12 * Math.sin(now * 0.012 + b.id)
        this.strokeBolt(ctx, pts, (0.5 + 0.5 * f) * pulse, bp, sp.width * (0.75 + 0.45 * f))
        this.glow(ctx, tip.x, tip.y, 16 + 16 * f, bp.accent, 0.45 + 0.35 * f)
      } else if (isPoised(b, now)) {
        const throb = Math.abs(Math.sin(now * 0.045))
        const hot = { ...bp, accent2: mixRgb(bp.accent2, WHITE, 0.4 + 0.4 * throb) }
        this.strokeBolt(ctx, pts, 0.75 + 0.25 * throb, hot, sp.width * 0.95)
        this.glow(ctx, tip.x, tip.y, 26 + 16 * throb, hot.accent2, 0.75)
      } else {
        const holding = isHolding(b, now)
        const flicker = holding ? 0.6 + 0.4 * Math.abs(Math.sin(now * 0.08)) : 0.82 + 0.18 * Math.sin(now * 0.05 + b.id * 1.7)
        this.strokeBolt(ctx, pts, (0.45 + 0.55 * f) * flicker, bp, sp.width * (0.7 + 0.5 * f))
        this.glow(ctx, tip.x, tip.y, (holding ? 22 : 12) + 14 * f, bp.accent2, 0.5 + 0.4 * f)
      }
      this.glow(ctx, tip.x, tip.y, 5, WHITE, 0.9)
    }
  }

  private drawTrails(ctx: CanvasRenderingContext2D, pal: Palette) {
    const now = performance.now()
    const life = CONFIG.effects.slashTrailMs
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    const core = mixRgb(pal.accent2, WHITE, 0.6)
    for (const trail of this.input.trails) {
      for (let i = 1; i < trail.length; i++) {
        const a = clamp01(1 - (now - trail[i].t) / life)
        if (a <= 0) continue
        ctx.strokeStyle = rgba(pal.accent, 0.35 * a)
        ctx.lineWidth = 3 + 9 * a
        ctx.beginPath()
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
        ctx.lineTo(trail[i].x, trail[i].y)
        ctx.stroke()
        ctx.strokeStyle = rgba(core, a)
        ctx.lineWidth = 1 + 3 * a
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}
