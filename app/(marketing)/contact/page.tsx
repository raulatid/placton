import type { Metadata } from 'next'
import Link from 'next/link'
import { isTopic } from '@/components/marketing/contact'
import { ContactForm } from '@/components/marketing/ContactForm'
import { Container, SOFT_TOP, SectionHeading } from '@/components/marketing/parts'
import { IconHelp, IconMail } from '@/components/icons'
import { getT } from '@/lib/i18n'
import { sendContact } from './actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    title: t('Contact', 'Contacto'),
    description: t(
      'Write to the Placton team about sales, support, billing or anything else. We reply by email.',
      'Escribe al equipo de Placton: ventas, soporte, facturación o cualquier otra duda. Te respondemos por correo.',
    ),
    alternates: { canonical: '/contact' },
  }
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await getT()
  const { topic } = await searchParams
  const wanted = typeof topic === 'string' ? topic : ''
  const defaultTopic = isTopic(wanted) ? wanted : ''

  return (
    <section
      className="pb-20 pt-32 sm:pb-28 sm:pt-40"
      style={SOFT_TOP}
    >
      <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
        <div>
          <SectionHeading
            as="h1"
            title={t("Let's talk", 'Hablemos')}
            intro={t(
              'Questions about plans, a problem with your account or an invoice that does not add up? Write to us and we will reply by email.',
              '¿Dudas sobre los planes, un problema con tu cuenta o una factura que no cuadra? Escríbenos y te responderemos por correo.',
            )}
          />

          <ul className="mt-9 space-y-6">
            <li className="flex gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink">
                <IconMail size={20} />
              </span>
              <div>
                <p className="text-[15px] font-bold text-ink">{t('By email', 'Por correo')}</p>
                <a href="mailto:contact@placton.tech" className="text-[15px] text-brand underline-offset-4 hover:underline">
                  contact@placton.tech
                </a>
                <p className="mt-1 text-[13.5px] leading-relaxed text-mute">
                  {t(
                    'If you already use Placton, write from your account email so we can find you faster.',
                    'Si ya usas Placton, escríbenos desde el correo de tu cuenta para que te encontremos antes.',
                  )}
                </p>
              </div>
            </li>
            <li className="flex gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink">
                <IconHelp size={20} />
              </span>
              <div>
                <p className="text-[15px] font-bold text-ink">{t('Quick answers', 'Respuestas rápidas')}</p>
                <p className="text-[14px] leading-relaxed text-mute">
                  {t('Free trial, cancelling, invoices and teams: ', 'Prueba gratis, cancelación, facturas y equipo: ')}
                  <Link href="/faqs" className="font-semibold text-brand underline-offset-4 hover:underline">
                    {t('see the FAQs', 'mira las preguntas frecuentes')}
                  </Link>
                  .
                </p>
              </div>
            </li>
          </ul>
        </div>

        <ContactForm action={sendContact} defaultTopic={defaultTopic} />
      </Container>
    </section>
  )
}
