'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { cx } from './ui'
import { useLang } from './LangProvider'

/** Selector EN / ES. Guarda la elección en una cookie y vuelve a la misma página. */
export function LangSwitch({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const lang = useLang()
  const path = usePathname()
  const params = useSearchParams()
  const next = `${path}${params.size ? `?${params}` : ''}`
  return (
    <div
      className={cx(
        'inline-flex items-center rounded-full border p-0.5 text-[12px] font-bold',
        tone === 'dark' ? 'border-white/15 bg-white/5 text-white/60' : 'border-line bg-white text-mute',
        className,
      )}
      role="group"
      aria-label="Language / Idioma"
    >
      {(['en', 'es'] as const).map((l) => (
        <a
          key={l}
          href={`/api/lang?l=${l}&next=${encodeURIComponent(next)}`}
          className={cx(
            'rounded-full px-2 py-0.5 uppercase',
            lang === l ? (tone === 'dark' ? 'bg-white text-deep' : 'bg-deep text-white') : tone === 'dark' ? 'hover:text-white' : 'hover:text-ink',
          )}
          aria-current={lang === l ? 'true' : undefined}
          hrefLang={l}
        >
          {l}
        </a>
      ))}
    </div>
  )
}
