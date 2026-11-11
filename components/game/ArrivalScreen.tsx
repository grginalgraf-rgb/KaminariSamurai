'use client'

import type { RunSummary } from '@/lib/game/engine'
import { formatYear } from '@/lib/game/format'

interface ArrivalScreenProps {
  summary: RunSummary
  onAgain: () => void
  onTitle: () => void
}

export function ArrivalScreen({ summary, onAgain, onTitle }: ArrivalScreenProps) {
  const stats = [
    { label: 'Raikiri', jp: '雷切', value: summary.perfects },
    { label: 'Best combo', jp: '連撃', value: summary.bestCombo },
    { label: 'Jumps', jp: '跳躍', value: summary.jumps },
  ]

  return (
    <section
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-background/30 via-background/70 to-background/30 px-6 pb-[16dvh]"
      aria-labelledby="arrival-title"
    >
      <div className="anim-rise-in flex flex-col items-center gap-2 text-center">
        <span className="font-serif text-sm tracking-[0.5em] text-muted-foreground">{'到着'}</span>
        <h2 id="arrival-title" className="font-serif text-xl text-foreground/90">
          You settled in the year
        </h2>
        <p className="font-sans text-6xl font-bold leading-none text-foreground tabular-nums break-all">
          {formatYear(summary.year)}
        </p>
        <p className="font-serif text-base text-foreground/85">
          {summary.eraName} <span className="text-accent">{'·'}</span> {summary.eraJp}
        </p>
        {summary.newBest ? (
          <p className="anim-gold-glow mt-2 font-serif text-2xl font-extrabold text-primary">New farthest!</p>
        ) : (
          <p className="mt-2 font-sans text-sm text-muted-foreground tabular-nums">
            Farthest: <span className="text-foreground">{formatYear(summary.best)}</span>
          </p>
        )}
      </div>

      <dl className="anim-rise-in grid w-full max-w-xs grid-cols-3 gap-2 [animation-delay:120ms]">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/40 py-3">
            <dt className="flex flex-col items-center text-[11px] text-muted-foreground">
              <span className="font-serif text-xs text-accent">{s.jp}</span>
              {s.label}
            </dt>
            <dd className="font-sans text-2xl font-bold text-foreground tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="anim-rise-in flex w-full max-w-xs flex-col gap-3 [animation-delay:200ms]">
        <button
          type="button"
          onClick={onAgain}
          autoFocus
          className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-primary font-serif text-xl font-semibold text-primary-foreground shadow-[0_0_32px_rgba(245,207,114,0.45)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          Slip again
          <span className="text-sm opacity-70" aria-hidden="true">
            {'再'}
          </span>
        </button>
        <button
          type="button"
          onClick={onTitle}
          className="h-11 w-full rounded-full border border-border bg-background/40 text-sm text-foreground/85 backdrop-blur-sm transition-colors hover:text-foreground"
        >
          Title
        </button>
      </div>
    </section>
  )
}
