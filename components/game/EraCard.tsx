'use client'

import { useEffect, useState } from 'react'
import { CONFIG } from '@/lib/game/config'
import type { Engine } from '@/lib/game/engine'
import { formatYear } from '@/lib/game/format'

interface CardState {
  key: number
  name: string
  jp: string
  year: number
}

export function EraCard({ engine }: { engine: Engine }) {
  const [card, setCard] = useState<CardState | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = engine.on('eraChanged', ({ name, jp, year, announce }) => {
      if (!announce) return
      setCard((c) => ({ key: (c?.key ?? 0) + 1, name, jp, year }))
      clearTimeout(timer)
      timer = setTimeout(() => setCard(null), CONFIG.eraCardMs)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [engine])

  if (!card) return null

  return (
    <div
      key={card.key}
      className="anim-era-card pointer-events-none absolute inset-x-0 top-[30%] z-20 flex flex-col items-center gap-1 border-y border-primary/40 bg-background/55 py-6 backdrop-blur-sm"
      role="status"
    >
      <span className="anim-era-text font-serif text-5xl font-extrabold text-foreground drop-shadow-[0_0_18px_var(--accent)]">
        {card.jp}
      </span>
      <span className="font-serif text-lg tracking-[0.3em] text-accent uppercase">{card.name}</span>
      <span className="font-sans text-sm text-muted-foreground tabular-nums">Year {formatYear(card.year)}</span>
    </div>
  )
}
