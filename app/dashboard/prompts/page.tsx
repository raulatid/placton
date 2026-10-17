import type { Metadata } from 'next'
import Link from 'next/link'
import { IconCheck, IconTrash, IconX } from '@/components/icons'
import { AddPromptForm, MoreSuggestionsButton } from '@/components/panel/Forms'
import { dec1 } from '@/components/panel/format'
import { RangePicker } from '@/components/panel/RangePicker'
import { Badge, Bar, Card, CardHeader, cx, Empty, fmtDay, pct, PageHeader, PlatformDot, stagger } from '@/components/ui'
import { platforms } from '@/lib/engines'
import { pageCtx } from '@/lib/guard'
import { getT } from '@/lib/i18n'
import { parseRange, promptStats } from '@/lib/metrics'
import { ConfirmButton } from '@/components/panel/ConfirmButton'
import * as repo from '@/lib/repo'
import { acceptSuggestionAction, deletePromptAction, dismissSuggestionAction, togglePromptAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Prompts', 'Prompts') }
}

export default async function PromptsPage({ searchParams }: { searchParams: Promise<{ r?: string; tema?: string }> }) {
  const sp = await searchParams
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const rangeId = parseRange(sp.r)
  const prompts = repo.promptsOf(ws.id)
  const stats = promptStats(ws, rangeId)
  const suggestions = repo.suggestionsOf(ws.id)
  const limit = repo.promptLimit(ws)
  const active = prompts.filter((p) => p.active).length
  const full = active >= limit
  const topics = [...new Set(prompts.map((p) => p.topic).filter(Boolean))].sort()
  const plats = platforms().filter((p) => p.available)
  const shown = sp.tema ? prompts.filter((p) => p.topic === sp.tema) : prompts

  return (
    <>
      <PageHeader
        title="Prompts"
        hint={t(
          'The questions we ask the AI assistants every week, written the way a customer would. Each one runs on every active platform.',
          'Las preguntas que hacemos cada semana a las IA, escritas como las haría un cliente. Cada una se lanza en todas las plataformas activas.',
        )}
        right={<RangePicker current={rangeId} base="/dashboard/prompts" extra={{ tema: sp.tema }} lang={lang} />}
      />

      <Card i={1} className="mb-4">
        <CardHeader
          title={t('Add a prompt', 'Añadir una pregunta')}
          right={
            <span className="inline-flex items-center gap-2">
              <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-line-2 sm:block">
                <span className={cx('anim-grow-x block h-full rounded-full', full ? 'bg-warn' : 'bg-brand-2')} style={{ width: `${Math.min(100, (active / Math.max(1, limit)) * 100)}%` }} />
              </span>
              <span className={cx('text-[13px] font-semibold num', full ? 'text-warn' : 'text-mute')}>{t(`${active} of ${limit} active`, `${active} de ${limit} activas`)}</span>
            </span>
          }
        />
        <div className="px-6 pb-6">
          <AddPromptForm topics={topics} disabled={full} />
          {full && (
            <p className="mt-3 text-[13px] text-mute">
              {t('To track more prompts, pause some or', 'Para seguir más preguntas, desactiva alguna o')}{' '}
              <Link href="/dashboard/plans" className="font-semibold text-brand hover:underline">
                {t('upgrade your plan', 'amplía tu plan')}
              </Link>
              .
            </p>
          )}
        </div>
      </Card>

      {topics.length > 1 && (
        <div className="anim-fade mb-3 flex flex-wrap gap-1.5" style={stagger(2)}>
          <Link
            href={`/dashboard/prompts?r=${rangeId}`}
            className={cx('rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors duration-200', !sp.tema ? 'border-deep bg-deep text-white' : 'border-line bg-white hover:border-faint')}
          >
            {t('All', 'Todos')}
          </Link>
          {topics.map((t) => (
            <Link
              key={t}
              href={`/dashboard/prompts?${new URLSearchParams({ r: rangeId, tema: t })}`}
              className={cx('rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors duration-200', sp.tema === t ? 'border-deep bg-deep text-white' : 'border-line bg-white hover:border-faint')}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      <Card i={3} className="overflow-hidden">
        {shown.length === 0 ? (
          <Empty title={t("You're not tracking any prompts yet", 'Aún no sigues ninguna pregunta')}>
            {t('Add your first one above or accept one of the suggestions.', 'Añade la primera arriba o acepta alguna de las sugerencias.')}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm num">
              <thead>
                <tr className="border-b border-line-2 bg-[#f8f8f6] text-left text-[11px] font-bold uppercase tracking-[0.08em] text-mute">
                  <th className="px-3 py-2.5 pl-6">{t('Prompt', 'Pregunta')}</th>
                  <th className="px-3 py-2.5">{t('Visibility', 'Visibilidad')}</th>
                  <th className="px-3 py-2.5 text-center">{t('Position', 'Posición')}</th>
                  <th className="px-3 py-2.5">{t('Platforms', 'Plataformas')}</th>
                  <th className="px-3 py-2.5">{t('Who shows up', 'Quién sale')}</th>
                  <th className="px-3 py-2.5 pr-6 text-right">{t('Active', 'Activa')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p, k) => {
                  const st = stats.get(p.id)
                  return (
                    <tr key={p.id} className={cx('anim-fade border-b border-line-2 align-top transition-colors last:border-0 hover:bg-[#f6f9f8]', !p.active && '[&>td]:opacity-55')} style={stagger(3 + Math.min(k, 8))}>
                      <td className="px-3 max-w-[360px] py-3.5 pl-6">
                        <Link href={`/dashboard/prompts/${p.id}?r=${rangeId}`} className="font-semibold leading-snug transition-colors hover:text-brand">
                          {p.text}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-mute">
                          {p.topic && <Badge>{p.topic}</Badge>}
                          {st?.lastDay ? (
                            <span>{t(`Last answer: ${fmtDay(st.lastDay, undefined, lang)}`, `Última respuesta: ${fmtDay(st.lastDay, undefined, lang)}`)}</span>
                          ) : (
                            <span>{t('Not tracked yet', 'Sin medir todavía')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {st?.searches ? (
                          <div className="flex items-center gap-2">
                            <Bar value={st.visibility} className="w-20" i={Math.min(k, 8)} />
                            <span className="text-[13px] font-semibold num">{pct(st.visibility, 0, lang)}</span>
                          </div>
                        ) : (
                          <span className="text-[13px] text-faint">{t('No data', 'Sin datos')}</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center text-[13px] num">{st?.avgPosition ? dec1(st.avgPosition, lang) : <span className="text-faint">{t('No data', 'Sin datos')}</span>}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex gap-1">
                          {plats.map((pl) => {
                            const e = st?.byEngine[pl.id]
                            const hit = e && e.hits > 0
                            return (
                              <span key={pl.id} className={cx('rounded-full transition-transform hover:scale-110', !e ? 'opacity-25' : hit ? 'ring-2 ring-brand-2/20' : 'opacity-50 grayscale')} title={`${pl.name}: ${!e ? t('not tracked', 'sin medir') : hit ? t(`you appear in ${e.hits} of ${e.searches}`, `sales en ${e.hits} de ${e.searches}`) : t('not mentioned', 'no sales')}`}>
                                <PlatformDot id={pl.id} size={22} />
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex max-w-[240px] flex-wrap gap-1">
                          {(st?.topBrands ?? []).slice(0, 3).map((b) => (
                            <span key={b.key} className={cx('rounded-md px-1.5 py-0.5 text-[12px] font-semibold', b.own ? 'bg-deep text-white' : 'bg-line-2 text-ink-2')}>
                              {b.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <form action={togglePromptAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="active" value={p.active ? '0' : '1'} />
                            <button
                              className={cx('relative h-5 w-9 rounded-full transition-colors', p.active ? 'bg-brand-2' : 'bg-line')}
                              aria-label={p.active ? t('Pause prompt', 'Pausar pregunta') : t('Activate prompt', 'Activar pregunta')}
                              disabled={!p.active && full}
                            >
                              <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200', p.active ? 'left-[18px]' : 'left-0.5')} />
                            </button>
                          </form>
                          <form action={deletePromptAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton
                              message={t('Delete this prompt? It stops being tracked; its past answers stay in your history.', '¿Borrar esta pregunta? Deja de medirse; sus respuestas anteriores se quedan en el historial.')}
                              className="rounded-md p-1.5 text-faint transition-colors hover:bg-line-2 hover:text-bad"
                              aria-label={t('Delete prompt', 'Borrar pregunta')}
                              title={t('Delete prompt', 'Borrar pregunta')}
                            >
                              <IconTrash size={15} />
                            </ConfirmButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card i={4} className="mt-4">
        <CardHeader
          title={t('Suggestions', 'Sugerencias')}
          hint={t('Prompts you might want to track. Accept the ones you want to follow.', 'Preguntas que podrían interesarte. Acepta las que quieras seguir.')}
          right={<MoreSuggestionsButton />}
        />
        {suggestions.length ? (
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {suggestions.map((s, k) => (
              <li key={s.id} className="anim-fade flex items-start justify-between gap-3 px-6 py-3 transition-colors hover:bg-[#f6f9f8]" style={stagger(4 + Math.min(k, 8))}>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold leading-snug">{s.text}</div>
                  <div className="mt-0.5 text-[12px] text-mute">
                    {s.topic}
                    {s.why ? ` · ${s.why}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <form action={acceptSuggestionAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-[12.5px] font-semibold transition-colors hover:border-faint hover:bg-line-2 hover:text-ink disabled:opacity-40" disabled={full} title={full ? t("You've reached your plan's limit", 'Has llegado al límite de tu plan') : t('Track this prompt', 'Seguir esta pregunta')}>
                      <IconCheck size={14} /> {t('Track', 'Seguir')}
                    </button>
                  </form>
                  <form action={dismissSuggestionAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="rounded-lg p-1.5 text-faint transition-colors hover:bg-line-2 hover:text-ink" aria-label={t('Dismiss', 'Descartar')}>
                      <IconX size={15} />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 pb-6 text-sm text-mute">
            {t('No pending suggestions. Click “Suggest more” and we’ll propose new prompts.', 'No hay sugerencias pendientes. Pulsa «Sugerir más» y te proponemos preguntas nuevas.')}
          </p>
        )}
      </Card>
    </>
  )
}
