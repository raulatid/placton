import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IconArrow } from '@/components/icons'
import { AnswerCard } from '@/components/panel/AnswerCard'
import { pageCtx } from '@/lib/guard'
import { getT } from '@/lib/i18n'
import { answerById } from '@/lib/metrics'
import * as repo from '@/lib/repo'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Answer', 'Respuesta') }
}

export default async function AnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { workspace: ws } = await pageCtx()
  const { lang, t } = await getT()
  const a = answerById(ws, Number(id))
  if (!a) notFound()
  return (
    <>
      <Link href="/dashboard/searches" className="group anim-fade mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-mute transition-colors hover:text-ink">
        <IconArrow size={14} className="rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5" /> {t('Searches', 'Búsquedas')}
      </Link>
      <AnswerCard a={a} brands={repo.trackedBrands(ws)} full lang={lang} i={1} />
    </>
  )
}
