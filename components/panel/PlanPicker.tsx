'use client'

import { useState } from 'react'
import { pick } from '@/lib/i18n-shared'
import { euros, monthlyEquivalent, PAID_PLANS, PLAN_FEATURES, planName, PLANS, priceFor, YEARLY_DISCOUNT, type Interval } from '@/lib/plans'
import { IconCheck } from '../icons'
import { useLang, useT } from '../LangProvider'
import { btnClass, cx } from '../ui'

export function PlanPicker({
  action,
  current,
  canBuy,
  usedPrompts,
}: {
  action: (fd: FormData) => void
  current: { plan: string; interval: Interval } | null
  canBuy: boolean
  usedPrompts: number
}) {
  const [interval, setInterval] = useState<Interval>(current?.interval ?? 'month')
  const t = useT()
  const lang = useLang()
  const save = Math.round(YEARLY_DISCOUNT * 100)
  return (
    <>
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-xl border border-line bg-white p-1 text-[14px] font-semibold">
          {(['month', 'year'] as const).map((i) => (
            <button key={i} type="button" onClick={() => setInterval(i)} className={cx('rounded-lg px-4 py-1.5', interval === i ? 'bg-deep text-white' : 'text-ink-2 hover:bg-line-2')}>
              {i === 'month' ? t('Monthly', 'Mensual') : t(`Yearly · save ${save}%`, `Anual · ahorra ${save} %`)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PAID_PLANS.map((id) => {
          const p = PLANS[id]
          const isCurrent = current?.plan === id && current.interval === interval
          const tooSmall = usedPrompts > p.prompts
          return (
            <div key={id} className={cx('card relative flex flex-col p-6', p.highlight && 'border-brand-2 ring-2 ring-brand-2/20')}>
              {p.highlight && <span className="absolute -top-3 left-6 rounded-full bg-brand-2 px-2.5 py-0.5 text-[11.5px] font-bold text-white">{t('Most popular', 'El más elegido')}</span>}
              <h3 className="text-[18px] font-extrabold">{planName(id, lang)}</h3>
              <p className="mt-0.5 text-[13px] text-mute">{pick(p.tagline, lang)}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-[36px] font-extrabold tracking-[-0.03em] num">{euros(monthlyEquivalent(id, interval), lang)}</span>
                <span className="text-[13px] text-mute">{t('/month', '/mes')}</span>
              </div>
              <p className="h-5 text-[12.5px] text-mute">{interval === 'year' ? t(`${euros(priceFor(id, 'year'), lang)} per year`, `${euros(priceFor(id, 'year'), lang)} al año`) : t('Billed monthly', 'Facturado cada mes')}</p>
              <ul className="my-6 space-y-2 text-[14px]">
                <li className="flex gap-2 font-bold">
                  <IconCheck size={17} className="mt-0.5 shrink-0 text-brand-2" /> {t(`${p.prompts} prompts a day`, `${p.prompts} prompts al día`)}
                </li>
                <li className="flex gap-2">
                  <IconCheck size={17} className="mt-0.5 shrink-0 text-brand-2" /> {p.members === null ? t('Unlimited members', 'Miembros ilimitados') : t(`Up to ${p.members} members`, `Hasta ${p.members} miembros`)}
                </li>
                {PLAN_FEATURES.map((f) => (
                  <li key={f.en} className="flex gap-2">
                    <IconCheck size={17} className="mt-0.5 shrink-0 text-brand-2" /> {pick(f, lang)}
                  </li>
                ))}
              </ul>
              <form action={action} className="mt-auto">
                <input type="hidden" name="plan" value={id} />
                <input type="hidden" name="interval" value={interval} />
                <button className={btnClass(p.highlight ? 'primary' : 'secondary', 'lg', 'w-full')} disabled={!canBuy || isCurrent || tooSmall}>
                  {isCurrent ? t('Your current plan', 'Tu plan actual') : current ? t('Switch to this plan', 'Cambiar a este plan') : t('Subscribe', 'Contratar')}
                </button>
                {tooSmall && <p className="mt-2 text-center text-[12px] text-mute">{t(`You have ${usedPrompts} active prompts: pause some first.`, `Tienes ${usedPrompts} prompts activos: pausa algunos antes.`)}</p>}
              </form>
            </div>
          )
        })}
      </div>
    </>
  )
}
