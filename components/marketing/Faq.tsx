import Link from 'next/link'
import { IconChevron } from '@/components/icons'
import { cx } from '@/components/ui'
import { pick, type Lang } from '@/lib/i18n-shared'
import type { FaqItem } from './faqData'

// Acordeón de preguntas con <details>: accesible y sin JavaScript.

export function Faq({ items, lang, className }: { items: FaqItem[]; lang: Lang; className?: string }) {
  return (
    <div className={cx('divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-white', className)}>
      {items.map((item) => (
        <details key={item.id} id={`q-${item.id}`} className="group scroll-mt-28">
          <summary className="flex items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-bg sm:px-7">
            <span className="text-[16px] font-bold leading-snug tracking-[-0.01em] text-ink">{pick(item.q, lang)}</span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line-2 text-ink-2 transition-transform group-open:rotate-180">
              <IconChevron size={16} />
            </span>
          </summary>
          <div className="space-y-3 px-5 pb-6 text-[15px] leading-relaxed text-ink-2 sm:px-7">
            {item.a.map((p, i) => (
              <p key={i}>{pick(p, lang)}</p>
            ))}
            {item.link && (
              <p>
                <Link href={item.link.href} className="font-semibold text-brand underline-offset-4 hover:underline">
                  {pick(item.link.label, lang)}
                </Link>
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}

/** Datos estructurados FAQPage para las preguntas que se muestran. */
export function FaqJsonLd({ items, lang }: { items: FaqItem[]; lang: Lang }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: pick(item.q, lang),
      acceptedAnswer: { '@type': 'Answer', text: item.a.map((p) => pick(p, lang)).join(' ') },
    })),
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
