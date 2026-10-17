import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IconArrow } from '@/components/icons'
import { AnswerCard } from '@/components/panel/AnswerCard'
import { dec1, quote } from '@/components/panel/format'
import { RangePicker } from '@/components/panel/RangePicker'
import { Badge, Bar, Card, Empty, pct, PlatformDot, StatTile, stagger } from '@/components/ui'
import { platforms } from '@/lib/engines'
import { pageCtx } from '@/lib/guard'
import { getT } from '@/lib/i18n'
import { answersList, parseRange, promptStats } from '@/lib/metrics'
import * as repo from '@/lib/repo'
import { editPromptAction } from '../../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Prompt', 'Pregunta') }
}

export default async function PromptDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const prompt = repo.promptById(ws.id, Number(id))
  if (!prompt) notFound()
  const rangeId = parseRange(sp.r)
  const st = promptStats(ws, rangeId).get(prompt.id)
  const brands = repo.trackedBrands(ws)
  const { items } = answersList(ws, { rangeId, promptId: prompt.id, limit: 40, includeErrors: true })
  const plats = platforms().filter((p) => p.available)

  return (
    <>
      <Link href={`/dashboard/prompts?r=${rangeId}`} className="group anim-fade mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-mute transition-colors hover:text-ink">
        <IconArrow size={14} className="rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5" /> Prompts
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="anim-rise max-w-3xl">
          <div className="mb-2 flex items-center gap-2">
            {prompt.topic && <Badge>{prompt.topic}</Badge>}
            {!prompt.active && <Badge tone="warn">{t('Paused', 'En pausa')}</Badge>}
          </div>
          <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">{quote(prompt.text, lang)}</h1>
          <details className="mt-2">
            <summary className="text-[13px] font-semibold text-brand transition-opacity hover:opacity-80">{t('Edit prompt', 'Editar pregunta')}</summary>
            <form action={editPromptAction} className="mt-2 flex animate-[p-rise_0.2s_ease-out_both] flex-col gap-2 motion-reduce:animate-none sm:flex-row">
              <input type="hidden" name="id" value={prompt.id} />
              <input name="text" defaultValue={prompt.text} className="h-10 flex-1 rounded-xl border border-line bg-white px-3 text-sm transition-colors focus:border-brand-2 focus:outline-none" />
              <input name="topic" defaultValue={prompt.topic} className="h-10 w-40 rounded-xl border border-line bg-white px-3 text-sm transition-colors focus:border-brand-2 focus:outline-none" />
              <button className="h-10 rounded-xl bg-deep px-4 text-sm font-semibold text-white transition-colors hover:bg-deep-2">{t('Save', 'Guardar')}</button>
            </form>
          </details>
        </div>
        <div className="anim-fade relative z-20" style={stagger(1)}>
          <RangePicker current={rangeId} base={`/dashboard/prompts/${prompt.id}`} lang={lang} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile i={1} label={t('Visibility', 'Visibilidad')} value={st?.searches ? pct(st.visibility, 0, lang) : t('No data', 'Sin datos')}>
          {st?.searches ? <Bar value={st.visibility} className="mt-2" i={1} /> : null}
        </StatTile>
        <StatTile i={2} label={t('Avg. position', 'Posición media')} value={st?.avgPosition ? dec1(st.avgPosition, lang) : t('No data', 'Sin datos')} />
        <StatTile i={3} label={t('Answers', 'Respuestas')} value={st?.searches ?? 0} />
        <div className="card anim-rise p-4" style={stagger(4)}>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-mute">{t('You appear in', 'Sales en')}</div>
          <div className="flex flex-wrap gap-1.5">
            {plats.map((p) => {
              const e = st?.byEngine[p.id]
              return (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2 text-[12px] font-semibold num">
                  <PlatformDot id={p.id} size={16} />
                  {e ? `${e.hits}/${e.searches}` : '0/0'}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <h2 className="anim-fade mb-3 text-[17px] font-bold tracking-[-0.01em]" style={stagger(5)}>
        {t('Answers', 'Respuestas')}
      </h2>
      {items.length ? (
        <div className="space-y-4">
          {items.map((a, k) =>
            a.error ? (
              <div key={a.id} className="card anim-rise flex items-center gap-3 px-6 py-3 text-[13px] text-mute" style={stagger(6 + Math.min(k, 6))}>
                <PlatformDot id={a.engine} size={18} />
                {t("We couldn't get the answer for this day. It will be retried on the next run.", 'No se pudo obtener la respuesta de este día. Se reintenta en la próxima medición.')}
              </div>
            ) : (
              <AnswerCard key={a.id} a={a} brands={brands} showPrompt={false} lang={lang} i={6 + k} />
            ),
          )}
        </div>
      ) : (
        <Card i={6}>
          <Empty title={t('No answers in this period', 'Sin respuestas en este periodo')}>
            {t('This prompt will be tracked in the next weekly run, or right now with “Run now”.', 'Esta pregunta se medirá en la próxima medición semanal o ahora mismo con «Medir ahora».')}
          </Empty>
        </Card>
      )}
    </>
  )
}
