'use client'

import { BrandAvatar } from '../ui'
import { vars } from './shared'

/**
 * Sonar mientras se lee la web: el logo de la marca con tres anillos que se
 * abren desfasados. Es una sola llamada al servidor: no se inventan fases.
 */
export function Sonar({ name, domain, text }: { name: string; domain?: string; text: string }) {
  return (
    <div aria-hidden="true" className="flex flex-col items-center">
      <div className="relative flex h-[150px] w-full items-center justify-center">
        {[0, 1, 2].map((i) => (
          <span key={i} className="ob-sonar absolute h-11 w-11 rounded-full border border-brand-2/50" style={vars({ '--i': i })} />
        ))}
        <span className="relative rounded-[12px] shadow-[0_10px_30px_-12px_rgba(4,25,28,.45)]">
          <BrandAvatar name={name} domain={domain} size={44} />
        </span>
      </div>
      <p className="shimmer-text -mt-2 text-[14px] font-semibold">{text}</p>
    </div>
  )
}
