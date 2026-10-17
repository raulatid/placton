'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  AGENCY_CLIENT_MONTHLY,
  AGENCY_MAX,
  AGENCY_MIN,
  AGENCY_PROMPT_TIERS,
  AGENCY_PROMPTS_MAX,
  AGENCY_PROMPTS_MIN,
  AGENCY_PROMPTS_STEP,
  agencyPromptMonthly,
  agencyQuote,
  clampClients,
  clampPrompts,
  money,
  YEARLY_DISCOUNT,
  type Interval,
  TRIAL_DAYS,
} from '@/lib/plans'
import { IconCheck } from './icons'
import { useLang, useT } from './LangProvider'
import { cx } from './ui'

const PROMPT_PRESETS = [100, 250, 500, 1000, 2500]

function Stepper({ value, onChange, min, max, step, label, unit }: { value: number; onChange: (n: number) => void; min: number; max: number; step: number; label: string; unit: string }) {
  const t = useT()
  const loc = useLang() === 'es' ? 'es-ES' : 'en-US'
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(value - step)}
          disabled={value <= min}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[18px] font-semibold text-ink transition-colors hover:border-faint disabled:opacity-40"
          aria-label={t(`Less ${unit}`, `Menos ${unit}`)}
        >
          −
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[34px] font-extrabold leading-none tracking-[-0.04em] text-ink num">{value.toLocaleString(loc)}</div>
          <div className="mt-1 text-[12px] font-semibold text-mute">{unit}</div>
        </div>
        <button
          type="button"
          onClick={() => onChange(value + step)}
          disabled={value >= max}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[18px] font-semibold text-ink transition-colors hover:border-faint disabled:opacity-40"
          aria-label={t(`More ${unit}`, `Más ${unit}`)}
        >
          +
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="agency-range mt-4 w-full"
        style={{ background: `linear-gradient(to right, #00a38c ${pct}%, #dfe7e5 ${pct}%)` }}
        aria-label={label}
      />
    </div>
  )
}

/**
 * Plan Agencia: eliges cuántas marcas cliente sigues y cuántos prompts quieres
 * medir al día en total (una bolsa que repartes entre tus clientes). El precio
 * se recalcula al momento. En la web lleva al registro; en el panel contrata.
 */
