'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CONFIG } from '@/lib/game/config'
import type { Engine } from '@/lib/game/engine'
import { ERAS } from '@/lib/game/eras'
import { formatYear } from '@/lib/game/format'
import { cn } from '@/lib/utils'

interface HudProps {
  engine: Engine
  best: number
  visible: boolean
  muted: boolean
  onToggleMute: () => void
}

function yearFontSize(text: string) {
  const len = text.length
  if (len <= 5) return 46
  if (len <= 7) return 40
  if (len <= 9) return 32
  return 26
}

export function Hud({ engine, best, visible, muted, onToggleMute }: HudProps) {
  const yearRef = useRef<HTMLSpanElement>(null)
  const riftRef = useRef<HTMLDivElement>(null)
  const [combo, setCombo] = useState({ value: 0, pulse: 0 })
  const [era, setEra] = useState({ name: ERAS[0].name, jp: ERAS[0].jp })

  useEffect(() => {
    let raf = 0
    const write = (v: number) => {
      const el = yearRef.current
      if (!el) return
      const text = formatYear(v)
      el.textContent = text
      el.style.fontSize = `${yearFontSize(text)}px`
    }
    write(CONFIG.run.startYear)

    const offs = [
      engine.on('yearChanged', ({ from, to, duration, delay }) => {
        cancelAnimationFrame(raf)
        if (duration <= 0) {
          write(to)
          return
        }
        const start = performance.now() + delay
        const step = (t: number) => {
          const p = Math.max(0, Math.min(1, (t - start) / duration))
          const e = 1 - Math.pow(1 - p, 3)
          write(from + (to - from) * e)
          if (p < 1) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
      }),
      engine.on('riftChanged', ({ rift }) => {
        if (riftRef.current) riftRef.current.style.width = `${(rift / CONFIG.run.maxRift) * 100}%`
      }),
      engine.on('comboChanged', ({ combo: value, pulse }) => {
        setCombo((c) => ({ value, pulse: pulse ? c.pulse + 1 : c.pulse }))
      }),
      engine.on('eraChanged', ({ name, jp }) => setEra({ name, jp })),
    ]
    return () => {
      cancelAnimationFrame(raf)
      offs.forEach((off) => off())
    }
  }, [engine])

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      aria-hidden={!visible}
    >
      <div className="absolute inset-x-0 top-0 flex h-1 justify-center bg-foreground/10">
        <div
          ref={riftRef}
          className="h-full w-full bg-primary shadow-[0_0_12px_var(--primary)] transition-[width] duration-500 ease-out"
        />
      </div>
      <span className="sr-only">Time rift strength</span>

      <div className="flex items-start justify-between px-4 pt-4">
        <div className="w-20 pt-1 text-xs text-muted-foreground tabular-nums">
          {best > 0 && (
            <>
              <span className="block font-serif text-[10px] tracking-[0.25em]">{'最遠'}</span>
              Best {formatYear(best)}
            </>
          )}
        </div>

        <div className="flex flex-col items-center" aria-live="polite">
          <span className="text-[10px] font-medium tracking-[0.45em] text-muted-foreground">YEAR</span>
          <span
            ref={yearRef}
            className="font-sans font-bold leading-none text-foreground tabular-nums drop-shadow-[0_0_14px_rgba(0,0,0,0.6)]"
          >
            {formatYear(CONFIG.run.startYear)}
          </span>
          <span className="mt-1.5 font-serif text-sm text-foreground/85">
            {era.name} <span className="text-accent">{'·'}</span> {era.jp}
          </span>
        </div>

        <div className="flex w-20 justify-end pt-1">
          {combo.value >= 2 && (
            <span
              key={combo.pulse}
              className="anim-combo-pulse font-sans text-2xl font-bold text-primary tabular-nums"
              aria-label={`Combo ${combo.value}`}
            >
              x{combo.value}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleMute}
        className="pointer-events-auto absolute bottom-4 right-4 flex size-11 items-center justify-center rounded-full bg-background/40 text-foreground/80 backdrop-blur-sm transition-colors hover:text-foreground"
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        tabIndex={visible ? 0 : -1}
      >
        {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </button>
    </div>
  )
}
