import { CONFIG } from './config'

export interface TrailPoint {
  x: number
  y: number
  t: number
}

export interface InputCallbacks {
  toLogical(clientX: number, clientY: number): { x: number; y: number }
  toGameTime(perfTime: number): number
  isActive(): boolean
  onDown(id: number, x: number, y: number, t: number): void
  onMove(id: number, x0: number, y0: number, t0: number, x1: number, y1: number, t1: number): void
  onEnd(id: number): void
}

interface StrokeCursor {
  x: number
  y: number
  t: number
  trail: TrailPoint[]
}

function eventTime(e: Event): number {
  const now = performance.now()
  const ts = e.timeStamp
  return Number.isFinite(ts) && Math.abs(ts - now) < 1000 ? ts : now
}

export class PointerInput {
  trails: TrailPoint[][] = []
  private strokes = new Map<number, StrokeCursor>()

  constructor(
    private el: HTMLElement,
    private cb: InputCallbacks,
  ) {
    el.addEventListener('pointerdown', this.down)
    el.addEventListener('pointermove', this.move)
    el.addEventListener('pointerup', this.end)
    el.addEventListener('pointercancel', this.end)
    el.addEventListener('lostpointercapture', this.end)
  }

  destroy() {
    this.el.removeEventListener('pointerdown', this.down)
    this.el.removeEventListener('pointermove', this.move)
    this.el.removeEventListener('pointerup', this.end)
    this.el.removeEventListener('pointercancel', this.end)
    this.el.removeEventListener('lostpointercapture', this.end)
  }

  reset() {
    for (const id of this.strokes.keys()) this.cb.onEnd(id)
    this.strokes.clear()
    this.trails = []
  }

  prune(now: number) {
    const limit = CONFIG.effects.slashTrailMs
    const active = new Set([...this.strokes.values()].map((s) => s.trail))
    for (const trail of this.trails) {
      while (trail.length > 0 && now - trail[0].t > limit) trail.shift()
    }
    this.trails = this.trails.filter((t) => t.length > 0 || active.has(t))
  }

  private down = (e: PointerEvent) => {
    if (!this.cb.isActive()) return
    e.preventDefault()
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      // capture not supported for this pointer
    }
    const perf = eventTime(e)
    const { x, y } = this.cb.toLogical(e.clientX, e.clientY)
    const t = this.cb.toGameTime(perf)
    const trail: TrailPoint[] = [{ x, y, t: perf }]
    this.trails.push(trail)
    this.strokes.set(e.pointerId, { x, y, t, trail })
    this.cb.onDown(e.pointerId, x, y, t)
  }

  private move = (e: PointerEvent) => {
    const stroke = this.strokes.get(e.pointerId)
    if (!stroke) return
    if (!this.cb.isActive()) {
      this.end(e)
      return
    }
    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    const events = coalesced.length > 0 ? coalesced : [e]
    for (const ev of events) {
      const perf = eventTime(ev)
      const { x, y } = this.cb.toLogical(ev.clientX, ev.clientY)
      const t = Math.max(stroke.t, this.cb.toGameTime(perf))
      this.cb.onMove(e.pointerId, stroke.x, stroke.y, stroke.t, x, y, t)
      stroke.x = x
      stroke.y = y
      stroke.t = t
      stroke.trail.push({ x, y, t: perf })
    }
  }

  private end = (e: PointerEvent) => {
    if (!this.strokes.has(e.pointerId)) return
    this.strokes.delete(e.pointerId)
    this.cb.onEnd(e.pointerId)
  }
}
