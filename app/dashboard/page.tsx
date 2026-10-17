import type { Metadata } from 'next'
import Link from 'next/link'
import { MentionBars, Sparkline } from '@/components/charts'
import { IconArrow, IconIdea } from '@/components/icons'
import { QuerySelect } from '@/components/panel/QuerySelect'
import { RangePicker } from '@/components/panel/RangePicker'
import { dec1 } from '@/components/panel/format'
import { RunStatus } from '@/components/panel/RunStatus'
import { Timeline } from '@/components/Timeline'
import { Badge, Bar, BrandAvatar, Card, CardHeader, cx, Delta, Empty, fmtDay, InfoTip, num, pct, PlatformDot, PLATFORM_META, RAISE, segmentItem, segmentWrap, seriesColor, stagger } from '@/components/ui'
import { platforms } from '@/lib/engines'
import { pageCtx } from '@/lib/guard'
import { getT, pick } from '@/lib/i18n'
import { insightsOf } from '@/lib/insights'
import { answersList, overview, parseRange, RANGE_LABEL, timeline, untrackedBrands } from '@/lib/metrics'
import * as repo from '@/lib/repo'
import { activeRun, lastRun } from '@/lib/tracking'
import { quickAddCompetitorAction } from './actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Overview', 'Resumen') }
}

