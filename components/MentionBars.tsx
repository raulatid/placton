'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@/lib/i18n-shared'
import { IconChevron } from './icons'
import { BrandAvatar, cx, stagger } from './ui'

export interface MentionBarDatum {
  key: string
  name: string
  own: boolean
  direct: number
  indirect: number
  /** Web de la marca, para enseñar su logo bajo la columna. */
  domain?: string
}

// Los mismos que en charts.tsx (directas en verde, indirectas en naranja).
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
 * Si no caben todas, la escala se queda quieta y las columnas se deslizan
 * (dedo, trackpad o las flechas de arriba), con los bordes difuminados.
 */
export function MentionBars({ data, lang = 'en' }: { data: MentionBarDatum[]; lang?: Lang }) {
  const es = lang === 'es'
  const max = niceMax(Math.max(1, ...data.map((d) => d.direct + d.indirect)))
  const ticks = [max, max / 2, 0]
  const fmt = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(1))).toLocaleString(es ? 'es-ES' : 'en-US')
  // Un mínimo visible para que un 1 no desaparezca.
  const h = (n: number) => (n > 0 ? `max(${(n / max) * 100}%, 3px)` : '0px')

  const wrap = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }, [])

  useEffect(() => {
    measure()
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, data.length])

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  // Un solo tooltip fuera de la zona que se desliza (si no, lo recortaría).
  const show = (i: number, col: HTMLElement) => {
    const w = wrap.current
    if (!w) return
    const a = col.getBoundingClientRect()
    const b = w.getBoundingClientRect()
    const x = Math.min(Math.max(a.left + a.width / 2 - b.left, 70), b.width - 70)
    setTip({ i, x, y: a.top - b.top })
  }

  const overflow = edges.left || edges.right
  const fade = 28
  const mask = `linear-gradient(90deg, ${edges.left ? 'transparent' : '#000'} 0, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edges.right ? 'transparent' : '#000'} 100%)`
  const d = tip ? data[tip.i] : null

  return (
    <div className="px-6 pb-5">
      <div className="mb-4 flex min-h-7 items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] font-medium text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DIRECT }} /> {es ? 'Menciones directas' : 'Direct mentions'}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: INDIRECT }} /> {es ? 'Menciones indirectas' : 'Indirect mentions'}
          </span>
        </div>
        {overflow && (
          <div className="flex shrink-0 items-center gap-1.5">
            {(
              [
                [-1, edges.left, es ? 'Marcas anteriores' : 'Previous brands', 'rotate-90'],
                [1, edges.right, es ? 'Más marcas' : 'More brands', '-rotate-90'],
              ] as const
            ).map(([dir, on, label, rot]) => (
              <button
                key={dir}
                type="button"
                onClick={() => scrollBy(dir)}
                disabled={!on}
                aria-label={label}
                className="grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-ink-2 transition-colors hover:border-faint hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-line"
              >
                <IconChevron size={15} className={rot} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={wrap} className="relative flex">
        {/* Título del eje vertical, girado */}
        <div className="relative w-4 shrink-0">
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[10.5px] font-medium text-faint">
            {es ? 'Menciones totales' : 'Total mentions'}
          </span>
        </div>
        {/* Escala: tres marcas, sin rejilla que ensucie; no se mueve al deslizar */}
        <div className="pointer-events-none relative h-48 w-8 shrink-0 border-b border-r border-line">
          {ticks.map((t, i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint num" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>

        <div
          ref={scroller}
          onScroll={() => {
            measure()
            setTip(null)
          }}
          className="no-scrollbar min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
          style={overflow ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        >
          <div className="relative flex w-max min-w-full gap-3 pl-2 sm:gap-5">
            {/* Línea base continua bajo todas las columnas, también al deslizar */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[191px] h-px bg-line" />
            {data.map((d, i) => {
              const total = d.direct + d.indirect
              return (
                <div
                  key={d.key}
                  className="group flex w-[52px] flex-[1_0_auto] flex-col items-center sm:w-[68px]"
                  onPointerEnter={(e) => e.pointerType === 'mouse' && show(i, e.currentTarget)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setTip(null)}
                  onClick={(e) => (tip?.i === i ? setTip(null) : show(i, e.currentTarget))}
                >
                  <div className="flex h-[191px] w-full justify-center">
                    <div className="relative flex h-full w-full max-w-[64px] flex-col justify-end rounded-t-[6px] bg-[#f6f7f5] transition-colors duration-200 group-hover:bg-[#eff1ee]">
                      <div className="anim-grow-y flex w-full flex-col overflow-hidden rounded-t-[6px]" style={stagger(Math.min(i, 10), { height: h(total) })}>
                        {d.indirect > 0 && <div style={{ flex: d.indirect, background: INDIRECT }} />}
                        {d.direct > 0 && <div style={{ flex: d.direct, background: DIRECT }} />}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex w-full min-w-0 flex-col items-center gap-1 text-center">
                    <BrandAvatar name={d.name} domain={d.domain || undefined} size={20} />
                    {/* En móvil solo el logo (el nombre sale al tocar la barra); los nombres cortados no se leen */}
                    <span className={cx('hidden w-full truncate text-[11.5px] sm:block', d.own ? 'font-bold text-ink' : 'text-mute')} title={d.name}>
                      {d.name}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {tip && d && (
          <div
            className="pointer-events-none absolute z-20 w-max -translate-x-1/2 -translate-y-full animate-[p-rise_0.15s_ease-out_both] rounded-lg bg-deep px-3 py-2 text-[12px] text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,0.5)] motion-reduce:animate-none"
            style={{ left: tip.x, top: tip.y - 6 }}
          >
            <div className="font-bold">{d.name}</div>
            <div className="mt-1 flex items-center gap-1.5 num">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: DIRECT }} />
              {es ? 'Directas' : 'Direct'}: {d.direct}
            </div>
            <div className="flex items-center gap-1.5 num">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: INDIRECT }} />
              {es ? 'Indirectas' : 'Indirect'}: {d.indirect}
            </div>
            <div className="mt-1 border-t border-white/15 pt-1 font-semibold num">Total: {d.direct + d.indirect}</div>
          </div>
        )}
      </div>
    </div>
  )
}
