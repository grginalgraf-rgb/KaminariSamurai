function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage unavailable; the game keeps running without persistence
  }
}

export function readNumber(key: string, fallback: number): number {
  const raw = read(key)
  if (raw === null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function writeNumber(key: string, value: number) {
  write(key, String(value))
}

export function readBool(key: string): boolean | null {
  const raw = read(key)
  if (raw === null) return null
  return raw === '1'
}

export function writeBool(key: string, value: boolean) {
  write(key, value ? '1' : '0')
}
