import { CONFIG } from './config'

const A = CONFIG.audio

export class GameAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private ambient!: GainNode
  private sfx!: GainNode
  private noiseBuf!: AudioBuffer
  private muted = false
  private scheduled = new Set<AudioScheduledSourceNode>()

  unlock() {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -10
      comp.ratio.value = 4
      comp.connect(ctx.destination)
      this.master = ctx.createGain()
      this.master.gain.value = this.muted ? 0 : A.master
      this.master.connect(comp)
      this.ambient = ctx.createGain()
      this.ambient.gain.value = A.ambient
      this.ambient.connect(this.master)
      this.sfx = ctx.createGain()
      this.sfx.connect(this.master)
      const len = ctx.sampleRate * 2
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.startAmbient()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(m ? 0 : A.master, this.ctx.currentTime, 0.03)
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend()
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private at(offsetMs: number): number {
    return this.ctx!.currentTime + Math.max(0, offsetMs) / 1000
  }

  private noise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    return src
  }

  private track(node: AudioScheduledSourceNode) {
    this.scheduled.add(node)
    node.onended = () => this.scheduled.delete(node)
  }

  private startAmbient() {
    const ctx = this.ctx!
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    const pad = ctx.createGain()
    pad.gain.value = 0.5
    lp.connect(pad).connect(this.ambient)
    for (const f of [55, 55.4, 82.4]) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      o.connect(lp)
      o.start()
    }
    const rain = this.noise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1400
    bp.Q.value = 0.4
    const rg = ctx.createGain()
    rg.gain.value = 0.28
    rain.connect(bp).connect(rg).connect(this.ambient)
    rain.start(0, Math.random() * 2)
  }

  scheduleCue(startOffsetMs: number, leadMs: number): (() => void) | null {
    if (!this.ctx) return null
    const ctx = this.ctx
    const t0 = this.at(startOffsetMs)
    const t1 = t0 + leadMs / 1000

    this.ambient.gain.setTargetAtTime(A.ambient * A.ambientDuck, t0, 0.08)
    this.ambient.gain.setTargetAtTime(A.ambient, t1 + 0.25, 0.4)

    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(A.cueVolume * 0.5, t0 + 0.08)
    g.gain.linearRampToValueAtTime(A.cueVolume, t1 - 0.01)
    g.gain.setValueAtTime(0, t1)
    g.connect(this.sfx)

    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.setValueAtTime(A.cueStartHz, t0)
    o1.frequency.exponentialRampToValueAtTime(A.cueEndHz, t1)
    o1.connect(g)

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    const sawGain = ctx.createGain()
    sawGain.gain.value = 0.25
    const o2 = ctx.createOscillator()
    o2.type = 'sawtooth'
    o2.frequency.setValueAtTime(A.cueStartHz / 2, t0)
    o2.frequency.exponentialRampToValueAtTime(A.cueEndHz / 2, t1)
    o2.connect(lp).connect(sawGain).connect(g)

    const crackle = this.noise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 3
    bp.frequency.setValueAtTime(1500, t0)
    bp.frequency.exponentialRampToValueAtTime(5000, t1)
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(0, t0)
    cg.gain.linearRampToValueAtTime(0.5, t1 - 0.01)
    cg.gain.setValueAtTime(0, t1)
    crackle.connect(bp).connect(cg).connect(g)

    const nodes = [o1, o2, crackle]
    for (const n of nodes) {
      n.start(t0)
      n.stop(t1 + 0.02)
      this.track(n)
    }
    return () => {
      const now = ctx.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setTargetAtTime(0, now, 0.02)
      for (const n of nodes) {
        try {
          n.stop(now + 0.1)
        } catch {
          // already stopped
        }
      }
      this.ambient.gain.cancelScheduledValues(now)
      this.ambient.gain.setTargetAtTime(A.ambient, now + 0.2, 0.4)
    }
  }

  scheduleThunder(offsetMs: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = this.at(offsetMs) + A.strikeDelay
    const vol = A.thunderVolume

    const n = this.noise()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(6000, t)
    lp.frequency.exponentialRampToValueAtTime(150, t + 0.9)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2)
    n.connect(lp).connect(g).connect(this.sfx)
    n.start(t, Math.random())
    n.stop(t + 1.25)
    this.track(n)

    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(90, t)
    o.frequency.exponentialRampToValueAtTime(45, t + 0.4)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0, t)
    og.gain.linearRampToValueAtTime(vol, t + 0.005)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    o.connect(og).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.5)
    this.track(o)
  }

  cancelScheduled() {
    if (!this.ctx) return
    for (const n of this.scheduled) {
      try {
        n.stop()
      } catch {
        // already stopped
      }
    }
    this.scheduled.clear()
    const t = this.ctx.currentTime
    this.ambient.gain.cancelScheduledValues(t)
    this.ambient.gain.setTargetAtTime(A.ambient, t, 0.2)
  }

  slash() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const n = this.noise()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2500
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.35, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
    n.connect(hp).connect(g).connect(this.sfx)
    n.start(t, Math.random())
    n.stop(t + 0.15)
  }

  private bell(freq: number, start: number, vol: number, decay = 1.6) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(vol, start + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, start + decay)
    o.connect(g).connect(this.sfx)
    o.start(start)
    o.stop(start + decay + 0.05)
  }

  private scaleNote(index: number): number {
    const steps = A.hirajoshi.length
    const octave = Math.floor(index / steps)
    const deg = A.hirajoshi[index % steps]
    return A.hirajoshiBase * Math.pow(2, octave + deg / 12)
  }

  perfectChime(combo: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const base = Math.min(combo, 10)
    for (let i = 0; i < 3; i++) {
      this.bell(this.scaleNote(base + i * 2), t + i * 0.03, A.chimeVolume)
    }
  }

  goodChime() {
    if (!this.ctx) return
    this.bell(this.scaleNote(4), this.ctx.currentTime, A.chimeVolume * 0.6, 1.1)
  }

  whoosh(ms: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const d = ms / 1000
    const n = this.noise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.2
    bp.frequency.setValueAtTime(300, t)
    bp.frequency.exponentialRampToValueAtTime(3200, t + d)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.22, t + d * 0.4)
    g.gain.linearRampToValueAtTime(0, t + d)
    n.connect(bp).connect(g).connect(this.sfx)
    n.start(t, Math.random())
    n.stop(t + d + 0.05)
  }

  softTone() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(196, t)
    o.frequency.exponentialRampToValueAtTime(150, t + 0.8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(A.failVolume, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.95)
  }

  arrival() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.2
    for (const f of A.arrivalChord) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.06, t + 0.6)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5)
      o.connect(g).connect(this.sfx)
      o.start(t)
      o.stop(t + 4.6)
    }
  }
}
