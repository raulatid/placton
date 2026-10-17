'use client'

import { useRef, useState } from 'react'
import { cx } from '../ui'
import { fmtValue, type Fmt } from './format'

// Gráfica de columnas del panel de administración: series apiladas (también por
// debajo de cero, para altas y bajas) o agrupadas, con una línea opcional en su
// propia escala a la derecha. Al pasar el ratón, todas las cifras de esa columna.

export interface BarSeries {
  name: string
  color: string
  values: number[]
}

export function Columns({
  labels,
  bars,
  line,
  format = 'int',
  lineFormat,
  mode = 'stack',
  height = 200,
  empty = 'Sin datos en este periodo.',
}: {
  labels: string[]
  bars: BarSeries[]
  /** axis 'left': misma escala que las columnas (mismo tipo de cifra, puede ser negativa). */
  line?: { name: string; color: string; values: (number | null)[]; axis?: 'left' | 'right' }
  format?: Fmt
  lineFormat?: Fmt
  mode?: 'stack' | 'group'
  height?: number
  empty?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const n = labels.length
  const pos = labels.map((_, i) => (mode === 'stack' ? bars.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0) : Math.max(0, ...bars.map((s) => s.values[i] ?? 0))))
  const neg = labels.map((_, i) => (mode === 'stack' ? bars.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0) : Math.min(0, ...bars.map((s) => s.values[i] ?? 0))))
  const sharedVals = line?.axis === 'left' ? line.values.filter((v): v is number => v !== null) : []
  const top = nice(Math.max(0, ...pos, ...sharedVals))
  const bottom = -nice(-Math.min(0, ...neg, ...sharedVals))
  const span = top - bottom || 1
  const zero = (top / span) * 100 // % desde arriba
  const lineVals = line?.values.filter((v): v is number => v !== null) ?? []
  const shared = line?.axis === 'left'
  const lineTop = nice(Math.max(0, ...lineVals))
  const lineY = (v: number) => (shared ? ((top - v) / span) * 100 : 100 - (v / lineTop) * 100 * (zero / 100))
  const hasData = pos.some((v) => v > 0) || neg.some((v) => v < 0) || lineVals.some((v) => v > 0)
  // Etiquetas del eje x: como mucho ~8, repartidas.
  const every = Math.max(1, Math.ceil(n / 8))

  if (!hasData) return <div className="flex items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-mute" style={{ height }}>{empty}</div>

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-ink-2">
        {bars.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        {line && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[2px] w-3.5 rounded-full" style={{ background: line.color }} />
            {line.name}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {/* Escala izquierda */}
        <div className="relative w-12 shrink-0 text-right text-[10.5px] text-faint num" style={{ height }}>
          <span className="absolute right-0 top-0 -translate-y-1/2">{fmtValue(top, format, true)}</span>
          {bottom < 0 && <span className="absolute right-0 -translate-y-1/2" style={{ top: `${zero}%` }}>0</span>}
          <span className="absolute bottom-0 right-0 translate-y-1/2">{bottom < 0 ? fmtValue(bottom, format, true) : 0}</span>
        </div>
        <div ref={box} className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          {/* Rejilla mínima: arriba, cero y abajo */}
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line-2" />
          <div className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: `${zero}%` }} />
          <div className="absolute inset-0 flex items-stretch gap-[2px] sm:gap-[3px]">
            {labels.map((_, i) => (
              <div
                key={i}
                className="relative flex-1"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(hover === i ? null : i)}
              >
                <div className={cx('absolute inset-0 rounded-[4px] transition-colors', hover === i && 'bg-line-2/70')} />
                {mode === 'stack' ? (
                  <>
                    <div className="absolute inset-x-[12%] flex flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ bottom: `${100 - zero}%`, height: `${(pos[i] / span) * 100}%` }}>
                      {bars.map((s) => (s.values[i] ?? 0) > 0 && <div key={s.name} style={{ flex: s.values[i], background: s.color }} />)}
                    </div>
                    {neg[i] < 0 && (
                      <div className="absolute inset-x-[12%] flex flex-col overflow-hidden rounded-b-[3px]" style={{ top: `${zero}%`, height: `${(-neg[i] / span) * 100}%` }}>
                        {bars.map((s) => (s.values[i] ?? 0) < 0 && <div key={s.name} style={{ flex: -s.values[i], background: s.color }} />)}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-x-[10%] flex items-end gap-[2px]" style={{ bottom: `${100 - zero}%`, height: `${zero}%` }}>
                    {bars.map((s) => (
                      <div key={s.name} className="flex-1 rounded-t-[3px]" style={{ height: `${(Math.max(0, s.values[i] ?? 0) / (top || 1)) * 100}%`, background: s.color, minHeight: (s.values[i] ?? 0) > 0 ? 2 : 0 }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {line && (shared ? lineVals.length > 0 : lineTop > 0) && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
              <path
                d={line.values
                  .map((v, i) => (v === null ? null : `${i === 0 || line.values[i - 1] === null ? 'M' : 'L'}${i + 0.5},${lineY(v)}`))
                  .filter(Boolean)
                  .join('')}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          )}
          {line && n <= 40 &&
            line.values.map((v, i) =>
              v === null || (!shared && lineTop <= 0) ? null : (
                <span
                  key={i}
                  aria-hidden="true"
                  className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                  style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${lineY(v)}%`, background: line.color }}
                />
              ),
            )}
          {hover !== null && (
            <div
              className="pointer-events-none absolute z-20 w-max min-w-[150px] -translate-x-1/2 -translate-y-full rounded-lg bg-deep px-3 py-2 text-[12px] text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,0.5)]"
              style={{ left: `clamp(80px, ${((hover + 0.5) / n) * 100}%, calc(100% - 80px))`, top: -6 }}
            >
              <div className="mb-1 font-bold">{labels[hover]}</div>
              {bars.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-4 num">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-semibold">{fmtValue(s.values[hover] ?? 0, format)}</span>
                </div>
              ))}
              {line && (
                <div className="mt-1 flex items-center justify-between gap-4 border-t border-white/15 pt-1 num">
                  <span>{line.name}</span>
                  <span className="font-semibold">{line.values[hover] === null ? 'Sin dato' : fmtValue(line.values[hover] as number, lineFormat ?? format)}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {line && !shared && (
          <div className="relative w-10 shrink-0 text-[10.5px] text-faint num" style={{ height }}>
            <span className="absolute left-0 top-0 -translate-y-1/2">{fmtValue(lineTop, lineFormat ?? format, true)}</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <div className="w-12 shrink-0" />
        <div className="relative h-4 min-w-0 flex-1 text-[10.5px] text-faint">
          {labels.map((l, i) =>
            i % every === 0 ? (
              <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 0.5) / n) * 100}%` }}>
                {l}
              </span>
            ) : null,
          )}
        </div>
        {line && !shared && <div className="w-10 shrink-0" />}
      </div>
    </div>
  )
}

function nice(n: number): number {
  if (n <= 0) return 0
  const pow = 10 ** Math.floor(Math.log10(n))
  for (const s of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * pow >= n) return s * pow
  return 10 * pow
}