export function AgencyCalculator({
  mode,
  interval: controlled,
  action,
  current,
  usedClients = 0,
  usedPrompts = 0,
  canBuy = true,
}: {
  mode: 'marketing' | 'dashboard'
  interval?: Interval
  action?: (fd: FormData) => void
  /** Panel: lo contratado ahora, si ya tiene plan Agencia. */
  current?: { clients: number; prompts: number } | null
  usedClients?: number
  usedPrompts?: number
  canBuy?: boolean
}) {
  const t = useT()
  const lang = useLang()
  const loc = lang === 'es' ? 'es-ES' : 'en-US'
  const [own, setOwn] = useState<Interval>('month')
  const interval = controlled ?? own
  const minClients = Math.max(AGENCY_MIN, usedClients)
  const minPrompts = Math.max(AGENCY_PROMPTS_MIN, Math.ceil(usedPrompts / AGENCY_PROMPTS_STEP) * AGENCY_PROMPTS_STEP)
  const [clients, setClientsRaw] = useState(Math.max(current?.clients ?? 10, minClients))
  const [prompts, setPromptsRaw] = useState(Math.max(current?.prompts ?? 250, minPrompts))
  const setClients = (n: number) => setClientsRaw(Math.max(minClients, clampClients(n)))
  const setPrompts = (n: number) => setPromptsRaw(Math.max(minPrompts, clampPrompts(n)))

  const q = agencyQuote(clients, prompts, interval)
  const perPromptMonth = agencyPromptMonthly(prompts)
  const nextTier = AGENCY_PROMPT_TIERS.find((tier) => tier.upTo !== null && prompts <= tier.upTo)
  const nextFrom = nextTier ? nextTier.upTo! + 1 : null
  const isCurrent = current != null && current.clients === clients && current.prompts === prompts
  const avg = Math.floor(prompts / clients)
  const monthlyView = (n: number) => (interval === 'year' ? Math.round((n / 12) * 100) / 100 : n)

  const features = [
    t('A separate workspace, competitors and reports for every client', 'Un espacio, competidores e informes para cada cliente'),
    t('Share your prompt pool across clients as you like', 'Reparte la bolsa de prompts entre clientes como quieras'),
    t('Unlimited team members on every client', 'Miembros ilimitados en todos los clientes'),
    t('ChatGPT, Claude, Google AI, Perplexity and Grok', 'ChatGPT, Claude, Google AI, Perplexity y Grok'),
    t('One subscription and one invoice', 'Una sola suscripción y una sola factura'),
  ]

  return (
    <div className="overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_1px_2px_rgba(11,29,33,0.04),0_24px_60px_-34px_rgba(11,29,33,0.35)]">
      <div className="grid lg:grid-cols-[0.9fr_1.3fr]">
        <div className="relative overflow-hidden p-6 sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full opacity-60 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(110,240,210,0.55), transparent 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <h3 className="text-[22px] font-extrabold tracking-[-0.03em]">{t('Agency', 'Agencia')}</h3>
              <span className="rounded-full bg-deep px-2.5 py-0.5 text-[11.5px] font-bold text-glow">{t('Multi-brand', 'Varias marcas')}</span>
            </div>
            <p className="mt-1 text-[14px] text-mute">
              {t('Pick how many client brands you track and how many prompts you want measured every week.', 'Elige cuántas marcas cliente sigues y cuántos prompts quieres medir cada semana.')}
            </p>
            <ul className="mt-6 space-y-2.5">
              {features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[14px] text-ink-2">
                  <IconCheck size={17} className="mt-0.5 shrink-0 text-brand-2" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-2xl border border-line bg-[#f7faf9] p-4 text-[12.5px] text-mute">
              <div className="mb-1.5 font-bold text-ink-2">{t('Price per prompt, by tier', 'Precio por prompt, por tramos')}</div>
              {AGENCY_PROMPT_TIERS.map((tier, i) => {
                const from = i === 0 ? AGENCY_PROMPTS_MIN : (AGENCY_PROMPT_TIERS[i - 1].upTo ?? 0) + 1
                return (
                  <div key={i} className={cx('flex justify-between py-0.5 num', prompts >= from && 'font-semibold text-ink-2', tier.monthly === perPromptMonth && 'font-bold text-brand')}>
                    <span>{tier.upTo ? `${from.toLocaleString(loc)}–${tier.upTo.toLocaleString(loc)}` : t(`${from.toLocaleString(loc)} or more`, `${from.toLocaleString(loc)} o más`)}</span>
                    <span>
                      {money(tier.monthly, lang)} {t('/ prompt / month', '/ prompt / mes')}
                    </span>
                  </div>
                )
              })}
              <div className="mt-1 text-[11.5px] text-faint">{t('Each tier is billed at its own price.', 'Cada tramo se cobra a su precio.')}</div>
              <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 num">
                <span>{t('Each client brand', 'Cada marca cliente')}</span>
                <span>
                  {money(AGENCY_CLIENT_MONTHLY, lang)} {t('/ month', '/ mes')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-line-2 bg-[#f7faf9] p-6 sm:p-8 lg:border-l lg:border-t-0">
          {controlled === undefined && (
            <div className="mb-5 flex justify-end">
              <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-[12.5px] font-semibold">
                {(['month', 'year'] as const).map((i) => (
                  <button key={i} type="button" onClick={() => setOwn(i)} className={cx('rounded-full px-3 py-1', interval === i ? 'bg-deep text-white' : 'text-ink-2 hover:text-ink')}>
                    {i === 'month' ? t('Monthly', 'Mensual') : t(`Yearly · save ${Math.round(YEARLY_DISCOUNT * 100)}%`, `Anual · ahorra ${Math.round(YEARLY_DISCOUNT * 100)} %`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="mb-3 text-[13px] font-bold text-ink">{t('Client brands', 'Marcas cliente')}</div>
              <Stepper value={clients} onChange={setClients} min={AGENCY_MIN} max={AGENCY_MAX} step={1} label={t('Client brands', 'Marcas cliente')} unit={t('clients', 'clientes')} />
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="mb-3 text-[13px] font-bold text-ink">{t('Prompts tracked weekly', 'Prompts medidos por semana')}</div>
              <Stepper
                value={prompts}
                onChange={setPrompts}
                min={AGENCY_PROMPTS_MIN}
                max={AGENCY_PROMPTS_MAX}
                step={AGENCY_PROMPTS_STEP}
                label={t('Prompts tracked weekly', 'Prompts medidos por semana')}
                unit={t('prompts in total', 'prompts en total')}
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {PROMPT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompts(p)}
                    disabled={p < minPrompts}
                    className={cx(
                      'rounded-full border px-2.5 py-1 text-[12px] font-semibold num transition-colors disabled:opacity-40',
                      prompts === p ? 'border-deep bg-deep text-white' : 'border-line bg-white text-ink-2 hover:border-faint',
                    )}
                  >
                    {p.toLocaleString(loc)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[12.5px] text-mute">
            {t(`About ${avg} prompts per client on average.`, `Unos ${avg} prompts por cliente de media.`)}
          </p>

          <div className="mt-5 rounded-2xl border border-line bg-white p-5">
            <div className="space-y-1.5 text-[13.5px] text-ink-2">
              <div className="flex justify-between num">
                <span>
                  {clients} {t('clients', 'clientes')} × {money(monthlyView(q.clientUnit), lang)}
                </span>
                <span className="font-semibold text-ink">{money(monthlyView(q.clientsTotal), lang)}</span>
              </div>
              <div className="flex justify-between num">
                <span>
                  {prompts.toLocaleString(loc)} {t('prompts', 'prompts')}{' '}
                  <span className="text-faint">({t(`avg. ${money(monthlyView(q.promptUnit), lang)}`, `media ${money(monthlyView(q.promptUnit), lang)}`)})</span>
                </span>
                <span className="font-semibold text-ink">{money(monthlyView(q.promptsTotal), lang)}</span>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between border-t border-line-2 pt-3">
              <span className="text-[13px] font-bold text-mute">{t('Total', 'Total')}</span>
              <span className="text-right">
                <span className="text-[32px] font-extrabold leading-none tracking-[-0.035em] num">{money(q.perMonth, lang)}</span>
                <span className="ml-1 text-[13px] font-semibold text-mute">{t('/ month (USD)', '/ mes (USD)')}</span>
                {interval === 'year' && <span className="block text-[12px] text-mute num">{t(`${money(q.total, lang)} billed yearly`, `${money(q.total, lang)} al año`)}</span>}
              </span>
            </div>
          </div>
          <p className="mt-2 h-5 text-[12.5px] text-mute">
            {nextFrom
              ? t(
                  `Prompts from number ${nextFrom.toLocaleString(loc)} on cost ${money(agencyPromptMonthly(nextFrom), lang)} a month each.`,
                  `Los prompts a partir del ${nextFrom.toLocaleString(loc)} cuestan ${money(agencyPromptMonthly(nextFrom), lang)} al mes cada uno.`,
                )
              : t('Best price per prompt.', 'El mejor precio por prompt.')}
          </p>

          {mode === 'marketing' ? (
            <Link
              href={`/signup?plan=agencia&interval=${interval}&clients=${clients}&prompts=${prompts}`}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-deep text-[15px] font-semibold text-white transition-colors hover:bg-deep-2"
            >
              {t(`Start ${TRIAL_DAYS}-day free trial`, `Empieza ${TRIAL_DAYS} días gratis`)}
            </Link>
          ) : (
            <form action={action} className="mt-4">
              <input type="hidden" name="plan" value="agencia" />
              <input type="hidden" name="interval" value={interval} />
              <input type="hidden" name="clients" value={clients} />
              <input type="hidden" name="prompts" value={prompts} />
              <button
                disabled={!canBuy || isCurrent}
                className="flex h-12 w-full items-center justify-center rounded-full bg-deep text-[15px] font-semibold text-white transition-colors hover:bg-deep-2 disabled:bg-[#9aa8aa]"
              >
                {isCurrent ? t('Your current plan', 'Tu plan actual') : current ? t('Update my Agency plan', 'Actualizar mi plan Agencia') : t('Subscribe to Agency', 'Contratar Agencia')}
              </button>
              {(usedClients > AGENCY_MIN || usedPrompts > AGENCY_PROMPTS_MIN) && (
                <p className="mt-2 text-center text-[12px] text-mute">
                  {t(`In use now: ${usedClients} clients and ${usedPrompts} active prompts.`, `En uso ahora: ${usedClients} clientes y ${usedPrompts} prompts activos.`)}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
