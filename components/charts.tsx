import { cx, stagger } from './ui'

// Gráficas del panel. Color por función: la paleta categórica validada sigue a
// la marca (la propia siempre en el primer color); texto siempre en tinta.
// Todas entran con una animación corta que termina en el estado final.

export { ScoreRing } from './panel/ScoreRing'
export { MentionBars, type MentionBarDatum } from './MentionBars'

const DIRECT = '#00a38c'

/** Barra de reparto horizontal (p. ej. cuota de menciones). */
export function ShareBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div className="anim-grow-x flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-line-2">
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
    </div>
  )
}

/**
 * Minigráfica de tendencia para las fichas de cifras. Une los días con dato,
 * se dibuja al cargar y marca el último punto. `id` debe ser único en la página.
 */
export function Sparkline({ values, id, color = DIRECT, className }: { values: (number | null)[]; id: string; color?: string; className?: string }) {
  const W = 200
  const H = 40
  const pad = 4
  const pts = values.map((v, i) => (v === null ? null : { i, v })).filter((p): p is { i: number; v: number } => p !== null)
  if (pts.length < 2) return null
  const lo = Math.min(...pts.map((p) => p.v))
  const hi = Math.max(...pts.map((p) => p.v))
  const span = hi - lo || 1
  const x = (i: number) => (values.length <= 1 ? W / 2 : (i / (values.length - 1)) * W)
  const y = (v: number) => (hi === lo ? H / 2 : pad + (1 - (v - lo) / span) * (H - pad * 2))
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  const area = `${line}L${x(pts[pts.length - 1].i).toFixed(1)},${H}L${x(pts[0].i).toFixed(1)},${H}Z`
  const last = pts[pts.length - 1]
  return (
    <div className={cx('relative', className)} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible">
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${id})`} className="anim-fade" style={stagger(4)} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pathLength={1200} className="anim-draw" />
      </svg>
      <span
        className="anim-fade absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={stagger(10, { left: `${(x(last.i) / W) * 100}%`, top: `${(y(last.v) / H) * 100}%`, background: color, boxShadow: `0 0 0 3px ${color}22` })}
      />
    </div>
  )
}
