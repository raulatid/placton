'use client'

import { useT } from '../LangProvider'
import { cx } from '../ui'

/**
 * Cuántos prompts marcados lleva frente a los que incluye el plan. Hasta 20,
 * un segmento por prompt; por encima (Agencia), una sola barra.
 */
export function PlanMeter({ k, limit }: { k: number; limit: number }) {
  const t = useT()
  return (
    <div className="w-full max-w-[260px]">
      {limit <= 20 ? (
        <div className="flex gap-[3px]" aria-hidden="true">
          {Array.from({ length: limit }, (_, i) => (
            <span
              key={i}
              className={cx('anim-grow-x h-1.5 flex-1 rounded-full transition-colors duration-200', i < k ? 'bg-deep' : 'bg-line')}
              style={{ animationDelay: `${120 + i * 25}ms`, animationDuration: '250ms' }}
            />
          ))}
        </div>
      ) : (
        <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div
            className="h-full origin-left rounded-full bg-deep transition-transform duration-300"
            style={{ transform: `scaleX(${limit ? Math.min(1, k / limit) : 0})`, transitionTimingFunction: 'var(--ob-ease)' }}
          />
        </div>
      )}
      <p className="mt-2 text-[13px] font-semibold text-ink-2 num">{t(`${k} of ${limit} in your plan`, `${k} de ${limit} de tu plan`)}</p>
    </div>
  )
}
