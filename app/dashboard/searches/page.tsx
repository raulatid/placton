import type { Metadata } from 'next'
import Link from 'next/link'
import { IconGlobe } from '@/components/icons'
import { AnswerCard } from '@/components/panel/AnswerCard'
import { QuerySelect } from '@/components/panel/QuerySelect'
import { RangePicker } from '@/components/panel/RangePicker'
import { Card, Empty, PageHeader, pagerBtn, PlatformDot, stagger } from '@/components/ui'
import { platforms } from '@/lib/engines'
import { pageCtx } from '@/lib/guard'
import { getT } from '@/lib/i18n'
import { answersList, parseRange } from '@/lib/metrics'
import * as repo from '@/lib/repo'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Searches', 'Búsquedas') }
}

const PAGE = 15

export default async function SearchesPage({ searchParams }: { searchParams: Promise<{ r?: string; plataforma?: string; prompt?: string; p?: string }> }) {
  const sp = await searchParams
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const rangeId = parseRange(sp.r)
  const page = Math.max(1, Number(sp.p) || 1)
  const prompts = repo.promptsOf(ws.id)
  const brands = repo.trackedBrands(ws)
  const plats = platforms().filter((p) => p.available)
  const { total, items } = answersList(ws, {
    rangeId,
    engine: sp.plataforma || undefined,
    promptId: sp.prompt ? Number(sp.prompt) : undefined,
    limit: PAGE,
    offset: (page - 1) * PAGE,
  })
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const link = (p: number) => {
    const q = new URLSearchParams({ r: rangeId, p: String(p) })
    if (sp.plataforma) q.set('plataforma', sp.plataforma)
    if (sp.prompt) q.set('prompt', sp.prompt)
    return `/dashboard/searches?${q}`
  }

  return (
    <>
      <PageHeader
        title={t('Searches', 'Búsquedas')}
        hint={t('Every answer the AI assistants gave to your prompts, in full and unedited.', 'Todas las respuestas que han dado las IA a tus preguntas, completas y sin retocar.')}
        right={<RangePicker current={rangeId} base="/dashboard/searches" extra={{ plataforma: sp.plataforma, prompt: sp.prompt }} lang={lang} />}
      />
      <div className="anim-fade relative z-10 mb-4 flex flex-wrap items-center gap-2" style={stagger(1)}>
        <QuerySelect
          name="plataforma"
          label={t('Platform', 'Plataforma')}
          value={sp.plataforma ?? ''}
          options={[
            { value: '', label: t('All platforms', 'Todas las plataformas'), icon: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-line-2 text-mute"><IconGlobe size={12} /></span> },
            ...plats.map((p) => ({ value: p.id, label: p.name, icon: <PlatformDot id={p.id} size={20} /> })),
          ]}
        />
        <QuerySelect
          name="prompt"
          className="min-w-[260px] max-w-full"
          label={t('Prompt', 'Pregunta')}
          value={sp.prompt ?? ''}
          options={[{ value: '', label: t('All prompts', 'Todas las preguntas') }, ...prompts.map((p) => ({ value: String(p.id), label: p.text.length > 70 ? `${p.text.slice(0, 70)}…` : p.text }))]}
        />
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[12.5px] font-semibold text-mute num">{t(`${total} answers`, `${total} respuestas`)}</span>
      </div>
      {items.length ? (
        <div className="space-y-4">
          {items.map((a, k) => (
            <AnswerCard key={a.id} a={a} brands={brands} lang={lang} i={k + 2} />
          ))}
        </div>
      ) : (
        <Card i={2}>
          <Empty title={t('No answers match these filters', 'No hay respuestas con estos filtros')}>
            {t('Change the period or wait for the next weekly run.', 'Cambia el periodo o espera a la próxima medición semanal.')}
          </Empty>
        </Card>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-mute num">
            {t(`Page ${page} of ${pages}`, `Página ${page} de ${pages}`)}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={link(page - 1)} className={pagerBtn}>
                {t('Previous', 'Anterior')}
              </Link>
            )}
            {page < pages && (
              <Link href={link(page + 1)} className={pagerBtn}>
                {t('Next', 'Siguiente')}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  )
}
