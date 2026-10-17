'use client'

import Link from 'next/link'
import { useState } from 'react'
import { euros, monthlyEquivalent, PAID_PLANS, planName, PLANS, priceFor, YEARLY_DISCOUNT, type Interval } from '@/lib/plans'
import { IconCheck } from '../icons'
import { useLang, useT } from '../LangProvider'
import { cx } from '../ui'

// Planes dentro del panel: tres tarjetas blancas iguales (nombre, precio en gris,
// raya fina, lista y botón oscuro), el selector mensual/anual arriba a la derecha
// y el plan actual debajo.

export function PlanPicker({
  action,
  portalAction,
  current,
  currentLabel,
  canBuy,
  usedPrompts,
}: {
  action: (fd: FormData) => void
  /** Abre el portal de Stripe (solo si ya hay suscripción). */
  portalAction?: () => void
  current: { plan: string; interval: Interval } | null
  currentLabel: string
  canBuy: boolean
  usedPrompts: number
}) {
  const [interval, setInterval] = useState<Interval>(current?.interval ?? 'month')
  const t = useT()
  const lang = useLang()
  const save = Math.round(YEARLY_DISCOUNT * 100)
  const yearly = interval === 'year'
  const linkClass = 'font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink'

  return (
    <section aria-label={t('Plans', 'Planes')}>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-md text-[14px] leading-relaxed text-mute">
          {t('Review the plans here. Upgrades, downgrades, cancellations and billing details are managed in Stripe ', 'Revisa aquí los planes. Las mejoras, bajadas, cancelaciones y datos de facturación se gestionan en Stripe ')}
          {portalAction ? (
            <form action={portalAction} className="inline">
              <button className={linkClass}>{t('here', 'aquí')}</button>
            </form>
          ) : (
            <Link href="/dashboard/settings/billing" className={linkClass}>
              {t('here', 'aquí')}
            </Link>
          )}
          .
        </p>

        {/* Interruptor mensual / anual */}
        <div className="flex items-center gap-3 text-[11.5px] font-bold uppercase tracking-[0.12em]">
          <span className={yearly ? 'text-faint' : 'text-ink'}>{t('Monthly', 'Mensual')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            aria-label={t('Bill yearly', 'Pagar al año')}
            onClick={() => setInterval(yearly ? 'month' : 'year')}
            className={cx('relative h-7 w-12 rounded-full transition-colors', yearly ? 'bg-deep' : 'bg-line')}
          >
            <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(4,25,28,0.25)] transition-[left] duration-200', yearly ? 'left-[22px]' : 'left-0.5')} />
          </button>
          <span className={yearly ? 'text-ink' : 'text-faint'}>
            {t('Yearly', 'Anual')} <span className="normal-case tracking-normal text-mute">(−{save} %)</span>
          </span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {PAID_PLANS.map((id) => {
          const p = PLANS[id]
          const isCurrent = current?.plan === id && current.interval === interval
          const tooSmall = usedPrompts > p.prompts
          return (
            <div key={id} className="card flex flex-col p-7 sm:p-8">
              <h3 className="text-[24px] font-extrabold tracking-[-0.02em]">{planName(id, lang)}</h3>
              <p className="mt-1 text-[20px] font-medium text-ink-2 num">
                {euros(monthlyEquivalent(id, interval), lang)}
                {t('/month', '/mes')}
              </p>
              <p className="mt-0.5 h-5 text-[12.5px] text-mute">
                {yearly ? t(`${euros(priceFor(id, 'year'), lang)} billed yearly`, `${euros(priceFor(id, 'year'), lang)} al año`) : ''}
              </p>

              <ul className="mt-4 space-y-4 border-t border-line pt-6 text-[15px] text-ink-2">
                <li className="flex items-center gap-3">
                  <IconCheck size={18} className="shrink-0 text-ink" />
                  <span>
                    {t('Monitor up to', 'Mide hasta')}{' '}
                    <span className="mx-0.5 inline-flex rounded-md bg-brand-2 px-1.5 py-px font-bold text-white num">{p.prompts}</span>{' '}
                    {t('prompts', 'prompts')}
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <IconCheck size={18} className="shrink-0 text-ink" />
                  {t('Analytics and insights', 'Analítica e ideas')}
                </li>
                <li className="flex items-center gap-3">
                  <IconCheck size={18} className="shrink-0 text-ink" />
                  <span>
                    <b className="font-bold text-ink">{t('Weekly', 'Seguimiento')}</b> {t('tracking', 'semanal')}
                  </span>
                </li>
                <li className="flex gap-3">
                  <IconCheck size={18} className="mt-0.5 shrink-0 text-ink" />
                  {t('Track visibility across ChatGPT, Claude, Google AI, Perplexity and Grok', 'Visibilidad en ChatGPT, Claude, Google AI, Perplexity y Grok')}
                </li>
                <li className="flex items-center gap-3">
                  <IconCheck size={18} className="shrink-0 text-ink" />
                  {p.members === null ? (
                    <span>
                      <b className="font-bold text-ink">{t('Unlimited', 'Miembros')}</b> {t('team members', 'ilimitados')}
                    </span>
                  ) : (
                    <span>
                      {t('Up to', 'Hasta')} <b className="font-bold text-ink">{p.members}</b> {t('team members', 'miembros del equipo')}
                    </span>
                  )}
                </li>
              </ul>

              <form action={action} className="mt-auto pt-8">
                <input type="hidden" name="plan" value={id} />
                <input type="hidden" name="interval" value={interval} />
                <button
                  className={cx(
                    'h-12 w-full rounded-full text-[15px] font-bold transition-colors disabled:cursor-not-allowed',
                    isCurrent ? 'border border-line bg-white text-mute' : 'bg-deep text-white hover:bg-deep-2 disabled:opacity-50',
                  )}
                  disabled={!canBuy || isCurrent || tooSmall}
                >
                  {isCurrent ? t('Current plan', 'Plan actual') : current ? t('Switch plan', 'Cambiar de plan') : t('Upgrade', 'Mejorar plan')}
                </button>
                {tooSmall && <p className="mt-2 text-center text-[12px] text-mute">{t(`You have ${usedPrompts} active prompts: pause some first.`, `Tienes ${usedPrompts} prompts activos: pausa algunos antes.`)}</p>}
              </form>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-[13px] text-mute">
        {t('Current plan:', 'Plan actual:')} <span className="font-semibold text-ink-2">{currentLabel}</span>
        <span className="text-faint"> · {t('Prices exclude VAT, which is added when it applies.', 'Precios sin IVA, que se añade cuando corresponde.')}</span>
      </p>
    </section>
  )
}
