'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AgencyCalculator } from '@/components/AgencyCalculator'
import { IconArrow, IconCheck } from '@/components/icons'
import { useLang, useT } from '@/components/LangProvider'
import { cx } from '@/components/ui'
import { pick } from '@/lib/i18n-shared'
import { PlatformLogo } from './PlatformLogo'
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

function PlanCard({ id, period }: { id: PaidPlanId; period: Interval }) {
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
        Fresh answers <b className="font-bold text-ink">every day</b>
      </>,
      <>
        Respuestas nuevas <b className="font-bold text-ink">cada día</b>
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
    <div className="relative flex flex-col overflow-hidden rounded-[20px] border border-line bg-white p-6 shadow-[0_1px_2px_rgba(4,25,28,0.04)]">
      {/* El plan recomendado se marca con una franja fina arriba, sin más adornos. */}
      {plan.highlight && (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: 'linear-gradient(90deg, #9fe7da, #00a38c 45%, #2a78d6)' }} />
      )}
      <h3 className="flex items-center gap-2 text-[20px] font-bold tracking-[-0.02em] text-ink">
        {planName(id, lang)}
        {plan.highlight && <span className="sr-only">{t('(recommended)', '(recomendado)')}</span>}
      </h3>
      <p className="mt-1 text-[14px] text-mute">{t(`Monitor ${plan.prompts} prompts daily`, `Sigue ${plan.prompts} prompts cada día`)}</p>

      <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
        <span className="num text-[38px] font-bold leading-none tracking-[-0.04em] text-ink">{money(monthlyEquivalent(id, period), lang)}</span>
        <span className="text-[13px] text-mute">{t('/ month (USD)', '/ mes (USD)')}</span>
      </p>
      <p className="mt-2 min-h-[18px] text-[12.5px] text-mute">
        {period === 'year' ? (
          <>
            {t(`${money(priceFor(id, 'year'), lang)} billed yearly`, `${money(priceFor(id, 'year'), lang)} al año`)} ·{' '}
            <span className="font-semibold text-good">{t(`save ${money(saving, lang)}`, `ahorras ${money(saving, lang)}`)}</span>
          </>
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
  const yearlyLabel = t(`Yearly (save ${DISCOUNT}%)`, `Anual (ahorra ${DISCOUNT}\u00a0%)`)

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
            `Every plan starts with ${TRIAL_DAYS} days free and no card. Payments are handled securely by Stripe and you can cancel anytime.`,
            `Todos los planes empiezan con ${TRIAL_DAYS} días gratis y sin tarjeta. Los pagos los gestiona Stripe de forma segura y puedes cancelar cuando quieras.`,
          )}
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <div role="group" aria-label={t('Billing period', 'Periodo de facturación')} className="inline-flex rounded-full border border-line bg-white p-1 shadow-[0_1px_2px_rgba(4,25,28,0.05)]">
          {(['month', 'year'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={cx(
                'h-8 rounded-full px-3.5 text-[12.5px] font-bold transition-colors sm:px-4',
                period === p ? 'bg-deep text-white' : 'text-ink-2 hover:text-ink',
              )}
            >
              {p === 'month' ? t('Monthly', 'Mensual') : yearlyLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-[1000px] grid-cols-1 gap-4 md:grid-cols-3">
        {PAID_PLANS.map((id) => (
          <PlanCard key={id} id={id} period={period} />
        ))}
      </div>

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
