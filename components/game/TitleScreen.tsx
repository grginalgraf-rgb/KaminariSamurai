'use client'

import { Volume2, VolumeX, Zap, ZapOff } from 'lucide-react'
import { formatYear } from '@/lib/game/format'
import { cn } from '@/lib/utils'

interface TitleScreenProps {
  best: number
  muted: boolean
  reduceFlashes: boolean
  ready: boolean
  onBegin: () => void
  onToggleMute: () => void
  onToggleReduce: () => void
}

export function TitleScreen({
  best,
  muted,
  reduceFlashes,
  ready,
  onBegin,
  onToggleMute,
  onToggleReduce,
}: TitleScreenProps) {
  return (
    <section
      className="absolute inset-0 z-30 flex flex-col items-center justify-between px-6 pt-[8dvh] pb-[30dvh]"
      aria-labelledby="game-title"
    >
      <div className="anim-rise-in flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="font-serif text-7xl font-extrabold leading-none text-accent drop-shadow-[0_0_24px_var(--accent)]"
        >
          {'雷'}
        </span>
        <h1 id="game-title" className="font-serif text-5xl font-extrabold leading-[1.05] text-balance text-foreground">
          Kaminari
          <br />
          Time Slip
        </h1>
        <p className="font-serif text-sm tracking-[0.35em] text-muted-foreground">{'侍・時渡り'}</p>
        {best > 0 && (
          <p className="mt-2 font-sans text-sm text-foreground/85 tabular-nums">
            Farthest: <span className="font-bold text-primary">{formatYear(best)}</span>
          </p>
        )}
      </div>

      <div className="anim-rise-in flex w-full max-w-xs flex-col items-center gap-4 [animation-delay:150ms]">
        <button
          type="button"
          onClick={onBegin}
          disabled={!ready}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-primary font-serif text-xl font-semibold text-primary-foreground shadow-[0_0_32px_rgba(245,207,114,0.45)] transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-60"
        >
          Begin
          <span className="text-sm opacity-70" aria-hidden="true">
            {'始'}
          </span>
        </button>
        <p className="text-center text-sm leading-relaxed text-pretty text-foreground/80">
          Cut the lightning to leap through time. Cut it close for a bigger leap, and let red bolts fall.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            className="flex h-11 items-center gap-2 rounded-full border border-border bg-background/40 px-4 text-sm text-foreground/85 backdrop-blur-sm transition-colors hover:text-foreground"
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            {muted ? 'Muted' : 'Sound on'}
          </button>
          <button
            type="button"
            onClick={onToggleReduce}
            aria-pressed={reduceFlashes}
            className={cn(
              'flex h-11 items-center gap-2 rounded-full border bg-background/40 px-4 text-sm backdrop-blur-sm transition-colors',
              reduceFlashes ? 'border-primary/60 text-primary' : 'border-border text-foreground/85 hover:text-foreground',
            )}
          >
            {reduceFlashes ? <ZapOff className="size-4" /> : <Zap className="size-4" />}
            Reduce flashes
          </button>
        </div>
      </div>
    </section>
  )
}
