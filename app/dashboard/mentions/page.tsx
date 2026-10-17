import type { Metadata } from 'next'
import Link from 'next/link'
import { ShareBar } from '@/components/charts'
import { IconGlobe } from '@/components/icons'
import { AnswerCard } from '@/components/panel/AnswerCard'
import { QuerySelect } from '@/components/panel/QuerySelect'
import { RangePicker } from '@/components/panel/RangePicker'
import { BrandAvatar, Card, cx, Empty, PageHeader, pagerBtn, pct, PlatformDot, RAISE, segmentItem, segmentWrap, StatTile, stagger } from '@/components/ui'
import { platforms } from '@/lib/engines'
import { pageCtx } from '@/lib/guard'
import { getT } from '@/lib/i18n'
import { answersList, brandStats, parseRange, sources } from '@/lib/metrics'
import * as repo from '@/lib/repo'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Mentions', 'Menciones') }
}

const PAGE = 15

export default async function MentionsPage({ searchParams }: { searchParams: Promise<{ r?: string; marca?: string; plataforma?: string; tipo?: string; p?: string }> }) {
  const sp = await searchParams
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const rangeId = parseRange(sp.r)
  const tracked = repo.trackedBrands(ws)
  const brand = tracked.find((b) => b.key === sp.marca) ?? tracked[0]
  const { brands } = brandStats(ws, rangeId)
  const stats = brands.find((b) => b.key === brand.key)!
  const page = Math.max(1, Number(sp.p) || 1)
  const plats = platforms().filter((p) => p.available)
  // Filtro y páginas en la base de datos: se llega a todas las respuestas del periodo.
  const kind = sp.tipo === 'directas' || sp.tipo === 'indirectas' ? sp.tipo : undefined
  const list = answersList(ws, { rangeId, brandKey: brand.key, engine: sp.plataforma || undefined, kind, limit: PAGE, offset: (page - 1) * PAGE })
  const shown = list.items
  const pages = Math.max(1, Math.ceil(list.total / PAGE))
  const cited = sources(ws, rangeId, brand.key)
  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ r: rangeId, marca: brand.key })
    for (const [k, v] of Object.entries({ plataforma: sp.plataforma, tipo: sp.tipo, ...extra })) if (v) p.set(k, v)
    return `/dashboard/mentions?${p}`
  }

  return (
    <>
      <PageHeader
        title={t('Mentions', 'Menciones')}
        hint={t(
          'Every answer where a brand appears, with the exact wording and the sources the AI cited.',
          'Cada respuesta en la que aparece una marca, con la frase exacta y las fuentes que citó la IA.',
        )}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/dashboard/sources?${new URLSearchParams({ r: rangeId, ...(sp.plataforma ? { plataforma: sp.plataforma } : {}) })}`} className="text-[13px] font-semibold text-brand transition-opacity hover:opacity-80">
              {t('All cited sources →', 'Todas las fuentes citadas →')}
            </Link>
            <RangePicker current={rangeId} base="/dashboard/mentions" extra={{ marca: brand.key, plataforma: sp.plataforma, tipo: sp.tipo }} lang={lang} />
          </div>
        }
      />

      <div className="anim-fade relative z-10 mb-4 flex flex-wrap items-center gap-2" style={stagger(1)}>
        <QuerySelect
          name="marca"
          label={t('Brand', 'Marca')}
          value={brand.key}
          options={tracked.map((b) => ({ value: b.key, label: b.own ? t(`${b.name} (you)`, `${b.name} (tú)`) : b.name, icon: <BrandAvatar name={b.name} domain={b.domain || undefined} size={22} /> }))}
        />
        <QuerySelect
          name="plataforma"
          label={t('Platform', 'Plataforma')}
          value={sp.plataforma ?? ''}
          options={[
            { value: '', label: t('All platforms', 'Todas las plataformas'), icon: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-line-2 text-mute"><IconGlobe size={12} /></span> },
            ...plats.map((p) => ({ value: p.id, label: p.name, icon: <PlatformDot id={p.id} size={20} /> })),
          ]}
        />
        <div className={segmentWrap}>
          {[
            { v: '', l: t('All', 'Todas') },
            { v: 'directas', l: t('Direct', 'Directas') },
            { v: 'indirectas', l: t('Indirect', 'Indirectas') },
          ].map((t) => (
            <Link key={t.v} href={q({ tipo: t.v || undefined, p: undefined })} scroll={false} className={segmentItem((sp.tipo ?? '') === t.v)}>
              {t.l}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className={cx('card anim-rise flex items-center gap-3 p-4 sm:col-span-1', RAISE)} style={stagger(1)}>
          <BrandAvatar name={brand.name} domain={brand.domain || undefined} size={36} />
          <div className="min-w-0">
            <div className="truncate font-bold">{brand.name}</div>
            <div className="text-[12.5px] text-mute">
              {t('Visibility', 'Visibilidad')} {pct(stats.visibility, 0, lang)}
            </div>
          </div>
        </div>
        <StatTile i={2} label={t('Total mentions', 'Menciones totales')} value={stats.total}>
          <div className="mt-2">
            <ShareBar
              parts={[
                { label: t('Direct', 'Directas'), value: stats.direct, color: '#00a38c' },
                { label: t('Indirect', 'Indirectas'), value: stats.indirect, color: '#eb6834' },
              ]}
            />
          </div>
        </StatTile>
        <StatTile
          i={3}
          label={
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] bg-[#00a38c]" />
              {t('Direct', 'Directas')}
            </span>
          }
          value={stats.direct}
        >
          <div className="text-[12px] text-mute">{t('The answer names it', 'La respuesta la nombra')}</div>
        </StatTile>
        <StatTile
          i={4}
          label={
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] bg-[#eb6834]" />
              {t('Indirect', 'Indirectas')}
            </span>
          }
          value={stats.indirect}
        >
          <div className="text-[12px] text-mute">{t('Only its website is cited', 'Solo citan su web')}</div>
        </StatTile>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          {shown.length ? (
            shown.map((a, k) => <AnswerCard key={a.id} a={a} brands={tracked} lang={lang} i={k + 5} />)
          ) : (
            <Card i={5}>
              <Empty title={t('No mentions match these filters', 'Sin menciones con estos filtros')}>
                {t('Try another period, platform or brand.', 'Prueba con otro periodo, otra plataforma u otra marca.')}
              </Empty>
            </Card>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-mute num">
                {t(`Page ${page} of ${pages}`, `Página ${page} de ${pages}`)}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={q({ p: String(page - 1) })} className={pagerBtn}>
                    {t('Previous', 'Anterior')}
                  </Link>
                )}
                {page < pages && (
                  <Link href={q({ p: String(page + 1) })} className={pagerBtn}>
                    {t('Next', 'Siguiente')}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
        <aside>
          <Card i={6}>
            <div className="px-6 pb-2 pt-6 text-[15px] font-bold">{t(`Cited ${brand.name} pages`, `Páginas de ${brand.name} citadas`)}</div>
            {cited.domains.length ? (
              <ul className="space-y-2 px-6 pb-6">
                {cited.domains.flatMap((d) => d.urls).slice(0, 12).map((u) => (
                  <li key={u.url}>
                    <a href={u.url} target="_blank" rel="noreferrer nofollow" className="block rounded-lg border border-line-2 px-3 py-2 transition-colors hover:border-brand-2/40 hover:bg-[#f7fbfa]">
                      <div className="truncate text-[13px] font-semibold">{u.title || u.url.replace(/^https?:\/\//, '')}</div>
                      <div className="flex justify-between text-[11.5px] text-mute">
                        <span className="truncate">{u.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</span>
                        <span className="num">{u.count}×</span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 pb-6 text-[13px] text-mute">
                {t('No AI has cited a page from this website in the period yet.', 'Ninguna IA ha citado todavía una página de esta web en el periodo.')}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}
