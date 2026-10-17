'use client'

import { useMemo, useRef, useState } from 'react'
import { locale, type Lang } from '@/lib/i18n-shared'
import { useLang, useT } from './LangProvider'
import { BrandAvatar, stagger } from './ui'

// Evolución diaria de la visibilidad por marca. Una sola escala (0-100 %),
// líneas de 2 px, guía vertical y tooltip con todas las marcas del día.

export interface TimelineSeries {
  key: string
  name: string
  own: boolean
  color: string
  values: (number | null)[]
  /** Web de la marca, para su logo en la leyenda. */
  domain?: string
}

const W = 760
const H = 240
const PAD = { l: 36, r: 12, t: 12, b: 26 }

function fmt(day: string, lang: Lang) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function pctLabel(n: number, lang: Lang) {
  const v = Math.round(n).toLocaleString(locale(lang))
  return lang === 'es' ? `${v} %` : `${v}%`
}

export function Timeline({ days, series }: { days: string[]; series: TimelineSeries[] }) {
  const [hover, setHover] = useState<number | null>(null)
  // Con muchas marcas, las líneas se enredan: a partir de la novena empiezan
  // apagadas y se encienden desde la leyenda.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(series.slice(8).map((s) => s.key)))
  const ref = useRef<SVGSVGElement>(null)
  const lang = useLang()
  const t = useT()

  const max = useMemo(() => {
    const vals = series.filter((s) => !hidden.has(s.key)).flatMap((s) => s.values.filter((v): v is number => v !== null))
    const m = Math.max(10, ...vals)
    return m > 50 ? 100 : m > 25 ? 50 : m > 10 ? 25 : 10
  }, [series, hidden])

  const x = (i: number) => PAD.l + (days.length <= 1 ? (W - PAD.l - PAD.r) / 2 : (i / (days.length - 1)) * (W - PAD.l - PAD.r))
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)

  const paths = series.map((s) => {
    let d = ''
    let area = ''
    let run: number[] = []
    const closeRun = () => {
      if (run.length > 1) {
        const pts = run.map((i) => `${x(i).toFixed(1)},${y(s.values[i]!).toFixed(1)}`)
        area += `M${pts.join('L')}L${x(run[run.length - 1]).toFixed(1)},${y(0).toFixed(1)}L${x(run[0]).toFixed(1)},${y(0).toFixed(1)}Z`
      }
      run = []
    }
    s.values.forEach((v, i) => {
      if (v === null) {
        closeRun()
        return
      }
      d += `${run.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      run.push(i)
    })
    closeRun()
    return { ...s, d, area }
  })

  const hasAny = series.some((s) => s.values.some((v) => v !== null))
  const labelEvery = Math.max(1, Math.ceil(days.length / 7))

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const rel = (px - PAD.l) / (W - PAD.l - PAD.r)
    const i = Math.round(rel * (days.length - 1))
    setHover(i >= 0 && i < days.length ? i : null)
  }

  const visible = paths.filter((p) => !hidden.has(p.key))
  const tipLeft = hover !== null ? (x(hover) / W) * 100 : 0

  return (
    <div className="px-6 pb-6">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => {
          const off = hidden.has(s.key)
          return (
            <button
              key={s.key}
              type="button"
              onClick={() =>
                setHidden((h) => {
                  const n = new Set(h)
                  if (n.has(s.key)) n.delete(s.key)
                  else n.add(s.key)
                  return n
                })
              }
              className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[12px] font-semibold transition-colors hover:bg-line-2 ${off ? 'text-faint line-through' : 'text-ink-2'}`}
              aria-pressed={!off}
            >
              <span className="h-[3px] w-3.5 rounded-full" style={{ background: off ? '#cfd8d6' : s.color }} />
              <span className={off ? 'opacity-50 grayscale' : undefined}>
                <BrandAvatar name={s.name} domain={s.domain} size={18} />
              </span>
              {s.name}
            </button>
          )
        })}
      </div>
      {!hasAny ? (
        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-line text-sm text-mute">
          {t('Not enough days yet to draw the trend.', 'Aún no hay días suficientes para dibujar la evolución.')}
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-none select-none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={t('Visibility by brand over time', 'Evolución de la visibilidad por marca')}
          >
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke={f === 0 ? '#e2e9e7' : '#e8eeec'} strokeDasharray={f === 0 ? undefined : '3 4'} />
                <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#93a3a6">
                  {pctLabel(max * f, lang)}
                </text>
              </g>
            ))}
            {days.map((d, i) =>
              i % labelEvery === 0 || i === days.length - 1 ? (
                <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#93a3a6">
                  {fmt(d, lang)}
                </text>
              ) : null,
            )}
            <defs>
              <linearGradient id="tl-own-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#00a38c" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#00a38c" stopOpacity="0" />
              </linearGradient>
            </defs>
            {visible.map((p) =>
              p.own && p.area ? <path key={`${p.key}-area`} d={p.area} fill="url(#tl-own-fill)" className="anim-fade" style={stagger(5)} /> : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#93a3a6" strokeDasharray="3 3" />}
            {visible.map((p, k) => (
              <path
                key={p.key}
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth={p.own ? 2.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1200}
                className="anim-draw"
                style={stagger(k)}
              />
            ))}
            {visible.map((p) =>
              p.values.map((v, i) =>
                // Punto visible al pasar el ratón, con pocos días o si el día está aislado (sin línea que lo una).
                v !== null && (hover === i || days.length <= 2 || ((p.values[i - 1] ?? null) === null && (p.values[i + 1] ?? null) === null)) ? (
                  <circle key={`${p.key}-${i}`} cx={x(i)} cy={y(v)} r="4" fill={p.color} stroke="#fff" strokeWidth="2" />
                ) : null,
              ),
            )}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-2 z-20 w-max min-w-40 animate-[p-fade_0.15s_ease_both] motion-reduce:animate-none rounded-lg bg-deep/95 px-3 py-2 text-[12px] text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,0.5)] backdrop-blur"
              style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 60 ? 'calc(-100% - 12px)' : '12px'})` }}
            >
              <div className="mb-1 font-bold">{fmt(days[hover], lang)}</div>
              {visible
                .map((p) => ({ p, v: p.values[hover] }))
                .sort((a, b) => (b.v ?? -1) - (a.v ?? -1))
                .map(({ p, v }) => (
                  <div key={p.key} className="flex items-center justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.name}
                    </span>
                    <span className="num font-semibold">{v === null ? t('No data', 'Sin datos') : pctLabel(v, lang)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
