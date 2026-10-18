import type { Metadata } from 'next'
import { IconTrash } from '@/components/icons'
import { AddCompetitorForm } from '@/components/panel/Forms'
import { dec1 } from '@/components/panel/format'
import { RangePicker } from '@/components/panel/RangePicker'
import { Badge, Bar, BrandAvatar, Card, CardHeader, cx, pct, PageHeader, PlatformDot, RAISE, seriesColor, stagger } from '@/components/ui'
import { platforms } from '@/lib/engines'
import { pageCtx } from '@/lib/guard'
import { getT } from '@/lib/i18n'
import { brandStats, parseRange, untrackedBrands } from '@/lib/metrics'
import { suggestedDomain } from '@/lib/brandDomain'
import * as repo from '@/lib/repo'
import { quickAddCompetitorAction, removeCompetitorAction, updateCompetitorAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Competitors', 'Competidores') }
}

export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const sp = await searchParams
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const rangeId = parseRange(sp.r)
  const { brands, searches } = brandStats(ws, rangeId)
  const competitors = repo.competitorsOf(ws.id)
  const tracked = repo.trackedBrands(ws)
  const colorOf = new Map(tracked.map((b, i) => [b.key, seriesColor(i)]))
  const own = brands.find((b) => b.own)!
  // Con su web (si ya se conoce) para enseñar el logo; las que falten se buscan en segundo plano.
  const untracked = untrackedBrands(ws, rangeId, 10).map((u) => ({ ...u, domain: suggestedDomain(ws, u.name) }))
  const plats = platforms().filter((p) => p.available)
  const sorted = [...brands].sort((a, b) => b.visibility - a.visibility)

  return (
    <>
      <PageHeader
        title={t('Competitors', 'Competidores')}
        hint={t("The brands we compare you with in every answer. If an AI names them, you'll see it here.", 'Las marcas con las que te comparamos en cada respuesta. Si una IA las nombra, lo verás aquí.')}
        right={<RangePicker current={rangeId} base="/dashboard/competitors" lang={lang} />}
      />

      <Card i={1} className="mb-4">
        <CardHeader
          title={t('Add competitor', 'Añadir competidor')}
          hint={t("The website lets us detect when the AI cites their pages even if it doesn't name them.", 'La web sirve para detectar cuándo la IA cita sus páginas aunque no los nombre.')}
        />
        <div className="px-6 pb-6">
          <AddCompetitorForm />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card i={2} className="overflow-hidden">
          <CardHeader title={t('How you compare', 'Cómo te comparas')} hint={t(`${searches} answers in the period`, `${searches} respuestas en el periodo`)} />
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {sorted.map((b, i) => {
              const comp = competitors.find((c) => c.id === b.competitorId)
              const gap = b.visibility - own.visibility
              return (
                <li key={b.key} className={cx('anim-fade px-6 py-3.5 transition-colors hover:bg-[#f6f9f8]', RAISE, b.own && 'bg-[#f6f8f7] hover:bg-[#f1f4f3]')} style={stagger(3 + Math.min(i, 8))}>
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-[13px] text-mute num">{i + 1}</span>
                    <BrandAvatar name={b.name} domain={b.domain || undefined} color={colorOf.get(b.key)} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        {b.name} {b.own && <Badge tone="brand">{t('You', 'Tú')}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Bar value={b.visibility} className="max-w-[180px]" color={colorOf.get(b.key)} i={Math.min(i, 8)} />
                        <span className="text-[12.5px] font-semibold num">{pct(b.visibility, 0, lang)}</span>
                        {!b.own && searches > 0 && (
                          <span className={cx('whitespace-nowrap rounded-full px-2 py-px text-[11.5px] font-semibold num', gap > 0 ? 'bg-white text-bad ring-1 ring-inset ring-line' : gap < 0 ? 'bg-white text-good ring-1 ring-inset ring-line' : 'bg-line-2 text-mute')}>
                            {gap > 0
                              ? t(`+${Math.round(gap)} pts above you`, `+${Math.round(gap)} pts sobre ti`)
                              : gap < 0
                                ? t(`${Math.round(gap)} pts below you`, `${Math.round(gap)} pts bajo ti`)
                                : t('tied', 'empate')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden items-center gap-1 sm:flex">
                      {plats.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2 text-[11.5px] font-semibold num" title={p.name}>
                          <PlatformDot id={p.id} size={18} />
                          {b.byEngine[p.id] ?? 0}
                        </span>
                      ))}
                    </div>
                    {comp && (
                      <details className="relative">
                        <summary className="rounded-full border border-transparent px-2.5 py-1 text-[12.5px] font-semibold text-mute transition-colors hover:border-line hover:bg-white hover:text-ink">{t('Edit', 'Editar')}</summary>
                        <div className="absolute right-0 top-full z-20 mt-1 w-72 animate-[p-rise_0.18s_ease-out_both] rounded-xl border border-line bg-white p-3 shadow-[0_18px_40px_-16px_rgba(4,25,28,0.3)] motion-reduce:animate-none">
                          <form action={updateCompetitorAction} className="space-y-2">
                            <input type="hidden" name="id" value={comp.id} />
                            <input name="name" defaultValue={comp.name} className="h-9 w-full rounded-lg border border-line px-2.5 text-sm" />
                            <input name="domain" defaultValue={comp.domain} placeholder={t('website.com', 'web.com')} className="h-9 w-full rounded-lg border border-line px-2.5 text-sm" />
                            <input name="aliases" defaultValue={comp.aliases.join(', ')} placeholder={t('Other names', 'Otros nombres')} className="h-9 w-full rounded-lg border border-line px-2.5 text-sm" />
                            <button className="h-9 w-full rounded-lg bg-deep text-sm font-semibold text-white transition-colors hover:bg-deep-2">{t('Save', 'Guardar')}</button>
                          </form>
                          <form action={removeCompetitorAction} className="mt-2">
                            <input type="hidden" name="id" value={comp.id} />
                            <button className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-bad hover:bg-line-2">
                              <IconTrash size={14} /> {t('Stop tracking', 'Dejar de seguir')}
                            </button>
                          </form>
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 pl-[80px] text-[12px] text-mute sm:max-w-md">
                    <span>
                      <strong className="text-ink num">{b.total}</strong> {t('mentions', 'menciones')}
                    </span>
                    <span>
                      {t('Position', 'Puesto')} <strong className="text-ink num">{b.avgPosition ? dec1(b.avgPosition, lang) : t('no data', 'sin datos')}</strong>
                    </span>
                    <span>
                      <strong className="text-ink num">{b.citations}</strong> {t('citations of their site', 'citas a su web')}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card i={3}>
          <CardHeader title={t('Suggested', 'Sugeridos')} hint={t("Brands that appear in your answers that you don't track", 'Marcas que aparecen en tus respuestas y no sigues')} />
          {untracked.length ? (
            <ul className="divide-y divide-line-2 border-t border-line-2">
              {untracked.map((u, k) => (
                <li key={u.key} className="anim-fade flex items-center justify-between gap-3 px-6 py-2.5 transition-colors hover:bg-[#f6f9f8]" style={stagger(4 + Math.min(k, 8))}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <BrandAvatar name={u.name} domain={u.domain ?? undefined} size={26} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{u.name}</div>
                      <div className="text-[12px] text-mute">
                        {u.n} {u.n === 1 ? t('answer', 'respuesta') : t('answers', 'respuestas')}
                      </div>
                    </div>
                  </div>
                  <form action={quickAddCompetitorAction}>
                    <input type="hidden" name="name" value={u.name} />
                    {u.domain && <input type="hidden" name="domain" value={u.domain} />}
                    <button className="rounded-full border border-line bg-white px-3 py-1 text-[12.5px] font-semibold transition-colors hover:border-faint hover:bg-line-2 hover:text-ink">
                      {t('Track', 'Seguir')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 pb-6 text-sm text-mute">
              {t("When the AI assistants name other brands in your prompts, we'll suggest them here.", 'Cuando las IA nombren otras marcas en tus preguntas, te las propondremos aquí.')}
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