function Stat({ label, value, sub, delta, info, i, chart }: { label: string; value: string; sub: React.ReactNode; delta: React.ReactNode; info: string; i: number; chart?: React.ReactNode }) {
  const empty = !/\d/.test(value)
  return (
    <div className={cx('card anim-rise relative flex flex-col overflow-hidden px-5 py-4', RAISE)} style={stagger(i)}>
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-mute">{label}</span>
        <InfoTip text={info} align="end" />
      </div>
      <div className="relative mt-3 flex items-center justify-between gap-3">
        <span className={cx('font-extrabold leading-none tracking-[-0.04em] num', empty ? 'text-[20px] text-faint' : 'text-[28px]')}>{value}</span>
        <span className="shrink-0">{delta}</span>
      </div>
      {chart && <div className="relative mt-3">{chart}</div>}
      <div className="relative mt-auto pt-2.5 text-[12.5px] text-mute">{sub}</div>
    </div>
  )
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ r?: string; vista?: string; marca?: string; primera?: string }> }) {
  const sp = await searchParams
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const rangeId = parseRange(sp.r)
  const data = overview(ws, rangeId)
  const brands = repo.trackedBrands(ws)
  const colorOf = new Map(brands.map((b, i) => [b.key, seriesColor(i)]))
  const domainOf = new Map(brands.map((b) => [b.key, b.domain]))
  const own = data.own
  const prevOwn = data.prev.own
  const hasPrev = data.prev.searches > 0
  const view = sp.vista === 'evolucion' ? 'evolucion' : 'marcas'
  // La evolución también alimenta la minigráfica de la ficha de visibilidad.
  const tl = timeline(ws, rangeId)
  const ownSeries = tl.series.find((s) => s.own)?.values ?? []
  const ownKey = own.key
  const recent = answersList(ws, { rangeId, limit: 24 })
    .items.filter((a) => !a.empty)
    .slice(0, 12)
  const focus = data.ranking.find((b) => b.key === sp.marca) ?? own
  const plats = platforms().filter((p) => p.available)
  const ideas = insightsOf(ws.id).slice(0, 3)
  const untracked = untrackedBrands(ws, rangeId, 4)
  const active = activeRun(ws.id)
  const last = lastRun(ws.id)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="anim-rise">
          <h1 className="ink-gradient pb-1 text-[28px] font-extrabold leading-[1.1] tracking-[-0.04em] sm:text-[34px]">{t('Overview', 'Resumen')}</h1>
          <p className="mt-2 text-[14px] text-mute">
            {t(`How ${ws.brandName} shows up in ${plats.map((p) => p.name).join(', ')}.`, `Cómo aparece ${ws.brandName} en ${plats.map((p) => p.name).join(', ')}.`)}{' '}
            {RANGE_LABEL[rangeId][lang]}
            {data.range.from !== data.range.to ? '' : `, ${fmtDay(data.range.from, { day: 'numeric', month: 'long' }, lang)}`}.
          </p>
        </div>
        <div className="anim-fade relative z-20 flex flex-wrap items-center gap-3" style={stagger(1)}>
          <RunStatus
            initial={{
              active: null,
              last: last ? { status: last.status, finishedAt: last.finishedAt, day: last.day } : null,
            }}
            canRun={!active}
          />
          <RangePicker current={rangeId} base="/dashboard" extra={{ vista: sp.vista, marca: sp.marca }} lang={lang} />
        </div>
      </div>

      {active && <RunStatus initial={{ active: { id: active.id, done: active.done, total: active.total }, last: null }} canRun={false} />}

      {!data.hasData && !active ? (
        <Card i={1}>
          <Empty title={t('No answers in this period yet', 'Todavía no hay respuestas en este periodo')}>
            {t(
              'The weekly check runs on its own. If you just signed up, click “Run now” and your first data will show up here in a few minutes.',
              'La medición semanal se lanza sola. Si acabas de darte de alta, pulsa «Medir ahora» y en unos minutos verás aquí los primeros datos.',
            )}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[74rem]:grid-cols-4">
            <Stat
              i={0}
              chart={<Bar value={own.visibility} className="h-1.5" color="#00a38c" />}
              label={t('Visibility', 'Visibilidad')}
              value={pct(own.visibility, 0, lang)}
              info={t(
                'Share of AI answers where your brand appears, either named or cited as a source.',
                'Porcentaje de respuestas de IA en las que aparece tu marca, nombrada o citada como fuente.',
              )}
              delta={<Delta value={hasPrev ? own.visibility - prevOwn.visibility : null} suffix=" pts" lang={lang} />}
              sub={
                <div className="flex items-end justify-between gap-3">
                  <span>{t(`In ${own.appearances} of ${data.searches} answers`, `En ${own.appearances} de ${data.searches} respuestas`)}</span>
                  <Sparkline id="own-visibility" values={ownSeries} className="w-16 shrink-0" />
                </div>
              }
            />
            <Stat
              i={1}
              label={t('Avg. sentiment', 'Sentimiento medio')}
              value={own.sentiment === null ? t('No data', 'Sin datos') : pct(own.sentiment, 0, lang)}
              info={t(
                'How the AI talks about you when it names you: 100 is always positive, 50 neutral, 0 critical.',
                'Tono con el que la IA habla de ti cuando te nombra: 100 es siempre elogioso, 50 neutro, 0 crítico.',
              )}
              delta={<Delta value={hasPrev && own.sentiment !== null && prevOwn.sentiment !== null ? own.sentiment - prevOwn.sentiment : null} suffix=" pts" lang={lang} />}
              sub={
                own.sentiment === null
                  ? t('Not named yet', 'Aún no te nombran')
                  : own.sentiment >= 66
                    ? t('Positive tone', 'Tono favorable')
                    : own.sentiment >= 40
                      ? t('Neutral tone', 'Tono neutro')
                      : t('Critical tone', 'Tono crítico')
              }
            />
            <Stat
              i={2}
              label={t('Avg. position', 'Posición media')}
              value={own.avgPosition === null ? t('No data', 'Sin datos') : dec1(own.avgPosition, lang)}
              info={t(
                "Your average rank among the brands the answer names. 1 means you're listed first.",
                'Puesto medio de tu marca entre las que nombra la respuesta. 1 es salir la primera.',
              )}
              delta={<Delta value={hasPrev && own.avgPosition !== null && prevOwn.avgPosition !== null ? own.avgPosition - prevOwn.avgPosition : null} invert precision={1} lang={lang} />}
              sub={own.avgPosition === null ? t('No direct mentions', 'Sin menciones directas') : t('Among the brands named', 'Entre las marcas citadas')}
            />
            <Stat
              i={3}
              label={t('Mentions', 'Menciones')}
              value={num(own.total, lang)}
              info={t(
                'Direct: the answer names you. Indirect: the answer cites your website as a source. One answer can count as both.',
                'Directas: la respuesta te nombra. Indirectas: la respuesta cita tu web como fuente. Una misma respuesta puede contar como las dos.',
              )}
              delta={<Delta value={hasPrev ? own.total - prevOwn.total : null} lang={lang} />}
              sub={
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#00a38c]" />
                    {t(`${own.direct} direct`, `${own.direct} directas`)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#eb6834]" />
                    {t(`${own.indirect} indirect`, `${own.indirect} indirectas`)}
                  </span>
                </span>
              }
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
            <Card i={4}>
              <CardHeader
                title={t('Brand visibility', 'Visibilidad por marca')}
                info={t(
                  'Mentions of each tracked brand in the period. Hover over the bars to see the breakdown.',
                  'Menciones de cada marca seguida en el periodo. Pasa el ratón por las barras para ver el detalle.',
                )}
                hint={
                  view === 'marcas'
                    ? t('Direct and indirect mentions in the period', 'Menciones directas e indirectas en el periodo')
                    : t('Share of answers where each brand appears, day by day', 'Porcentaje de respuestas en las que aparece cada marca, día a día')
                }
                right={
                  <div className={segmentWrap}>
                    {(['marcas', 'evolucion'] as const).map((v) => (
                      <Link
                        key={v}
                        scroll={false}
                        href={`/dashboard?${new URLSearchParams({ r: rangeId, vista: v, ...(sp.marca ? { marca: sp.marca } : {}) })}`}
                        className={segmentItem(view === v)}
                      >
                        {v === 'marcas' ? t('By brand', 'Por marca') : t('Timeline', 'Evolución')}
                      </Link>
                    ))}
                  </div>
                }
              />
              {view === 'marcas' ? (
                <MentionBars
                  data={data.ranking.slice(0, 8).map((b) => ({ key: b.key, name: b.name, own: b.own, direct: b.direct, indirect: b.indirect, domain: b.domain || undefined }))}
                  lang={lang}
                />
              ) : (
                <Timeline
                  days={tl.days}
                  series={tl.series.slice(0, 8).map((s) => ({ ...s, color: colorOf.get(s.key) ?? '#93a3a6', domain: domainOf.get(s.key) || undefined }))}
                />
              )}
            </Card>

            <Card i={5} className="flex flex-col">
              <CardHeader title={t('Brand mentions', 'Menciones por marca')} hint={t('Pick a brand to see its breakdown', 'Elige una marca para ver su desglose')} />
              <div className="px-6">
                <QuerySelect
                  name="marca"
                  label={t('Brand', 'Marca')}
                  value={focus.key}
                  className="w-full"
                  options={data.ranking.map((b) => ({
                    value: b.key,
                    label: b.own ? t(`${b.name} (you)`, `${b.name} (tú)`) : b.name,
                    icon: <BrandAvatar name={b.name} domain={b.domain || undefined} size={24} />,
                  }))}
                />
              </div>
              <ul className="mt-1 flex-1 divide-y divide-line-2 px-6">
                {[
                  { label: t('Total mentions', 'Menciones totales'), value: focus.total, info: '', tab: '', dot: '' },
                  { label: t('Direct', 'Directas'), value: focus.direct, info: t('The answer names the brand.', 'La respuesta nombra a la marca.'), tab: 'directas', dot: '#00a38c' },
                  {
                    label: t('Indirect', 'Indirectas'),
                    value: focus.indirect,
                    info: t('The answer cites its website as a source.', 'La respuesta cita su web como fuente.'),
                    tab: 'indirectas',
                    dot: '#eb6834',
                  },
                ].map((row) => (
                  <li key={row.label} className="group flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-mute">
                        {row.dot && <span className="h-2 w-2 rounded-full" style={{ background: row.dot }} />}
                        {row.label}
                        {row.info && <InfoTip text={row.info} />}
                      </div>
                      <div className="text-[20px] font-extrabold leading-tight tracking-[-0.03em] num">{num(row.value, lang)}</div>
                    </div>
                    <Link
                      href={`/dashboard/mentions?${new URLSearchParams({ r: rangeId, marca: focus.key, ...(row.tab ? { tipo: row.tab } : {}) })}`}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-white px-3 text-[12.5px] font-semibold shadow-[0_1px_2px_rgba(4,25,28,0.05)] transition-colors hover:border-deep hover:bg-deep hover:text-white"
                    >
                      {t('View', 'Ver')}
                      <IconArrow size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line-2 px-6 py-3.5">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-mute">{t('By platform', 'Por plataforma')}</div>
                <div className="flex flex-wrap gap-2">
                  {plats.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2 text-[12px] font-semibold num" title={p.name}>
                      <PlatformDot id={p.id} size={18} />
                      {focus.byEngine[p.id] ?? 0}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <Card i={6} className="mt-4 overflow-hidden">
            <CardHeader
              title={t('Competitor ranking', 'Ranking de competidores')}
              info={t(
                'Sorted by visibility in the period. The platform counts show in how many answers from each platform the brand appears.',
                'Ordenado por visibilidad en el periodo. Las fuentes cuentan en cuántas respuestas de cada plataforma aparece la marca.',
              )}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm num">
                <thead>
                  <tr className="border-y border-line-2 bg-[#f6f8f7] text-left text-[12.5px] font-semibold text-mute">
                    <th className="w-14 px-3 py-2.5 pl-6">#</th>
                    <th className="px-3 py-2.5">{t('Brand', 'Marca')}</th>
                    <th className="border-l border-line-2 px-4 py-2.5">{t('Visibility', 'Visibilidad')}</th>
                    <th className="border-l border-line-2 px-3 py-2.5 text-center">{t('Total mentions', 'Menciones totales')}</th>
                    <th className="border-l border-line-2 px-3 py-2.5 text-center">{t('Avg. position', 'Posición media')}</th>
                    <th className="border-l border-line-2 px-4 py-2.5">{t('Mention sources', 'Fuentes de mención')}</th>
                    <th className="px-3 py-2.5 pr-6" />
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((b, i) => (
                    <tr key={b.key} className={cx('anim-fade border-b border-line-2 transition-colors last:border-0 hover:bg-[#f6f9f8]', b.own && 'bg-[#f6f8f7] hover:bg-[#f1f4f3]')} style={stagger(i + 6)}>
                      <td className="px-3 py-3 pl-6 text-mute num">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <BrandAvatar name={b.name} domain={b.domain || undefined} color={colorOf.get(b.key)} size={36} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-bold">
                              {b.name}
                              {b.own && <Badge tone="brand">{t('You', 'Tú')}</Badge>}
                            </div>
                            {b.domain && <div className="text-[12px] text-mute">{b.domain}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="border-l border-line-2 px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Bar value={b.visibility} className="w-24" color={colorOf.get(b.key)} i={i} />
                          <span className="w-14 whitespace-nowrap text-[13px] font-semibold num">{pct(b.visibility, 0, lang)}</span>
                        </div>
                      </td>
                      <td className="border-l border-line-2 px-3 py-3 text-center">
                        <span className="inline-flex min-w-9 items-center justify-center rounded-full bg-line-2 px-2.5 py-0.5 text-[12.5px] font-bold text-ink num">{b.total}</span>
                      </td>
                      <td className="border-l border-line-2 px-3 py-3 text-center text-ink-2 num">{b.avgPosition === null ? t('No data', 'Sin datos') : dec1(b.avgPosition, lang)}</td>
                      <td className="border-l border-line-2 px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {plats.map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2 text-[12px] font-semibold shadow-[0_1px_1px_rgba(4,25,28,0.04)] num" title={p.name}>
                              <PlatformDot id={p.id} size={18} />
                              {b.byEngine[p.id] ?? 0}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 pr-6 text-right">
                        <Link
                          href={`/dashboard/mentions?${new URLSearchParams({ r: rangeId, marca: b.key })}`}
                          className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3.5 text-[12.5px] font-semibold shadow-[0_1px_2px_rgba(4,25,28,0.06)] transition-colors hover:border-deep hover:bg-deep hover:text-white"
                        >
                          {t('View', 'Ver')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.ranking.length <= 1 && (
              <div className="border-t border-line-2 px-6 py-4 text-sm text-mute">
                {t("You're not tracking any competitors yet.", 'Aún no sigues a ningún competidor.')}{' '}
                <Link href="/dashboard/competitors" className="font-semibold text-brand hover:underline">
                  {t('Add a few', 'Añade algunos')}
                </Link>{' '}
                {t('to compare yourself.', 'para compararte.')}
              </div>
            )}
          </Card>

          <section className="mt-8" aria-labelledby="recent-searches">
            <div className="anim-rise mb-3 flex flex-wrap items-end justify-between gap-3" style={stagger(7)}>
              <h2 id="recent-searches" className="flex items-center gap-1.5 text-[18px] font-bold tracking-[-0.02em]">
                {t('Recent searches', 'Búsquedas recientes')}
                <InfoTip
                  text={t(
                    'The latest answers the AI assistants gave to your prompts in this period, newest first.',
                    'Las últimas respuestas que han dado las IA a tus preguntas en este periodo, de la más nueva a la más antigua.',
                  )}
                />
              </h2>
              <Link
                href="/dashboard/searches"
                className="group inline-flex items-center gap-1 rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold shadow-[0_1px_2px_rgba(4,25,28,0.05)] transition-colors hover:border-faint"
              >
                {t('All searches', 'Todas las búsquedas')}
                <IconArrow size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
            {recent.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recent.map((a, k) => {
                  const appears = a.mentions.some((m) => m.brandKey === ownKey)
                  return (
                    // La subida va en el envoltorio: .lift necesita el transform de la tarjeta.
                    <div key={a.id} className="anim-rise" style={stagger(8 + Math.min(k, 5))}>
                      <article className="card lift flex h-full flex-col p-5">
                        {appears && (
                          <Badge tone="brand" className="mb-2 self-start">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-2" />
                            {t('You appear', 'Sales')}
                          </Badge>
                        )}
                        <p className="line-clamp-3 text-[15px] font-semibold leading-snug">{a.promptText}</p>
                        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[12.5px] text-mute">
                          <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ink-2">
                            <PlatformDot id={a.engine} size={18} />
                            <span className="truncate">{PLATFORM_META[a.engine]?.name ?? a.engine}</span>
                          </span>
                          <span className="shrink-0 num">{fmtDay(a.day, { day: 'numeric', month: 'short', year: 'numeric' }, lang)}</span>
                        </div>
                        <Link
                          href={`/dashboard/searches/${a.id}`}
                          className="mt-3 flex h-9 items-center justify-center rounded-full border border-line text-[13px] font-semibold text-ink transition-colors duration-200 hover:border-deep hover:bg-deep hover:text-white"
                        >
                          {t('View full answer', 'Ver respuesta completa')}
                        </Link>
                      </article>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Card i={8}>
                <Empty title={t('No searches in this period', 'No hay búsquedas en este periodo')}>
                  {t('Answers will show up here after the next weekly run.', 'Las respuestas aparecerán aquí después de la próxima medición semanal.')}
                </Empty>
              </Card>
            )}
          </section>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card i={8}>
              <CardHeader
                title={t("This week's insights", 'Ideas de la semana')}
                right={
                  <Link href="/dashboard/insights" className="group inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
                    {t('View all', 'Todas')} <IconArrow size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                }
              />
              {ideas.length ? (
                <ul className="divide-y divide-line-2 px-6 pb-3">
                  {ideas.map((i, k) => (
                    <li key={i.id} className="anim-fade flex gap-3 py-3" style={stagger(k + 9)}>
                      <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-2">
                        <IconIdea size={15} />
                        <span
                          aria-hidden="true"
                          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white"
                          style={{ background: i.severity === 'critico' ? '#c2410c' : i.severity === 'aviso' ? '#d97706' : i.severity === 'bien' ? '#047857' : '#00a38c' }}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold">{pick(i.title, lang)}</div>
                        <div className="mt-0.5 line-clamp-2 text-[13px] text-mute">{pick(i.body, lang)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-6 pb-6 text-sm text-mute">{t('Insights show up once a few answers have been tracked.', 'Las ideas aparecen cuando hay al menos unas cuantas respuestas medidas.')}</p>
              )}
            </Card>
            <Card i={9}>
              <CardHeader
                title={t("Brands the AI names that you don't track", 'Marcas que la IA nombra y no sigues')}
                info={t("Companies that show up in your answers and aren't on your competitor list.", 'Empresas que aparecen en tus respuestas y no están en tu lista de competidores.')}
              />
              {untracked.length ? (
                <ul className="divide-y divide-line-2 px-6 pb-3">
                  {untracked.map((u) => (
                    <li key={u.key} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <BrandAvatar name={u.name} size={26} />
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-bold">{u.name}</div>
                          <div className="text-[12px] text-mute">
                            {u.n === 1 ? t('In 1 answer', 'En 1 respuesta') : t(`In ${u.n} answers`, `En ${u.n} respuestas`)}
                            {u.avgRank ? t(` · avg. position ${dec1(u.avgRank, lang)}`, ` · puesto medio ${dec1(u.avgRank, lang)}`) : ''}
                          </div>
                        </div>
                      </div>
                      <form action={quickAddCompetitorAction}>
                        <input type="hidden" name="name" value={u.name} />
                        <button className="rounded-full border border-line px-3 py-1 text-[12.5px] font-semibold transition-colors hover:border-deep hover:bg-deep hover:text-white">
                          {t('Track', 'Seguir')}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-6 pb-6 text-sm text-mute">
                  {t("Nothing for now: either you already track them all or there aren't enough answers yet.", 'Nada por ahora: o sigues a todos o aún no hay suficientes respuestas.')}
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}
