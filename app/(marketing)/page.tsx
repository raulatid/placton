import type { Metadata } from 'next'
import Link from 'next/link'
import { AuditCta } from '@/components/marketing/AuditCta'
import { Faq } from '@/components/marketing/Faq'
import { HOME_FAQ, faqByIds } from '@/components/marketing/faqData'
import { FeatureBlocks } from '@/components/marketing/FeatureBlocks'
import { Container, Plankton, pillWhite } from '@/components/marketing/parts'
import { PlatformLogo } from '@/components/marketing/PlatformLogo'
import { Pricing } from '@/components/marketing/Pricing'
import { HeroShot } from '@/components/marketing/HeroShot'
import { SeaRays, SeaSurface } from '@/components/marketing/SeaScene'
import { ToolsMarquee } from '@/components/marketing/ToolsMarquee'
import { IconArrow } from '@/components/icons'
import { getT } from '@/lib/i18n'
import { TRIAL_DAYS } from '@/lib/plans'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    title: { absolute: t('Placton · Make AI recommend your brand', 'Placton · Haz que la IA recomiende tu marca') },
    description: t(
      'Placton asks ChatGPT, Claude, Google AI and Perplexity what your customers ask, every day, and shows who appears, in what position and why. 7-day free trial, no card required.',
      'Placton pregunta cada día a ChatGPT, Claude, Google AI y Perplexity lo mismo que tus clientes y te enseña quién aparece, en qué puesto y por qué. Prueba 7 días gratis, sin tarjeta.',
    ),
    alternates: { canonical: '/' },
  }
}

// Degradado marino de la portada, en porcentajes del bloque (portada + captura):
// azul arriba, aguamarina hacia el horizonte y el color de la página al final,
// ya por detrás de la captura. No sobresale del bloque para no tapar lo de abajo.
const HERO_FADE: React.CSSProperties = {
  background:
    'linear-gradient(180deg, #2a78d6 0%, #3388d8 20%, #4aa6da 36%, #7bcfdc 50%, #b6eae2 62%, #dcf3ee 74%, #eef5f2 84%, #f2f4f3 92%)',
}

const HERO_PLATFORMS = [
  { id: 'chatgpt', name: 'ChatGPT' },
  { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'perplexity', name: 'Perplexity' },
  { id: 'grok', name: 'Grok' },
]

export default async function HomePage() {
  const { lang, t } = await getT()
  const faq = faqByIds(HOME_FAQ)

  return (
    <>
      {/* Portada + vista del producto sobre un mismo fondo: el degradado sigue por
          detrás de la ventana y se funde con la página, sin cortes. */}
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={HERO_FADE}>
          <SeaRays />
          <Plankton />
        </div>

        {/* Por encima del mar: la píldora de plataformas queda sobre el horizonte */}
        <section className="relative z-20">
          <Container className="relative pb-14 pt-36 text-center sm:pb-16 sm:pt-44 lg:pb-20 lg:pt-48">
            <h1
              className="anim-rise mx-auto max-w-4xl text-balance text-[42px] font-extrabold leading-[1.02] tracking-[-0.05em] text-white sm:text-[64px] lg:text-[80px]"
              style={{ '--i': 0, textShadow: '0 2px 30px rgba(4, 25, 28, 0.22)' } as React.CSSProperties}
            >
              {lang === 'es' ? (
                <>
                  Haz que la IA <span className="sm:block">recomiende tu marca</span>
                </>
              ) : (
                <>
                  Make AI recommend <span className="sm:block">your brand</span>
                </>
              )}
            </h1>
            <p
              className="anim-rise mx-auto mt-6 max-w-2xl text-pretty text-[17px] font-medium leading-relaxed text-white sm:text-[19px]"
              style={{ '--i': 1, textShadow: '0 1px 14px rgba(4, 25, 28, 0.35)' } as React.CSSProperties}
            >
              {t(
                'Every day, Placton asks the leading AI assistants the questions your customers ask, and shows you who appears, where and why.',
                'Cada día, Placton hace a los principales asistentes de IA las preguntas de tus clientes y te enseña quién aparece, en qué puesto y por qué.',
              )}
            </p>
            <div className="anim-rise mt-10 flex flex-col items-center gap-3.5" style={{ '--i': 2 } as React.CSSProperties}>
              <Link href="/signup" className={pillWhite}>
                {t(`Start your ${TRIAL_DAYS}-day free trial`, `Empieza tu prueba de ${TRIAL_DAYS} días`)}
                <IconArrow size={18} />
              </Link>
              <p className="text-[13.5px] font-semibold text-white/90" style={{ textShadow: '0 1px 10px rgba(4, 25, 28, 0.3)' }}>
                {t(`${TRIAL_DAYS} days free. No card required.`, `${TRIAL_DAYS} días gratis. Sin tarjeta.`)}
              </p>
            </div>
            <div className="anim-rise mt-9 flex justify-center" style={{ '--i': 3 } as React.CSSProperties}>
              <p className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-[22px] border border-white/70 bg-white/75 px-4 py-2 text-[13.5px] font-semibold text-ink-2 shadow-[0_10px_30px_-18px_rgba(4,25,28,0.45)] backdrop-blur-md sm:rounded-full sm:px-5">
                <span className="mr-0.5 text-mute">{t('Tracks', 'Mide')}</span>
                {HERO_PLATFORMS.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <PlatformLogo id={p.id} size={22} decorative />
                    {p.name}
                  </span>
                ))}
              </p>
            </div>
          </Container>
        </section>

        {/* Vista del producto, flotando sobre el mar */}
        <div className="relative z-10">
          <SeaSurface />
          <Container wide className="relative">
            <div className="anim-rise" style={{ '--i': 4 } as React.CSSProperties}>
              <HeroShot lang={lang} />
            </div>
          </Container>
        </div>
      </div>

      {/* Declaración */}
      <section aria-label={t('About Placton', 'Sobre Placton')} className="py-20 sm:py-32">
        <Container>
          <p className="max-w-4xl text-pretty text-[24px] font-bold leading-[1.3] tracking-[-0.025em] sm:text-[32px]">
            <span className="text-ink">
              {t(
                'AI assistants are quickly becoming the place where people discover brands.',
                'Los asistentes de IA se están convirtiendo en el sitio donde la gente descubre marcas.',
              )}
            </span>{' '}
            <span className="text-mute">
              {t(
                "When someone asks for a product, a service or a supplier, they get a short answer with a few names, and if yours isn't there you never find out. Placton shows where your brand appears, how you compare with your rivals and what to do next to show up more often.",
                'Cuando alguien pide un producto, un servicio o un proveedor, recibe una respuesta corta con unos pocos nombres y, si el tuyo no está, nunca te enteras. Placton te enseña dónde aparece tu marca, cómo quedas frente a tus rivales y qué hacer para salir más a menudo.',
              )}
            </span>
          </p>
        </Container>
      </section>

      <FeatureBlocks lang={lang} />

      <ToolsMarquee lang={lang} />

      <AuditCta lang={lang} />

      {/* Precios */}
      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-20 sm:py-28">
        <Container>
          <Pricing />
        </Container>
      </section>

      {/* Preguntas */}
      <section aria-labelledby="faq-title" className="border-t border-line py-20 sm:py-28">
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-16">
          <div>
            <h2 id="faq-title" className="text-balance text-[30px] font-extrabold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[44px]">
              {t('Frequently asked questions', 'Preguntas frecuentes')}
            </h2>
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
