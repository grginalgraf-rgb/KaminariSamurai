export function formatYear(value: number): string {
  const v = Math.floor(value)
  if (!Number.isFinite(v)) return '∞'
  if (Math.abs(v) >= 1e15) return v.toExponential(2).replace('e+', 'e')
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  return v.toLocaleString('en-US')
}

export function formatSeconds(ms: number): string {
  return `${(Math.abs(ms) / 1000).toFixed(2)} s`
}
