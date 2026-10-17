// Formatos del panel de administración (en español; el dinero, en dólares como los precios).

export type Fmt = 'usd' | 'int' | 'pct'

export function usd(n: number, decimals?: number): string {
  const d = decimals ?? (Math.abs(n) >= 1000 ? 0 : Math.abs(n) < 1 && n !== 0 ? 3 : 2)
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })} $`
}

export function int(n: number): string {
  return Math.round(n).toLocaleString('es-ES')
}

export function percent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'Sin datos'
  return `${(n * 100).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`
}

/** Para ejes (compacto) y tooltips. */
export function fmtValue(n: number, f: Fmt, compact = false): string {
  if (f === 'pct') return percent(n, compact ? 0 : 1)
  if (f === 'usd') {
    if (compact && Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k$`
    return compact ? `${n.toLocaleString('es-ES', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0 })} $` : usd(n)
  }
  if (compact && Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k`
  return int(n)
}

/** Variación relativa entre dos cifras (null si no se puede calcular). */
export function change(now: number | null | undefined, prev: number | null | undefined): number | null {
  if (now === null || now === undefined || prev === null || prev === undefined || prev === 0) return null
  return ((now - prev) / Math.abs(prev)) * 100
}
