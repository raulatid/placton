'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { Lang } from '@/lib/i18n-shared'
import { fmtNum, fmtPct } from './format'

// Cifra que sube de 0 a su valor cuando se ve. El servidor pinta la cifra
// final; si al montar ya está a la vista (o hay «reducir movimiento») se queda
// así. El ancho de la cifra final queda reservado: nada se mueve al contar.

export function CountUp({
  value,
  lang,
  format = 'num',
  digits = 0,
  duration = 900,
  delay = 0,
  as = 'span',
  className,
}: {
  value: number
  lang: Lang
  format?: 'num' | 'pct'
  digits?: number
  duration?: number
  delay?: number
  /** 'tspan' para usarla dentro de un <text> de SVG (va centrada, sin reserva). */
  as?: 'span' | 'tspan'
  className?: string
}) {
  const fmt = (n: number) => (format === 'pct' ? fmtPct(n, lang, digits) : fmtNum(n, lang, digits))
  const [cur, setCur] = useState<number | null>(null)
  const ref = useRef<Element>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Un <tspan> se mide por su <svg>.
    const target = (el instanceof SVGElement && el.ownerSVGElement) || el
    const r = target.getBoundingClientRect()
    if (r.top < window.innerHeight && r.bottom > 0) return

    setCur(0)
    let raf = 0
    let timer = 0
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return
        io.disconnect()
        timer = window.setTimeout(() => {
          const t0 = performance.now()
          const step = (now: number) => {
            const p = Math.min(1, (now - t0) / duration)
            if (p >= 1) {
              setCur(null)
              return
            }
            setCur(value * (1 - (1 - p) ** 3))
            raf = requestAnimationFrame(step)
          }
          raf = requestAnimationFrame(step)
        }, delay)
      },
      // Umbral 0: algunas cifras viven en fragmentos recortados por el borde y
      // nunca llegan a verse enteras; basta con que asomen un poco.
      { threshold: 0, rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(target)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [value, delay, duration])

  const final = fmt(value)
  const shown = cur === null ? final : fmt(cur)

  if (as === 'tspan')
    return (
      <tspan ref={ref as React.Ref<SVGTSpanElement>} className={className}>
        {shown}
      </tspan>
    )
  return (
    <span ref={ref as React.Ref<HTMLSpanElement>} className={className ? `relative inline-grid ${className}` : 'relative inline-grid'}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {final}
      </span>
      <span className="col-start-1 row-start-1">{shown}</span>
    </span>
  )
}
