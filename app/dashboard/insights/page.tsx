import type { Metadata } from 'next'
import { IconIdea } from '@/components/icons'
import { Badge, Card, cx, Empty, PageHeader, stagger } from '@/components/ui'
import { pageCtx } from '@/lib/guard'
import { getT, pick, type T } from '@/lib/i18n'
import { insightsOf, periodKey } from '@/lib/insights'
import type { Severity } from '@/lib/types'
import { markIdeasReadAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Insights', 'Ideas') }
}

const SEV: Record<Severity, { en: string; es: string; tone: 'bad' | 'warn' | 'brand' | 'good'; box: string }> = {
  critico: { en: 'Urgent', es: 'Urgente', tone: 'bad', box: 'border border-line bg-white text-bad' },
  aviso: { en: 'Needs attention', es: 'Atención', tone: 'warn', box: 'border border-line bg-white text-warn' },
  oportunidad: { en: 'Opportunity', es: 'Oportunidad', tone: 'brand', box: 'border border-line bg-white text-brand-2' },
  bien: { en: 'Going well', es: 'Va bien', tone: 'good', box: 'border border-line bg-white text-good' },
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
              <button className="rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold shadow-[0_1px_2px_rgba(4,25,28,0.05)] transition-colors hover:border-brand-2/40 hover:text-brand">
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
        <div className="space-y-8">
          {[...groups.entries()].map(([key, list], g) => (
            <section key={key}>
              <h2 className="anim-fade mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.07em] text-mute" style={stagger(g * 3 + 1)}>
                {weekLabel(key, t)}
                <span className="h-px flex-1 bg-line" />
              </h2>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {list.map((i, k) => (
                  // La subida va en el envoltorio: .lift necesita el transform de la tarjeta.
                  <div key={i.id} className="anim-rise" style={stagger(Math.min(g * 3 + 2 + k, 10))}>
                    <article className={cx('card lift h-full p-5', !i.readAt && 'border-brand-2/40! ring-2 ring-brand-2/15')}>
                      <div className="flex items-start gap-3">
                        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', SEV[i.severity].box)}>
                          <IconIdea size={18} />
                        </span>
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge tone={SEV[i.severity].tone}>{SEV[i.severity][lang]}</Badge>
                            {!i.readAt && (
                              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-brand">
                                <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand-2" />
                                {t('New', 'Nueva')}
                              </span>
                            )}
                          </div>
                          <h3 className="text-[16px] font-bold leading-snug">{pick(i.title, lang)}</h3>
                          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{pick(i.body, lang)}</p>
                          {pick(i.action, lang) && (
                            <p className="mt-3 rounded-xl border border-line-2 bg-[#f6f9f8] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
                              <strong>{t('What to do: ', 'Qué hacer: ')}</strong>
                              {pick(i.action, lang)}
                            </p>
                          )}
                          {pick(i.evidence, lang) && (
                            <p className="mt-2 font-mono text-[11.5px] text-mute num">
                              {t('Data: ', 'Dato: ')}
                              {pick(i.evidence, lang)}
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
