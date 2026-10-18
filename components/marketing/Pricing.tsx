'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgencyCalculator } from '@/components/AgencyCalculator'
import { IconArrow, IconCheck } from '@/components/icons'
import { useLang, useT } from '@/components/LangProvider'
import { cx } from '@/components/ui'
import { pick } from '@/lib/i18n-shared'
import { PlatformLogo } from './PlatformLogo'
import { Reveal } from './Reveal'
import {
  PAID_PLANS,
  PLANS,
  PLAN_FEATURES,
  TRIAL_DAYS,
  YEARLY_DISCOUNT,
  money,
  monthlyEquivalent,
  planName,
  priceFor,
  type Interval,
  type PaidPlanId,
} from '@/lib/plans'

const DISCOUNT = Math.round(YEARLY_DISCOUNT * 100)
const PLATFORM_IDS = ['chatgpt', 'claude', 'google', 'perplexity', 'grok']

const STRIP = 'linear-gradient(90deg, #9fe7da, #00a38c 22.5%, #2a78d6 50%, #00a38c 77.5%, #9fe7da)'

/** `changed`: el periodo ya se ha cambiado alguna vez (el precio entra con movimiento solo entonces). */
function PlanCard({ id, period, changed }: { id: PaidPlanId; period: Interval; changed: boolean }) {
  const t = useT()
  const lang = useLang()
  const plan = PLANS[id]
  const saving = plan.monthly * 12 - plan.yearly
  // Como t(), pero para textos con partes en negrita.
  const tx = (en: React.ReactNode, es: React.ReactNode) => (lang === 'es' ? es : en)
  const features: React.ReactNode[] = [
    tx(
      <>
        Up to <b className="font-bold text-ink">{plan.prompts}</b> prompts tracked
      </>,
      <>
        Hasta <b className="font-bold text-ink">{plan.prompts}</b> prompts seguidos
      </>,
    ),
    t('Dashboards and weekly insights', 'Paneles e ideas cada semana'),
    tx(
      <>
        Fresh answers <b className="font-bold text-ink">every week</b>
      </>,
      <>
        Respuestas nuevas <b className="font-bold text-ink">cada semana</b>
      </>,
    ),
    <span key="ai" className="block">
      {t('ChatGPT, Claude, Google AI, Perplexity and Grok', 'ChatGPT, Claude, Google AI, Perplexity y Grok')}
      <span className="mt-2 flex -space-x-1">
        {PLATFORM_IDS.map((pid) => (
          <PlatformLogo key={pid} id={pid} size={22} decorative className="ring-2 ring-white" />
        ))}
      </span>
    </span>,
    plan.members === null
      ? tx(
          <>
            <b className="font-bold text-ink">Unlimited</b> team members
          </>,
          <>
            Miembros <b className="font-bold text-ink">ilimitados</b>
          </>,
        )
      : tx(
          <>
            Up to <b className="font-bold text-ink">{plan.members}</b> team members
          </>,
          <>
            Hasta <b className="font-bold text-ink">{plan.members}</b> miembros
          </>,
        ),
    pick(PLAN_FEATURES[3], lang),
  ]

  return (
    <div className="lift relative flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-white p-6 shadow-[0_1px_2px_rgba(4,25,28,0.04)]">
      {/* El plan recomendado se marca con una franja fina arriba, sin más adornos;
          su degradado va y viene despacio (doble de ancho, en espejo). */}
      {plan.highlight && (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 overflow-hidden">
          <span className="plan-strip absolute inset-y-0 left-0 w-[200%]" style={{ background: STRIP }} />
        </span>
      )}
      <h3 className="flex items-center gap-2 text-[20px] font-bold tracking-[-0.02em] text-ink">
        {planName(id, lang)}
        {plan.highlight && <span className="sr-only">{t('(recommended)', '(recomendado)')}</span>}
      </h3>
      <p className="mt-1 text-[14px] text-mute">{t(`Monitor ${plan.prompts} prompts weekly`, `Sigue ${plan.prompts} prompts cada semana`)}</p>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
        <span key={period} className={cx('num text-[38px] font-bold leading-none tracking-[-0.04em] text-ink', changed && 'anim-swap')}>
          {money(monthlyEquivalent(id, period), lang)}
        </span>
        <span className="text-[13px] text-mute">{t('/ month (USD)', '/ mes (USD)')}</span>
      </p>
      <p className="mt-2 min-h-[18px] text-[12.5px] text-mute">
        {period === 'year' ? (
          <span key={period} className={changed ? 'anim-fade' : undefined} style={{ '--i': 0 } as React.CSSProperties}>
            {t(`${money(priceFor(id, 'year'), lang)} billed yearly`, `${money(priceFor(id, 'year'), lang)} al año`)} ·{' '}
            <span className="font-semibold text-good">{t(`save ${money(saving, lang)}`, `ahorras ${money(saving, lang)}`)}</span>
          </span>
        ) : null}
      </p>

      <Link
        href={`/signup?plan=${id}&interval=${period}`}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-deep text-[14px] font-bold text-white transition-colors hover:bg-deep-2"
      >
        {t(`Start ${TRIAL_DAYS}-day free trial`, `Empieza ${TRIAL_DAYS} días gratis`)}
      </Link>

      <ul className="mt-6 divide-y divide-line border-t border-line text-[13.5px] text-ink-2">
        {features.map((f, i) => (
          <li key={i} className="flex gap-2.5 py-3">
            <IconCheck size={16} className="mt-0.5 shrink-0 text-ink" />
            <span className="min-w-0">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Sección de precios completa (cabecera, selector mensual/anual y planes). */
export function Pricing({ as: Heading = 'h2' }: { as?: 'h1' | 'h2' }) {
  const t = useT()
  const [period, setPeriod] = useState<Interval>('month')
  const [changed, setChanged] = useState(false)
  const yearlyLabel = t(`Yearly (save ${DISCOUNT}%)`, `Anual (ahorra ${DISCOUNT}\u00a0%)`)

  // Indicador que se desliza bajo el periodo elegido. Hasta medirlo, el botón
  // activo lleva su propio fondo (sin parpadeo); se vuelve a medir si cambia
  // el ancho (fuentes, idioma).
  const groupRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Partial<Record<Interval, HTMLButtonElement | null>>>({})
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)
  const [indReady, setIndReady] = useState(false)
  useLayoutEffect(() => {
    const measure = () => {
      const b = btnRefs.current[period]
      if (b) setInd((prev) => (prev && prev.x === b.offsetLeft && prev.w === b.offsetWidth ? prev : { x: b.offsetLeft, w: b.offsetWidth }))
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (ro && groupRef.current) ro.observe(groupRef.current)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro?.disconnect()
  }, [period])
  // La primera colocación va sin transición; a partir de ahí se desliza.
  useEffect(() => {
    if (!ind || indReady) return
    const r = requestAnimationFrame(() => setIndReady(true))
    return () => cancelAnimationFrame(r)
  }, [ind, indReady])

  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <Heading
          id="pricing-title"
          className={cx(
            'text-balance font-extrabold leading-[1.06] tracking-[-0.04em] text-ink',
            Heading === 'h1' ? 'text-[36px] sm:text-[52px]' : 'text-[30px] sm:text-[44px]',
          )}
        >
          {t('Start free, pay when it pays off', 'Empieza gratis y paga cuando te compense')}
        </Heading>
        <p className="mt-4 text-pretty text-[16px] leading-relaxed text-mute sm:text-[17px]">
          {t(
            `Every plan starts with ${TRIAL_DAYS} days free and no card. Prices exclude VAT, which is added when it applies. Payments are handled securely by Stripe and you can cancel anytime.`,
            `Todos los planes empiezan con ${TRIAL_DAYS} días gratis y sin tarjeta. Precios sin IVA, que se añade cuando corresponde. Los pagos los gestiona Stripe de forma segura y puedes cancelar cuando quieras.`,
          )}
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <div
          ref={groupRef}
          role="group"
          aria-label={t('Billing period', 'Periodo de facturación')}
          className="relative inline-flex rounded-full border border-line bg-white p-1 shadow-[0_1px_2px_rgba(4,25,28,0.05)]"
        >
          {ind && (
            <span
              aria-hidden="true"
              className={cx('absolute inset-y-1 left-0 rounded-full bg-deep', indReady && 'transition-[transform,width] duration-300 ease-[var(--p-ease)] motion-reduce:transition-none')}
              style={{ width: ind.w, transform: `translateX(${ind.x}px)` }}
            />
          )}
          {(['month', 'year'] as const).map((p) => (
            <button
              key={p}
              ref={(el) => {
                btnRefs.current[p] = el
              }}
              type="button"
              aria-pressed={period === p}
              onClick={() => {
                setPeriod(p)
                if (p !== period) setChanged(true)
              }}
              className={cx(
                'relative z-10 h-8 rounded-full px-3.5 text-[12.5px] font-bold transition-colors duration-300 sm:px-4',
                period === p ? cx('text-white', !ind && 'bg-deep') : 'text-ink-2 hover:text-ink',
              )}
            >
              {p === 'month' ? t('Monthly', 'Mensual') : yearlyLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Cada tarjeta aparece al verse ella misma (en móvil van una debajo de
          otra); la rejilla solo para la franja del recomendado fuera de vista. */}
      <Reveal reveal={false} live className="mx-auto mt-10 grid max-w-[1000px] grid-cols-1 gap-4 md:grid-cols-3">
        {PAID_PLANS.map((id, n) => (
          // En un envoltorio: .lift (la tarjeta) también usa transform.
          <Reveal key={id} delay={n * 80}>
            <PlanCard id={id} period={period} changed={changed} />
          </Reveal>
        ))}
      </Reveal>

      {/* Plan Agencia: a todo el ancho, con el mismo periodo que las tarjetas. */}
      <div className="mx-auto mt-6 max-w-[1000px]">
        <AgencyCalculator mode="marketing" interval={period} />
      </div>

      <div className="mt-8 space-y-2 text-center text-[14px] text-mute">
        <p>{t('Prices in US dollars. Taxes may apply depending on your country.', 'Precios en dólares (USD). Pueden aplicarse impuestos según tu país.')}</p>
        <p>
          {t('More than 100 clients or a custom setup?', '¿Más de 100 clientes o algo a medida?')}{' '}
          <Link href="/contact?topic=sales" className="inline-flex items-center gap-1 font-semibold text-brand underline-offset-4 hover:underline">
            {t('Get in touch', 'Escríbenos')}
            <IconArrow size={14} />
          </Link>
        </p>
      </div>
    </div>
  )
}
