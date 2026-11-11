export type Tier = 'perfect' | 'good' | 'close' | 'slipped' | 'cursed'
export type HitTier = 'perfect' | 'good' | 'close'

export type SkylineKind =
  | 'edo'
  | 'meiji'
  | 'modern'
  | 'future'
  | 'neon'
  | 'deep'
  | 'beyond'

export interface Band {
  minYear: number
  lead: number
  gap: number
  maxActive: number
  cursedChance: number
  drain: number
}

export interface RevealConfig {
  hitStop: number
  flashMs: number
  flashAlpha: number
  shakePx: number
  shakeMs: number
  rippleRadius: number
  rippleMs: number
  rippleWidth: number
  rippleColor: string
  warpMs: number
  particles: number
  popSize: number
  popColor: string
  rollMs: number
  rollDelay: number
  haptic: number
}

export interface EraPaletteHex {
  skyTop: string
  skyMid: string
  skyBottom: string
  accent: string
  accent2: string
  skyline: string
  stars: number
}

export interface EraDef {
  id: string
  name: string
  jp: string
  start: number
  skyline: SkylineKind
  palette: EraPaletteHex
}

export const CONFIG = {
  world: {
    width: 390,
    height: 844,
    dprCap: 2,
    maxFrameDt: 50,
    groundY: 0.85,
    strikeMinY: 0.4,
    strikeMaxY: 0.78,
    edgeMargin: 0.12,
    samuraiScale: 1.15,
    parallaxSpeed: 0.006,
    bgCopyEveryFrames: 3,
    bgCanvasWidth: 64,
  },

  run: {
    startYear: 1600,
    startRift: 100,
    maxRift: 100,
    firstStrikeDelay: 1400,
    planAheadMs: 100,
  },

  judge: {
    perfect: 70,
    good: 150,
    close: 280,
    hitRadius: 80,
    attemptRange: 700,
    slipGraceMs: 40,
  },

  rift: { perfect: 8, good: 4, close: 1, slipped: -26, cursed: -16 } as Record<Tier, number>,

  combo: { step: 0.15, cap: 20 },

  jump: {
    base: 10,
    growthDivisor: 1000,
    tierMult: { perfect: 3, good: 1.5, close: 0.6, slipped: 0, cursed: 2 } as Record<Tier, number>,
  },

  bands: [
    { minYear: -Infinity, lead: 2000, gap: 1500, maxActive: 1, cursedChance: 0, drain: 1.2 },
    { minYear: 1800, lead: 1800, gap: 1250, maxActive: 1, cursedChance: 0.2, drain: 1.6 },
    { minYear: 1900, lead: 1650, gap: 1050, maxActive: 2, cursedChance: 0.22, drain: 2 },
    { minYear: 2100, lead: 1500, gap: 920, maxActive: 2, cursedChance: 0.26, drain: 2.4 },
    { minYear: 3000, lead: 1350, gap: 820, maxActive: 3, cursedChance: 0.3, drain: 2.8 },
    { minYear: 10000, lead: 1200, gap: 720, maxActive: 3, cursedChance: 0.33, drain: 3.2 },
    { minYear: 100000, lead: 1050, gap: 640, maxActive: 4, cursedChance: 0.36, drain: 3.6 },
  ] as Band[],

  telegraph: {
    worldSpeed: 0.6,
    worldSpeedLerp: 6,
  },

  cut: {
    perfectRadius: 105,
    goodRadius: 205,
    tipRadius: 22,
    homingRate: 2.4,
    strikeRadius: 44,
    multiBonus: 0.5,
    headOffset: 80,
    cursedMinDistance: 120,
    hintMs: 2600,
    strokeLiveMs: 280,
    whiffMinDistance: 40,
    whiffCooldownMs: 700,
    whiffRift: 6,
  },

  leap: {
    ms: 360,
    minLift: 30,
    maxLift: 190,
    minX: 0.14,
    maxX: 0.86,
    afterimages: 5,
  },

  bolt: {
    afterglowMs: 320,
    cutLingerMs: 360,
    segments: 22,
  zigAmp: 17,
  zigTaper: 0.45,
  zigFlipChance: 0.6,
  kinkChance: 0.08,
  crackle: 1.8,
    startMargin: 0.06,
    growthCurve: 1.35,
    speeds: {
      slow: { leadMul: 1.45, curve: 1.15, width: 1.45, yearsMul: 0.8, steps: 0 },
      normal: { leadMul: 1, curve: 1.35, width: 1, yearsMul: 1, steps: 0 },
      fast: { leadMul: 0.6, curve: 1.0, width: 0.7, yearsMul: 1.35, steps: 0 },
      stutter: { leadMul: 1, curve: 1.15, width: 0.9, yearsMul: 1.2, steps: 5 },
    },
    // Weights per band index: [slow, normal, fast, stutter]
    speedMix: [
      [0.35, 0.65, 0, 0],
      [0.25, 0.55, 0.2, 0],
      [0.2, 0.45, 0.2, 0.15],
      [0.15, 0.4, 0.25, 0.2],
      [0.1, 0.35, 0.3, 0.25],
      [0.1, 0.3, 0.33, 0.27],
      [0.08, 0.27, 0.37, 0.28],
    ],
    // Feint bolts crawl sideways across the sky, hesitate, then plunge.
    feint: {
      chance: [0.18, 0.3, 0.42, 0.52, 0.62, 0.72, 0.8],
      // Guarantees a feint after this many normal bolts without one, per band.
      maxGap: [5, 4, 3, 3, 2, 2, 1],
      crawlSegments: 34,
      /** Where the bolt leaves the cloud (fraction of width). */
      startRange: [0.25, 0.75],
      /** Where the meander ends and the bolt drops (fraction of width). */
      dropRange: [0.3, 0.7],
      /** How far each S/Z lobe swings sideways (fraction of width). */
      swingAmp: [0.1, 0.2],
      /** Min/max number of lobes in the meander. */
      swings: [2, 3],
      /** How far down the meander reaches before the drop (fraction of target height). */
      crawlDepth: [0.42, 0.6],
      /** Max crackle offset off the smooth spine. */
      crawlJag: 5,
      /** Min/max short forks hanging off the meander. */
      crawlForks: [2, 4],
      plungeSegments: 12,
      crawlTime: 0.66,
      holdTime: 0.12,
      plungeCurve: 1.5,
      leadMul: 1.2,
      yearsMul: 1.3,
    },
    slashLineLength: 160,
    slashLineMs: 450,
    cursedColor: '#ff3b4f',
    cursedColor2: '#ffb3bd',
  },

  reveal: {
    perfect: {
      hitStop: 90,
      flashMs: 140,
      flashAlpha: 0.6,
      shakePx: 7,
      shakeMs: 250,
      rippleRadius: 230,
      rippleMs: 650,
      rippleWidth: 5,
      rippleColor: '#f5cf72',
      warpMs: 600,
      particles: 70,
      popSize: 46,
      popColor: '#f5cf72',
      rollMs: 1200,
      rollDelay: 150,
      haptic: 35,
    },
    good: {
      hitStop: 50,
      flashMs: 90,
      flashAlpha: 0.4,
      shakePx: 3,
      shakeMs: 150,
      rippleRadius: 150,
      rippleMs: 500,
      rippleWidth: 3.5,
      rippleColor: '#9ef0ff',
      warpMs: 350,
      particles: 35,
      popSize: 34,
      popColor: '#dff9ff',
      rollMs: 800,
      rollDelay: 90,
      haptic: 20,
    },
    close: {
      hitStop: 0,
      flashMs: 0,
      flashAlpha: 0,
      shakePx: 0,
      shakeMs: 0,
      rippleRadius: 80,
      rippleMs: 380,
      rippleWidth: 2,
      rippleColor: '#ffffff',
      warpMs: 0,
      particles: 10,
      popSize: 24,
      popColor: '#f2f2f8',
      rollMs: 400,
      rollDelay: 40,
      haptic: 0,
    },
  } as Record<HitTier, RevealConfig>,

  overlapWindow: 450,

  labels: {
    perfect: { en: 'Raikiri', jp: '雷切' },
    good: { en: 'Clean', jp: '斬' },
    close: { en: 'Shallow', jp: '浅' },
    slipped: { en: 'Struck', jp: '撃' },
    cursed: { en: 'Cursed', jp: '呪' },
  } as Record<Tier, { en: string; jp: string }>,

  feedback: {
    labelMs: 850,
    popMs: 1150,
    popY: 150,
    nearMissMs: 900,
    ghostSlashMs: 900,
    defaultSlashAngle: -0.4,
  },

  effects: {
    maxParticles: 150,
    slashTrailMs: 180,
    flashMaxAlpha: 0.6,
    reducedFlashAlpha: 0.2,
    flashMaxPerSecond: 3,
    boltFlashAlpha: 0.22,
    boltFlashMs: 110,
    eraParticles: 40,
    warpStreaks: 46,
  },

  ending: { durationMs: 1400, whiteFade: 0.5, arrivalFadeMs: 700 },

  palette: { blendMs: 900, resetMs: 600 },

  eraCardMs: 1000,

  samurai: { slashPoseMs: 320 },

  ambientLightning: { minGap: 3500, maxGap: 8500, alpha: 0.05 },

  rain: { count: 90, speed: 0.9, wind: 0.18 },

  colors: {
    gold: '#f5cf72',
    sakura: '#ffc2d4',
    white: '#ffffff',
    softWhite: '#f2f2f8',
  },

  audio: {
    master: 0.8,
    ambient: 0.14,
    ambientDuck: 0.35,
    cueStartHz: 200,
    cueEndHz: 900,
    cueVolume: 0.12,
    strikeDelay: 0.04,
    thunderVolume: 0.7,
    failVolume: 0.2,
    chimeVolume: 0.16,
    hirajoshiBase: 293.66,
    hirajoshi: [0, 2, 3, 7, 8],
    arrivalChord: [261.63, 329.63, 392.0, 523.25],
  },

  storage: {
    best: 'raikiri:best',
    muted: 'raikiri:muted',
    reduceFlashes: 'raikiri:reduceFlashes',
  },

  eras: [
    {
      id: 'edo',
      name: 'Edo',
      jp: '江戸',
      start: -Infinity,
      skyline: 'edo',
      palette: {
        skyTop: '#0b0d2a',
        skyMid: '#26214f',
        skyBottom: '#5b3b6c',
        accent: '#ffb3c8',
        accent2: '#f4e6ff',
        skyline: '#110e24',
        stars: 0.15,
      },
    },
    {
      id: 'meiji',
      name: 'Meiji',
      jp: '明治',
      start: 1868,
      skyline: 'meiji',
      palette: {
        skyTop: '#0d2628',
        skyMid: '#2c4a45',
        skyBottom: '#86663f',
        accent: '#ffc46b',
        accent2: '#ffe9bf',
        skyline: '#121d1b',
        stars: 0.05,
      },
    },
    {
      id: 'showa',
      name: 'Showa',
      jp: '昭和',
      start: 1926,
      skyline: 'meiji',
      palette: {
        skyTop: '#0f242b',
        skyMid: '#29474d',
        skyBottom: '#7a5a3d',
        accent: '#ffb85c',
        accent2: '#ffe3b0',
        skyline: '#101b1d',
        stars: 0.04,
      },
    },
    {
      id: 'heisei',
      name: 'Heisei–Reiwa',
      jp: '平成・令和',
      start: 1989,
      skyline: 'modern',
      palette: {
        skyTop: '#0a1424',
        skyMid: '#21364d',
        skyBottom: '#56718c',
        accent: '#bff6ff',
        accent2: '#ffffff',
        skyline: '#09111e',
        stars: 0,
      },
    },
    {
      id: 'future',
      name: 'Near Future',
      jp: '近未来',
      start: 2100,
      skyline: 'future',
      palette: {
        skyTop: '#110624',
        skyMid: '#38135d',
        skyBottom: '#692978',
        accent: '#ff4fd8',
        accent2: '#5ff3ff',
        skyline: '#0c0517',
        stars: 0.1,
      },
    },
    {
      id: 'neon',
      name: 'Neon Age',
      jp: 'ネオン時代',
      start: 3000,
      skyline: 'neon',
      palette: {
        skyTop: '#130930',
        skyMid: '#2d196b',
        skyBottom: '#58298c',
        accent: '#4fa8ff',
        accent2: '#ff6ad5',
        skyline: '#09051e',
        stars: 0.12,
      },
    },
    {
      id: 'deep',
      name: 'Deep Time',
      jp: '深淵の刻',
      start: 10000,
      skyline: 'deep',
      palette: {
        skyTop: '#020207',
        skyMid: '#090915',
        skyBottom: '#171328',
        accent: '#f2d28a',
        accent2: '#fff3d6',
        skyline: '#05050e',
        stars: 1,
      },
    },
    {
      id: 'beyond',
      name: 'Beyond',
      jp: '彼方',
      start: 100000,
      skyline: 'beyond',
      palette: {
        skyTop: '#000000',
        skyMid: '#06060a',
        skyBottom: '#13131b',
        accent: '#c9fff0',
        accent2: '#e6d8ff',
        skyline: '#020203',
        stars: 1,
      },
    },
  ] as EraDef[],
}
