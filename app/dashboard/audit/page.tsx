import type { Metadata } from 'next'
import Link from 'next/link'
import { ScoreRing } from '@/components/charts'
import { IconCheck, IconInfo, IconX } from '@/components/icons'
import { AuditForm } from '@/components/panel/Forms'
import { Bar, Card, CardHeader, cx, Empty, fmtDate, PageHeader, stagger } from '@/components/ui'
import { auditById, auditsOf, GROUP_LABEL, type CheckGroup, type CheckStatus } from '@/lib/audit'
import { requireCtx } from '@/lib/auth'
import { getT, pick, type Lang } from '@/lib/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('AI Site Audit', 'Auditoría IA') }
}

const ICON: Record<CheckStatus, { el: React.ReactNode; box: string; en: string; es: string }> = {
  ok: { el: <IconCheck size={14} />, box: 'border border-line bg-white text-good', en: 'Pass', es: 'Correcto' },
  aviso: { el: <IconInfo size={14} />, box: 'border border-line bg-white text-warn', en: 'Needs work', es: 'Mejorable' },
  fallo: { el: <IconX size={14} />, box: 'border border-line bg-white text-bad', en: 'Fail', es: 'Falla' },
}

/** Las auditorías antiguas guardaban el nombre del grupo en español en vez de la clave. */
function groupTitle(g: string, lang: Lang): string {
  const label = GROUP_LABEL[g as CheckGroup]
  return label ? pick(label, lang) : g
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams
  // La auditoría es gratis: funciona aunque la prueba haya caducado.
  const { workspace: ws } = await requireCtx()
  const { lang, t } = await getT()
  const history = auditsOf(ws.id)
  const current = sp.id ? auditById(ws.id, Number(sp.id)) : history[0] ?? null
  const groups = current ? [...new Set(current.results.map((r) => r.group))] : []

  return (
    <>
      <PageHeader
        title={t('AI Site Audit', 'Auditoría IA')}
        hint={t(
          'We check 18 points that decide whether AI assistants can read, understand and cite your website.',
          'Revisamos 18 puntos que deciden si los asistentes de IA pueden leer, entender y citar tu web.',
        )}
      />
      <Card i={1} className="mb-4">
        <CardHeader title={t('Audit a website', 'Auditar una web')} hint={t("Your site or a competitor's. It takes a few seconds.", 'Tu web o la de un competidor. Tarda unos segundos.')} />
        <div className="px-6 pb-6">
          <AuditForm defaultUrl={ws.domain} />
        </div>
      </Card>

      {!current && (
        <Card i={2}>
          <Empty title={t('No audits yet', 'Aún no hay auditorías')}>
            {t('Enter a website above to get its score and a list of fixes in a few seconds.', 'Escribe una web arriba y en unos segundos tendrás su nota y la lista de arreglos.')}
          </Empty>
        </Card>
      )}

      {current && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card i={2} className="flex flex-col items-center p-6 text-center">
              <ScoreRing score={current.score} lang={lang} />
              <div className="mt-3 break-all text-[14px] font-bold">{current.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</div>
              <div className="text-[12.5px] text-mute">{fmtDate(current.createdAt, lang)}</div>
              <div className="mt-4 grid w-full grid-cols-3 gap-2 text-[12px]">
                {(['ok', 'aviso', 'fallo'] as const).map((s, k) => (
                  <div key={s} className={cx('anim-rise rounded-lg py-2', ICON[s].box)} style={stagger(4 + k)}>
                    <div className="text-[18px] font-extrabold num">{current.results.filter((r) => r.status === s).length}</div>
                    {ICON[s][lang]}
                  </div>
                ))}
              </div>
            </Card>
            {history.length > 1 && (
              <Card i={3}>
                <div className="px-6 pb-2 pt-4 text-[11px] font-bold uppercase tracking-[0.07em] text-mute">{t('Previous audits', 'Auditorías anteriores')}</div>
                <ul className="px-2 pb-2">
                  {history.map((h) => (
                    <li key={h.id}>
                      <Link href={`/dashboard/audit?id=${h.id}`} className={cx('flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-line-2', h.id === current.id && 'bg-white font-semibold text-ink ring-1 ring-line')}>
                        <span className="min-w-0 truncate">{h.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                        <span className={cx('rounded-full px-2 py-px text-[12px] font-bold num', h.score >= 75 ? 'bg-white text-good ring-1 ring-inset ring-line' : h.score >= 50 ? 'bg-white text-warn ring-1 ring-inset ring-line' : 'bg-white text-bad ring-1 ring-inset ring-line')}>{h.score}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            {groups.map((g, k) => {
              const items = current.results.filter((r) => r.group === g)
              const ok = items.filter((r) => r.status === 'ok').length
              return (
                <Card key={g} i={3 + k}>
                  <CardHeader
                    title={groupTitle(g, lang)}
                    right={
                      <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-mute num">
                        <Bar value={(ok / Math.max(1, items.length)) * 100} className="w-16" color={ok === items.length ? '#047857' : '#00a38c'} i={3 + k} />
                        {ok}/{items.length}
                      </span>
                    }
                  />
                  <ul className="divide-y divide-line-2 border-t border-line-2">
                    {items.map((r, n) => (
                      <li key={r.id} className="anim-fade flex gap-3 px-6 py-3.5 transition-colors hover:bg-[#f6f9f8]" style={stagger(Math.min(4 + k + n, 12))}>
                        <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', ICON[r.status].box)}>{ICON[r.status].el}</span>
                        <div className="min-w-0">
                          <div className="text-[14px] font-bold">{pick(r.label, lang)}</div>
                          <div className="text-[13px] text-ink-2">{pick(r.detail, lang)}</div>
                          {r.status !== 'ok' && <div className="mt-1 text-[13px] text-mute">{pick(r.fix, lang)}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
