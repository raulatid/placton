import { IconCheck, IconX } from '@/components/icons'
import { cx } from '@/components/ui'
import { PlatformLogo } from './PlatformLogo'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { PAID_PLANS, PLANS, TRIAL_DAYS, YEARLY_DISCOUNT, money, planName, type PlanId } from '@/lib/plans'

// Tabla comparativa de la página de precios. Lee límites y precios de lib/plans.

type Cell = string | boolean

const COLUMNS: PlanId[] = ['trial', ...PAID_PLANS]

function CellView({ value, lang }: { value: Cell; lang: Lang }) {
  const t = makeT(lang)
  if (value === true)
    return (
      <span className="inline-flex text-brand-2">
        <IconCheck size={18} />
        <span className="sr-only">{t('Included', 'Incluido')}</span>
      </span>
    )
  if (value === false)
    return (
      <span className="inline-flex text-faint">
        <IconX size={16} />
        <span className="sr-only">{t('Not included', 'No incluido')}</span>
      </span>
    )
  return <span className="font-semibold text-ink num">{value}</span>
}

export function PlanComparison({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  const all = () => COLUMNS.map(() => true)
  const paidOnly = () => COLUMNS.map((id) => id !== 'trial')
  const rows: { label: string; values: Cell[]; logos?: boolean }[] = [
    {
      label: t('Price', 'Precio'),
      values: COLUMNS.map((id) =>
        id === 'trial' ? t(`Free for ${TRIAL_DAYS} days`, `Gratis ${TRIAL_DAYS} días`) : `${money(PLANS[id].monthly, lang)}${t('/mo', '/mes')}`,
      ),
    },
    { label: t('Prompts tracked every week', 'Prompts medidos cada semana'), values: COLUMNS.map((id) => String(PLANS[id].prompts)) },
    {
      label: t('Team members', 'Miembros del equipo'),
      values: COLUMNS.map((id) => (PLANS[id].members === null ? t('Unlimited', 'Ilimitados') : String(PLANS[id].members))),
    },
    { label: t('ChatGPT, Claude, Google AI, Perplexity and Grok', 'ChatGPT, Claude, Google AI, Perplexity y Grok'), values: all(), logos: true },
    { label: t('Weekly tracking', 'Seguimiento semanal'), values: all() },
    { label: t('Direct and indirect mentions', 'Menciones directas e indirectas'), values: all() },
    { label: t('Competitor ranking', 'Ranking de competidores'), values: all() },
    { label: t('Cited URLs and domains', 'URL y dominios citados'), values: all() },
    { label: t('Personalised weekly insights', 'Ideas personalizadas cada semana'), values: all() },
    { label: t('AI-readiness site audit', 'Auditoría de preparación para IA'), values: all() },
    { label: t('Invite your team', 'Invitar a tu equipo'), values: paidOnly() },
    {
      label: t(`Yearly billing with ${Math.round(YEARLY_DISCOUNT * 100)}% off`, `Pago anual con un ${Math.round(YEARLY_DISCOUNT * 100)} % de descuento`),
      values: paidOnly(),
    },
  ]

  return (
    <div className="relative overflow-x-auto rounded-[24px] border border-line bg-white">
      <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
        <caption className="sr-only">{t('Placton plan comparison', 'Comparativa de planes de Placton')}</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-4 text-[13px] font-semibold text-mute">
              {t("What's included", 'Qué incluye')}
            </th>
            {COLUMNS.map((id) => (
              <th
                key={id}
                scope="col"
                className={cx('px-4 py-4 text-center text-[15px] font-extrabold tracking-[-0.01em] text-ink', PLANS[id].highlight && 'bg-soft/60')}
              >
                {planName(id, lang)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-line-2 last:border-b-0">
              <th scope="row" className="px-5 py-3.5 font-medium text-ink-2">
                {row.label}
                {row.logos && (
                  <span className="mt-2 flex -space-x-1">
                    {['chatgpt', 'claude', 'google', 'perplexity', 'grok'].map((id) => (
                      <PlatformLogo key={id} id={id} size={22} decorative className="ring-2 ring-white" />
                    ))}
                  </span>
                )}
              </th>
              {row.values.map((v, i) => (
                <td key={COLUMNS[i]} className={cx('px-4 py-3.5 text-center', PLANS[COLUMNS[i]].highlight && 'bg-soft/60')}>
                  <CellView value={v} lang={lang} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
