'use client'

import { useEffect, useState } from 'react'
import type { Lang } from '@/lib/i18n-shared'

/** Medidor circular para notas 0-100 (auditoría). El arco se rellena al montarse. */
export function ScoreRing({ score, size = 120, lang = 'en' }: { score: number; size?: number; lang?: Lang }) {
  const es = lang === 'es'
  const r = 52
  const c = 2 * Math.PI * r
  const color = score >= 75 ? '#047857' : score >= 50 ? '#b45309' : '#c2410c'
  const [shown, setShown] = useState(false)

  useEffect(() => {
    // Dos fotogramas: el arco vacío llega a pintarse antes de rellenarse.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setShown(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={es ? `Nota ${score} de 100` : `Score ${score} out of 100`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#eef3f1" strokeWidth="10" />
      <circle cx="60" cy="60" r={r + 7} fill="none" stroke={color} strokeOpacity="0.12" strokeWidth="1" strokeDasharray="1 4" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={shown ? c * (1 - Math.max(0, Math.min(100, score)) / 100) : c}
        transform="rotate(-90 60 60)"
        className="transition-[stroke-dashoffset] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      />
      <text x="60" y="58" textAnchor="middle" fontSize="30" fontWeight="800" fill="#0b1d21" className="num">
        {score}
      </text>
      <text x="60" y="78" textAnchor="middle" fontSize="11" fill="#66797d">
        {es ? 'de 100' : 'out of 100'}
      </text>
    </svg>
  )
}
