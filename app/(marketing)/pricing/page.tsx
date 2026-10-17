import type { Metadata } from 'next'
import Link from 'next/link'
import { Faq } from '@/components/marketing/Faq'
import { faqByIds } from '@/components/marketing/faqData'
import { Container, SOFT_TOP, SectionHeading } from '@/components/marketing/parts'
import { PlanComparison } from '@/components/marketing/PlanComparison'
import { Pricing } from '@/components/marketing/Pricing'
import { getT } from '@/lib/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    title: t('Pricing', 'Precios'),
    description: t(
      'Placton plans from $59 a month: 20, 75 or 250 prompts tracked every week on ChatGPT, Claude, Google AI and Perplexity. 7-day free trial, no card required.',
      'Planes de Placton desde 59 $ al mes: 20, 75 o 250 prompts medidos cada semana en ChatGPT, Claude, Google AI y Perplexity. Prueba 7 días gratis, sin tarjeta.',
    ),
    alternates: { canonical: '/pricing' },
  }
}

export default async function PricingPage() {
  const { lang, t } = await getT()
  const faq = faqByIds(['trial', 'cancel', 'invoices', 'team', 'prompt'])

  return (
    <>
      <section
        aria-labelledby="pricing-title"
        className="pb-20 pt-32 sm:pb-28 sm:pt-40"
        style={SOFT_TOP}
      >
        <Container>
          <Pricing as="h1" />
        </Container>
      </section>

      <section aria-labelledby="compare" className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            id="compare"
            title={t('Compare plans', 'Compara los planes')}
            intro={t(
              'The free trial includes almost everything, so you can see real data about your brand before you pay.',
              'La prueba gratis incluye casi todo, para que veas datos reales de tu marca antes de pagar.',
            )}
          />
          <div className="mt-10">
            <PlanComparison lang={lang} />
          </div>
        </Container>
      </section>

      <section aria-labelledby="billing-faq" className="py-20 sm:py-24">
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-16">
          <div>
            <SectionHeading id="billing-faq" title={t('Questions about plans', 'Dudas sobre los planes')} />
            <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-mute">
              {t('More questions? Read the ', '¿Más dudas? Lee todas las ')}
              <Link href="/faqs" className="font-semibold text-brand underline underline-offset-4">
                {t('full FAQs', 'preguntas frecuentes')}
              </Link>
              {t(' or ', ' o ')}
              <Link href="/contact" className="font-semibold text-brand underline underline-offset-4">
                {t('contact us', 'escríbenos')}
              </Link>
              .
            </p>
          </div>
          <Faq items={faq} lang={lang} />
        </Container>
      </section>
    </>
  )
}
