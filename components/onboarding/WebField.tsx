'use client'

import { useT } from '../LangProvider'
import { IconArrow } from '../icons'
import { BrandAvatar } from '../ui'
import { domainOf, useSettled, vars } from './shared'

/**
 * Paso 1: la dirección de la web. Al escribir algo con forma de dominio sale
 * su inicial al momento y, tras 650 ms sin teclear, el logo real. La caja
 * comparte nombre de transición con su resumen: al seguir se convierte en
 * «Tu web · asana.com» y al volver se abre al revés.
 */
export function WebField({
  url,
  onChange,
  onSubmit,
  inputRef,
}: {
  url: string
  onChange: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const t = useT()
  const typed = domainOf(url)
  // Con ?web= precargado, el logo sale al momento (el valor inicial ya está asentado).
  const settled = useSettled(typed?.domain ?? '')
  const showPrefix = !/^https?/i.test(url.trim())

  return (
    <form onSubmit={onSubmit} className="col-span-2 mt-6 sm:col-span-1 sm:col-start-2 sm:flex sm:items-end sm:gap-3">
      <div className="min-w-0 sm:flex-1">
        <label htmlFor="web" className="mb-2 block text-[13px] font-semibold text-ink-2">
          {t('Website address', 'Dirección de tu web')}
        </label>
        <div
          className="ob-field flex h-[60px] items-center gap-2 rounded-[18px] border border-white bg-white pl-4 pr-3 shadow-[0_20px_50px_-28px_rgba(11,29,33,.45)] transition-shadow"
          style={{ viewTransitionName: 'ob-sum-1' } as React.CSSProperties}
        >
          {showPrefix && (
            <span aria-hidden="true" className="shrink-0 font-mono text-[13px] text-faint">
              https://
            </span>
          )}
          <input
            ref={inputRef}
            id="web"
            autoFocus
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('yourbrand.com', 'tumarca.com')}
            inputMode="url"
            autoCapitalize="none"
            autoComplete="url"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[17px] text-ink placeholder:text-faint"
          />
          {typed && (
            <span className="ob-pop shrink-0" style={vars({ '--pop-delay': '0s' })} aria-hidden="true">
              <BrandAvatar name={typed.name} domain={settled === typed.domain ? typed.domain : undefined} size={32} />
            </span>
          )}
        </div>
      </div>
      <button
        disabled={!url.trim()}
        className="group mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-deep px-6 text-[15px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,.6)] transition-colors hover:bg-deep-2 disabled:bg-[#7d8d90] disabled:shadow-none sm:mt-0 sm:h-[60px] sm:w-auto"
      >
        {t('Analyze my website', 'Analizar mi web')}
        <span className="transition-transform duration-200 group-hover:translate-x-0.5 group-disabled:translate-x-0">
          <IconArrow size={18} />
        </span>
      </button>
    </form>
  )
}
