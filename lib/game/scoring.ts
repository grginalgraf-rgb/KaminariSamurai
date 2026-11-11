import { CONFIG, type Tier } from './config'

export function comboAfter(combo: number, tier: Tier): number {
  if (tier === 'perfect' || tier === 'good') return combo + 1
  if (tier === 'close') return combo
  return 0
}

export function comboMult(combo: number): number {
  return 1 + CONFIG.combo.step * Math.min(combo, CONFIG.combo.cap)
}

export function riftAfter(rift: number, tier: Tier): number {
  return Math.max(0, Math.min(CONFIG.run.maxRift, rift + CONFIG.rift[tier]))
}

export function jumpYears(tier: Tier, combo: number, totalTravelled: number): number {
  const growth = 1 + Math.max(0, totalTravelled) / CONFIG.jump.growthDivisor
  return Math.round(CONFIG.jump.base * CONFIG.jump.tierMult[tier] * comboMult(combo) * growth)
}
