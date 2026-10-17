import type { Metadata } from 'next'
import Link from 'next/link'
import { IconArrow, IconChevron, IconGlobe } from '@/components/icons'
import { QuerySelect } from '@/components/panel/QuerySelect'
import { RangePicker } from '@/components/panel/RangePicker'
import { Badge, Bar, BrandAvatar, Card, CardHeader, Empty, PageHeader, PlatformDot, StatTile, stagger } from '@/components/ui'
import { platforms } from '@/lib/engines'
import { pageCtx } from '@/lib/guard'
import { getT } from '@/lib/i18n'
import { parseRange, sources } from '@/lib/metrics'
import * as repo from '@/lib/repo'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Sources', 'Fuentes') }
}

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ r?: string; plataforma?: string }> }) {
  const sp = await searchParams
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const rangeId = parseRange(sp.r)
  const data = sources(ws, rangeId)
  const tracked = repo.trackedBrands(ws)
  const nameOf = new Map(tracked.map((b) => [b.key, b]))
  const plats = platforms().filter((p) => p.available)
  const domains = sp.plataforma ? data.domains.filter((d) => d.engines[sp.plataforma!]) : data.domains
  const max = Math.max(1, ...domains.map((d) => d.count))
  const own = domains.filter((d) => d.brandKey === tracked[0].key).reduce((s, d) => s + d.count, 0)
  const rivals = domains.filter((d) => d.brandKey && d.brandKey !== tracked[0].key).reduce((s, d) => s + d.count, 0)
  const third = domains.filter((d) => !d.brandKey).reduce((s, d) => s + d.count, 0)

  return (
    <>
      <Link href={`/dashboard/mentions?r=${rangeId}`} className="group anim-fade mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-mute transition-colors hover:text-ink">
        <IconArrow size={14} className="rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5" /> {t('Mentions', 'Menciones')}
      </Link>
      <PageHeader
        title={t('Sources', 'Fuentes')}
        hint={t(
          "The pages AI assistants cite when they answer. If a source shows up a lot and doesn't mention you, that's where the work is.",
          'Las páginas que citan las IA al responder. Si una fuente aparece mucho y no habla de ti, ahí tienes trabajo.',
        )}
        right={<RangePicker current={rangeId} base="/dashboard/sources" extra={{ plataforma: sp.plataforma }} lang={lang} />}
      />
      <div className="anim-fade relative z-10 mb-4" style={stagger(1)}>
        <QuerySelect
          name="plataforma"
          label={t('Platform', 'Plataforma')}
          value={sp.plataforma ?? ''}
          options={[
            { value: '', label: t('All platforms', 'Todas las plataformas'), icon: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-line-2 text-mute"><IconGlobe size={12} /></span> },
            ...plats.map((p) => ({ value: p.id, label: p.name, icon: <PlatformDot id={p.id} size={20} /> })),
          ]}
        />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { l: t('Citations of your site', 'Citas a tu web'), v: own, tone: 'text-brand' },
          { l: t('Citations of competitors', 'Citas a competidores'), v: rivals, tone: 'text-ink' },
          { l: t('Third-party citations', 'Citas a terceros'), v: third, tone: 'text-ink' },
        ].map((x, k) => (
          <StatTile key={x.l} i={k + 1} label={x.l} value={x.v} valueClassName={x.tone} />
        ))}
      </div>
      <Card i={4} className="overflow-hidden">
        <CardHeader title={t('Most cited domains', 'Dominios más citados')} hint={t(`${data.totalCitations} citations in the period`, `${data.totalCitations} citas en el periodo`)} />
        {domains.length ? (
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {domains.slice(0, 60).map((d, k) => {
              const owner = d.brandKey ? nameOf.get(d.brandKey) : null
              return (
                <li key={d.domain}>
                  <details className="group">
                    <summary className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-[#f6f9f8]">
                      <BrandAvatar name={d.domain} domain={d.domain} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[14px] font-semibold">
                          <span className="truncate">{d.domain}</span>
                          {owner && <Badge tone={owner.own ? 'brand' : 'neutral'}>{owner.own ? t('Your site', 'Tu web') : owner.name}</Badge>}
                        </div>
                        <Bar value={(d.count / max) * 100} className="mt-1.5 max-w-xs" color={owner?.own ? '#00a38c' : '#93a3a6'} i={Math.min(k, 10)} />
                      </div>
                      <div className="hidden gap-1 sm:flex">
                        {plats.map((p) =>
                          d.engines[p.id] ? (
                            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2 text-[11.5px] font-semibold num" title={p.name}>
                              <PlatformDot id={p.id} size={18} />
                              {d.engines[p.id]}
                            </span>
                          ) : null,
                        )}
                      </div>
                      <div className="w-16 text-right">
                        <div className="text-[15px] font-bold num">{d.count}</div>
                        <div className="text-[11px] text-mute">{t('citations', 'citas')}</div>
                      </div>
                      <IconChevron size={15} className="shrink-0 text-faint transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <ul className="animate-[p-fade_0.2s_ease_both] space-y-1 bg-[#f8faf9] px-6 pb-3 pl-[68px] pt-1 motion-reduce:animate-none">
                      {d.urls.map((u) => (
                        <li key={u.url} className="flex items-center justify-between gap-3 text-[12.5px]">
                          <a href={u.url} target="_blank" rel="noreferrer nofollow" className="min-w-0 truncate text-ink-2 transition-colors hover:text-brand">
                            {u.title || u.url}
                          </a>
                          <span className="shrink-0 text-mute num">{u.count}×</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty title={t('No cited sources yet', 'Aún no hay fuentes citadas')}>
            {t(
              'They will show up once the platforms with web search start answering your prompts.',
              'Aparecerán cuando las plataformas con búsqueda web empiecen a responder a tus preguntas.',
            )}
          </Empty>
        )}
      </Card>
    </>
  )
}
