import type { Metadata } from 'next'
import { Card, cx, Empty, PageHeader, stagger } from '@/components/ui'
import { pageCtx } from '@/lib/guard'
import { getT, pick, type T } from '@/lib/i18n'
import { insightsOf, periodKey } from '@/lib/insights'
import type { Severity } from '@/lib/types'
import { markIdeasReadAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Insights', 'Ideas') }
}

// La gravedad se dice con una palabra en versalitas y un trazo corto de color;
// nada de cajas, iconos ni insignias de color sobre color.
const SEV: Record<Severity, { en: string; es: string; color: string }> = {
  critico: { en: 'Urgent', es: 'Urgente', color: '#c2410c' },
  aviso: { en: 'Needs attention', es: 'Atención', color: '#b45309' },
  oportunidad: { en: 'Opportunity', es: 'Oportunidad', color: '#00a38c' },
  bien: { en: 'Going well', es: 'Va bien', color: '#047857' },
}

function weekLabel(key: string, t: T): string {
  const [y, w] = key.split('-S')
  return key === periodKey() ? t('This week', 'Esta semana') : t(`Week ${Number(w)}, ${y}`, `Semana ${Number(w)} de ${y}`)
}

export default async function IdeasPage() {
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const ideas = insightsOf(ws.id)
  const unread = ideas.some((i) => !i.readAt)
  const groups = new Map<string, typeof ideas>()
  for (const i of ideas) groups.set(i.periodKey, [...(groups.get(i.periodKey) ?? []), i])

  return (
    <>
      <PageHeader
        title={t('Insights', 'Ideas')}
        hint={t(
          'Recommendations to show up more, calculated every week from your data. Each one shows the data point behind it.',
          'Recomendaciones para aparecer más, calculadas cada semana con tus datos. Cada una enseña el dato que la provoca.',
        )}
        right={
          unread ? (
            <form action={markIdeasReadAction}>
              <button className="rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold shadow-[0_1px_2px_rgba(4,25,28,0.05)] transition-colors hover:border-faint hover:text-ink">
                {t('Mark all as read', 'Marcar todo como leído')}
              </button>
            </form>
          ) : null
        }
      />
      {ideas.length === 0 ? (
        <Card i={1}>
          <Empty title={t('No insights yet', 'Aún no hay ideas')}>
            {t(
              'We calculate them as soon as a few answers have been tracked. Check back after the first full run.',
              'Las calculamos en cuanto hay unas cuantas respuestas medidas. Vuelve después de la primera medición completa.',
            )}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-10">
          {[...groups.entries()].map(([key, list], g) => (
            <section key={key}>
              <h2 className="anim-fade mb-3 flex items-baseline justify-between gap-4 px-1" style={stagger(g * 3 + 1)}>
                <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-2">{weekLabel(key, t)}</span>
                <span className="text-[12.5px] text-faint num">
                  {list.length} {list.length === 1 ? t('insight', 'idea') : t('insights', 'ideas')}
                </span>
              </h2>
              <Card i={g * 3 + 2}>
                <ol className="divide-y divide-line-2">
                  {list.map((i) => {
                    const action = pick(i.action, lang)
                    const evidence = pick(i.evidence, lang)
                    return (
                      <li key={i.id} className="grid gap-x-10 gap-y-3 px-6 py-6 sm:px-8 md:grid-cols-[150px_minmax(0,1fr)]">
                        <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-1.5 md:pt-1">
                          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-2">
                            <span aria-hidden="true" className="h-[2px] w-3.5 rounded-full" style={{ background: SEV[i.severity].color }} />
                            {SEV[i.severity][lang]}
                          </span>
                          {!i.readAt && <span className="text-[12px] font-medium text-faint">{t('Unread', 'Sin leer')}</span>}
                        </div>
                        <div className="min-w-0 max-w-[720px]">
                          <h3 className={cx('text-[17px] leading-snug tracking-[-0.01em]', i.readAt ? 'font-semibold text-ink-2' : 'font-bold text-ink')}>{pick(i.title, lang)}</h3>
                          <p className="mt-2 text-[14.5px] leading-[1.65] text-ink-2">{pick(i.body, lang)}</p>
                          {(action || evidence) && (
                            <dl className="mt-4 grid gap-x-6 gap-y-2.5 border-t border-line-2 pt-4 text-[14px] leading-relaxed sm:grid-cols-[96px_minmax(0,1fr)]">
                              {action && (
                                <>
                                  <dt className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint sm:pt-0.5">{t('What to do', 'Qué hacer')}</dt>
                                  <dd className="text-ink">{action}</dd>
                                </>
                              )}
                              {evidence && (
                                <>
                                  <dt className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint sm:pt-0.5">{t('Based on', 'Dato')}</dt>
                                  <dd className="text-mute num">{evidence}</dd>
                                </>
                              )}
                            </dl>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
