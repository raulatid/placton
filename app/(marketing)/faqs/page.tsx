import type { Metadata } from 'next'
import Link from 'next/link'
import { Faq, FaqJsonLd } from '@/components/marketing/Faq'
import { ALL_FAQ, FAQ_GROUPS } from '@/components/marketing/faqData'
import { Container, PageHero, pillDark } from '@/components/marketing/parts'
import { getT } from '@/lib/i18n'
import { pick } from '@/lib/i18n-shared'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    title: t('FAQs', 'Preguntas frecuentes'),
    description: t(
      'How Placton works, what direct and indirect mentions and cited URLs are, which AI platforms we track, the free trial, cancelling, invoices and your team.',
      'Cómo funciona Placton, qué son las menciones directas e indirectas y las citas de URL, qué IA analizamos, la prueba gratis, la cancelación, las facturas y tu equipo.',
    ),
    alternates: { canonical: '/faqs' },
  }
}

export default async function FaqsPage() {
  const { lang, t } = await getT()

  return (
    <>
      <PageHero
        title={t('Frequently asked questions', 'Preguntas frecuentes')}
        intro={t(
          'How Placton works, what we measure, how billing works and how to manage your account.',
          'Cómo funciona Placton, qué medimos, cómo se paga y cómo se gestiona tu cuenta.',
        )}
      />

      <section className="pb-20 sm:pb-28">
        <Container narrow>
          <nav aria-label={t('Topics', 'Temas')} className="flex flex-wrap gap-2">
            {FAQ_GROUPS.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="rounded-full border border-line bg-white px-4 py-2 text-[14px] font-semibold text-ink-2 transition-colors hover:border-faint hover:text-ink"
              >
                {pick(g.title, lang)}
              </a>
            ))}
          </nav>

          <div className="mt-12 space-y-14">
            {FAQ_GROUPS.map((g) => (
              <section key={g.id} id={g.id} aria-labelledby={`${g.id}-title`} className="scroll-mt-28">
                <h2 id={`${g.id}-title`} className="mb-5 text-[24px] font-extrabold tracking-[-0.03em] text-ink">
                  {pick(g.title, lang)}
                </h2>
                <Faq items={g.items} lang={lang} />
              </section>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-[24px] border border-line bg-white p-6 sm:flex-row sm:items-center sm:p-7">
            <div>
              <p className="text-[17px] font-bold text-ink">{t("Can't find your answer?", '¿No encuentras tu respuesta?')}</p>
              <p className="mt-1 text-[14px] text-mute">{t('Tell us what you need and we will reply by email.', 'Cuéntanos tu duda y te respondemos por correo.')}</p>
            </div>
            <Link href="/contact" className={pillDark}>
              {t('Contact us', 'Escríbenos')}
            </Link>
          </div>
        </Container>
      </section>

      <FaqJsonLd items={ALL_FAQ} lang={lang} />
    </>
  )
}
