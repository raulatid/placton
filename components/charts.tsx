import type { Lang } from '@/lib/i18n-shared'
import { BrandAvatar, cx, stagger } from './ui'

// Gráficas del panel. Color por función: la paleta categórica validada sigue a
// la marca (la propia siempre en el primer color); texto siempre en tinta.
// Todas entran con una animación corta que termina en el estado final.

export { ScoreRing } from './panel/ScoreRing'

export interface MentionBarDatum {
  key: string
  name: string
  own: boolean
  direct: number
  indirect: number
  /** Web de la marca, para enseñar su logo bajo la columna. */
  domain?: string
}

const DIRECT = '#00a38c'
const INDIRECT = '#eb6834'

function niceMax(n: number): number {
  if (n <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(n))
  const steps = [1, 2, 2.5, 5, 10]
  for (const s of steps) if (s * pow >= n) return s * pow
  return 10 * pow
}

/**
 * Columnas apiladas por marca, como un gráfico de producto: carril muy tenue a
 * toda altura, barras rectas apoyadas en la línea base y solo la de arriba con
 * las esquinas suaves. Directas abajo e indirectas encima, en dos bloques.
 */
export function MentionBars({ data, lang = 'en' }: { data: MentionBarDatum[]; lang?: Lang }) {
  const es = lang === 'es'
  const max = niceMax(Math.max(1, ...data.map((d) => d.direct + d.indirect)))
  const ticks = [max, max / 2, 0]
  const fmt = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(1))).toLocaleString(es ? 'es-ES' : 'en-US')
  // Un mínimo visible para que un 1 no desaparezca.
  const h = (n: number) => (n > 0 ? `max(${(n / max) * 100}%, 3px)` : '0px')
  return (
    <div className="px-6 pb-5">
      <div className="mb-4 flex items-center gap-5 text-[12.5px] font-medium text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DIRECT }} /> {es ? 'Menciones directas' : 'Direct mentions'}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: INDIRECT }} /> {es ? 'Menciones indirectas' : 'Indirect mentions'}
        </span>
      </div>
      <div className="flex">
        {/* Título del eje vertical, girado */}
        <div className="relative w-4 shrink-0">
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[10.5px] font-medium text-faint">
            {es ? 'Menciones totales' : 'Total mentions'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative flex h-48 gap-3 border-b border-line pl-9 sm:gap-5">
            {/* Escala: tres marcas, sin rejilla que ensucie */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 border-r border-line">
              {ticks.map((t, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint num" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
                  {fmt(t)}
                </span>
              ))}
            </div>
            {data.map((d, i) => {
              const total = d.direct + d.indirect
              return (
                <div key={d.key} className="group relative flex h-full min-w-0 flex-1 justify-center">
                  <div className="relative flex h-full w-full max-w-[64px] flex-col justify-end rounded-t-[6px] bg-[#f6f7f5] transition-colors duration-200 group-hover:bg-[#eff1ee]">
                    <div className="anim-grow-y flex w-full flex-col overflow-hidden rounded-t-[6px]" style={stagger(i, { height: h(total) })}>
                      {d.indirect > 0 && <div style={{ flex: d.indirect, background: INDIRECT }} />}
                      {d.direct > 0 && <div style={{ flex: d.direct, background: DIRECT }} />}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 hidden w-max -translate-x-1/2 animate-[p-rise_0.15s_ease-out_both] rounded-lg bg-deep px-3 py-2 text-[12px] text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,0.5)] group-hover:block motion-reduce:animate-none">
                    <div className="font-bold">{d.name}</div>
                    <div className="mt-1 flex items-center gap-1.5 num">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: DIRECT }} />
                      {es ? 'Directas' : 'Direct'}: {d.direct}
                    </div>
                    <div className="flex items-center gap-1.5 num">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: INDIRECT }} />
                      {es ? 'Indirectas' : 'Indirect'}: {d.indirect}
                    </div>
                    <div className="mt-1 border-t border-white/15 pt-1 font-semibold num">Total: {total}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2.5 flex gap-3 pl-9 sm:gap-5">
            {data.map((d) => (
              <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <BrandAvatar name={d.name} domain={d.domain || undefined} size={20} />
                {/* En móvil solo el logo (el nombre sale al tocar la barra); los nombres cortados no se leen */}
                <span className={cx('hidden w-full truncate text-[11.5px] sm:block', d.own ? 'font-bold text-ink' : 'text-mute')} title={d.name}>
                  {d.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

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
