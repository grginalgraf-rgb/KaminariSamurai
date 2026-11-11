'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIG } from '@/lib/game/config'
import { Engine, type RunSummary } from '@/lib/game/engine'
import { readBool, readNumber, writeBool } from '@/lib/game/storage'
import { sansFont, serifFont } from '@/lib/fonts'
import { ArrivalScreen } from './ArrivalScreen'
import { EraCard } from './EraCard'
import { Hud } from './Hud'
import { TitleScreen } from './TitleScreen'

type Screen = 'title' | 'playing' | 'arrival'

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef<HTMLCanvasElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [screen, setScreen] = useState<Screen>('title')
  const [paused, setPaused] = useState(false)
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [muted, setMuted] = useState(false)
  const [reduceFlashes, setReduceFlashes] = useState(false)
  const [best, setBest] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const e = new Engine(canvas, bgRef.current, {
      serif: `${serifFont.style.fontFamily}, serif`,
      sans: `${sansFont.style.fontFamily}, sans-serif`,
    })

    const storedMuted = readBool(CONFIG.storage.muted) ?? false
    const storedReduce =
      readBool(CONFIG.storage.reduceFlashes) ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    e.setMuted(storedMuted)
    e.setReduceFlashes(storedReduce)
    setMuted(storedMuted)
    setReduceFlashes(storedReduce)
    setBest(readNumber(CONFIG.storage.best, 0))

    const offs = [
      e.on('runEnded', (s) => {
        setSummary(s)
        setBest(s.best)
        setScreen('arrival')
      }),
      e.on('paused', setPaused),
    ]
    setEngine(e)
    return () => {
      offs.forEach((off) => off())
      e.destroy()
    }
  }, [])

  const begin = useCallback(() => {
    if (!engine) return
    engine.unlockAudio()
    engine.startRun()
    setSummary(null)
    setScreen('playing')
  }, [engine])

  const goTitle = useCallback(() => {
    engine?.toTitle()
    setScreen('title')
  }, [engine])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      engine?.unlockAudio()
      engine?.setMuted(next)
      writeBool(CONFIG.storage.muted, next)
      return next
    })
  }, [engine])

  const toggleReduce = useCallback(() => {
    setReduceFlashes((r) => {
      const next = !r
      engine?.setReduceFlashes(next)
      writeBool(CONFIG.storage.reduceFlashes, next)
      return next
    })
  }, [engine])

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <canvas
        ref={bgRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 opacity-75 blur-2xl saturate-150"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--background)_100%)]"
      />

      <div className="relative mx-auto h-full w-full max-w-[calc(100dvh*390/844)] overflow-hidden ring-1 ring-border">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          aria-label="Kaminari Time Slip play area. Swipe through lightning bolts to cut them and leap through time."
          role="img"
        />

        {engine && (
          <>
            <Hud engine={engine} best={best} visible={screen === 'playing'} muted={muted} onToggleMute={toggleMute} />
            <EraCard engine={engine} />
          </>
        )}

        {screen === 'title' && (
          <TitleScreen
            best={best}
            muted={muted}
            reduceFlashes={reduceFlashes}
            ready={engine !== null}
            onBegin={begin}
            onToggleMute={toggleMute}
            onToggleReduce={toggleReduce}
          />
        )}

        {screen === 'arrival' && summary && <ArrivalScreen summary={summary} onAgain={begin} onTitle={goTitle} />}

        {paused && screen === 'playing' && (
          <button
            type="button"
            onClick={() => engine?.resume()}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm"
          >
            <span className="font-serif text-sm tracking-[0.4em] text-muted-foreground">{'一時停止'}</span>
            <span className="font-serif text-3xl text-foreground">Tap to resume</span>
          </button>
        )}
      </div>
    </main>
  )
}
