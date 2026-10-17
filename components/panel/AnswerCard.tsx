import Link from 'next/link'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { answerHtml } from '@/lib/markdown'
import type { AnswerView } from '@/lib/metrics'
import type { TrackedBrand } from '@/lib/types'
import { IconArrow, IconExternal } from '../icons'
import { Badge, BrandAvatar, cx, fmtDay, PLATFORM_META, PlatformDot, stagger } from '../ui'
import { quote } from './format'

const SENT: Record<string, { en: string; es: string; tone: 'good' | 'neutral' | 'bad' }> = {
  positivo: { en: 'Positive', es: 'Positivo', tone: 'good' },
  neutro: { en: 'Neutral', es: 'Neutro', tone: 'neutral' },
  negativo: { en: 'Negative', es: 'Negativo', tone: 'bad' },
}

export function AnswerCard({
  a,
  brands,
  full = false,
  showPrompt = true,
  lang,
  i,
}: {
  a: AnswerView
  brands: TrackedBrand[]
  full?: boolean
  showPrompt?: boolean
  lang: Lang
  /** Posición en la lista, para la entrada escalonada. */
  i?: number
}) {
  const t = makeT(lang)
  const ownKey = brands[0]?.key
  const tracked = new Map(brands.map((b) => [b.key, b]))
  const marks = brands.flatMap((b) => [b.name, ...b.aliases].map((term) => ({ term, own: b.own })))
  const ownMention = a.mentions.find((m) => m.brandKey === ownKey)
  const platform = PLATFORM_META[a.engine]?.name ?? a.engine

  return (
    <article className={cx('card overflow-hidden transition-[border-color] duration-200 hover:border-faint/70!', i !== undefined && 'anim-rise')} style={i === undefined ? undefined : stagger(Math.min(i, 9))}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-2 bg-gradient-to-b from-[#fbfcfc] to-white px-6 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-mute">
            <PlatformDot id={a.engine} size={22} />
            <span className="font-semibold text-ink-2">{platform}</span>
            <span>·</span>
            <span>{fmtDay(a.day, { day: 'numeric', month: 'long' }, lang)}</span>
          </div>
          {showPrompt && (
            <Link href={`/dashboard/prompts/${a.promptId}`} className="mt-1.5 block text-[15px] font-bold leading-snug transition-colors hover:text-brand">
              {quote(a.promptText, lang)}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {a.empty ? (
            <Badge>{t('No AI answer', 'Sin respuesta de IA')}</Badge>
          ) : ownMention ? (
            <Badge tone="brand">
              {ownMention.direct ? t(`You're #${ownMention.rank}`, `Sales en el puesto ${ownMention.rank}`) : t('Cited as a source', 'Te citan como fuente')}
            </Badge>
          ) : (
            <Badge tone="warn">{t('Not mentioned', 'No sales')}</Badge>
          )}
        </div>
      </header>

      {a.empty ? (
        <p className="px-6 py-4 text-sm text-mute">
          {a.engine === 'google'
            ? t("Google didn't show an AI Overview for this search that day.", 'Google no mostró un resumen de IA para esta búsqueda ese día.')
            : t('The platform returned no text.', 'La plataforma no devolvió texto.')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 px-6 py-4">
            {full ? (
              <div className="prose-answer text-[14px] leading-relaxed text-ink-2" dangerouslySetInnerHTML={{ __html: answerHtml(a.text, marks) }} />
            ) : (
              <details className="group">
                <summary className="list-none">
                  <div className="prose-answer relative max-h-40 overflow-hidden text-[14px] leading-relaxed text-ink-2 group-open:max-h-none">
                    <div dangerouslySetInnerHTML={{ __html: answerHtml(a.text, marks) }} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white group-open:hidden" />
                  </div>
                  <span className="mt-2 inline-block text-[12.5px] font-semibold text-brand group-open:hidden">{t('Read full answer', 'Leer respuesta completa')}</span>
                </summary>
              </details>
            )}
          </div>
          <aside className="border-t border-line-2 px-6 py-4 lg:border-l lg:border-t-0">
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-mute">{t('Brands in the answer', 'Marcas en la respuesta')}</div>
            {a.mentions.length ? (
              <ol className="space-y-2">
                {a.mentions.map((m) => {
                  const tb = tracked.get(m.brandKey)
                  return (
                  <li key={m.brandKey} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className={cx('flex min-w-0 items-center gap-2', m.brandKey === ownKey ? 'font-bold text-brand' : tb ? 'font-semibold' : 'text-ink-2')}>
                      {m.direct && <span className="w-4 shrink-0 text-right text-[12px] font-semibold text-faint num">{m.rank}</span>}
                      {tb && <BrandAvatar name={tb.name} domain={tb.domain || undefined} size={20} />}
                      <span className="truncate">{m.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {!m.direct && <Badge>{t('Indirect', 'Indirecta')}</Badge>}
                      {m.direct && m.sentiment !== 'neutro' && <Badge tone={SENT[m.sentiment].tone}>{SENT[m.sentiment][lang]}</Badge>}
                    </span>
                  </li>
                  )
                })}
              </ol>
            ) : (
              <p className="text-[13px] text-mute">{t('No brands named.', 'No nombra ninguna marca.')}</p>
            )}
            {a.citations.length > 0 && (
              <>
                <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-mute">
                  {t('Cited sources', 'Fuentes citadas')} ({a.citations.length})
                </div>
                <ul className="space-y-1">
                  {a.citations.slice(0, full ? 50 : 6).map((c) => (
                    <li key={c.url}>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className={cx('group/link flex items-center gap-1.5 text-[12.5px] hover:text-brand', c.brandKey === ownKey ? 'font-bold text-brand' : 'text-ink-2')}
                        title={c.title || c.url}
                      >
                        <BrandAvatar name={c.domain} domain={c.domain} size={16} />
                        <span className="truncate">{c.domain}</span>
                        <IconExternal size={12} className="shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100" />
                      </a>
                    </li>
                  ))}
                  {!full && a.citations.length > 6 && <li className="text-[12px] text-mute">{t(`and ${a.citations.length - 6} more`, `y ${a.citations.length - 6} más`)}</li>}
                </ul>
              </>
            )}
            {full && a.searchQueries.length > 0 && (
              <>
                <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-mute">{t('Searches the AI ran', 'Búsquedas que hizo la IA')}</div>
                <ul className="space-y-1 text-[12.5px] text-ink-2">
                  {a.searchQueries.map((q, i) => (
                    <li key={i}>{quote(q, lang)}</li>
                  ))}
                </ul>
              </>
            )}
            {!full && (
              <Link
                href={`/dashboard/searches/${a.id}`}
                className="group mt-4 inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-faint hover:bg-line-2 hover:text-ink"
              >
                {t('Open details', 'Abrir detalle')}
                <IconArrow size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            )}
          </aside>
        </div>
      )}
    </article>
  )
}
