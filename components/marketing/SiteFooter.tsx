import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { IconArrow } from '@/components/icons'
import { LangSwitch } from '@/components/LangSwitch'
import { getT } from '@/lib/i18n'
import { TRIAL_DAYS } from '@/lib/plans'
import { shotSrc } from './HeroShot'
import { CookieSettingsButton } from './Analytics'
import { BrandLink, Container, pillWhite } from './parts'

// Pie: bloque oscuro con las esquinas de arriba redondeadas. Dentro, una tarjeta
// con el degradado del mar (texto y botón a la izquierda, la captura del panel
// asomando a la derecha); debajo, logo, enlaces y la línea legal.

const CTA_BG: React.CSSProperties = {
  backgroundColor: '#2a78d6',
  backgroundImage: [
    'radial-gradient(70% 90% at 0% 0%, rgba(26, 86, 170, 0.9), transparent 70%)',
    'radial-gradient(60% 80% at 100% 0%, rgba(79, 182, 216, 0.85), transparent 70%)',
    'radial-gradient(70% 80% at 85% 100%, rgba(110, 240, 210, 0.75), transparent 70%)',
    'radial-gradient(50% 60% at 20% 100%, rgba(42, 120, 214, 0.9), transparent 70%)',
  ].join(', '),
}

export async function SiteFooter() {
  const { lang, t } = await getT()
  const links = [
    { href: '/', label: t('Home', 'Inicio') },
    { href: '/pricing', label: t('Pricing', 'Precios') },
    { href: '/contact', label: t('Contact', 'Contacto') },
    { href: '/login', label: t('Log in', 'Entrar') },
    { href: '/faqs', label: t('FAQs', 'Preguntas') },
  ]

  return (
    <footer className="mt-8 rounded-t-[28px] bg-deep text-white sm:rounded-t-[44px]">
      <Container wide className="pt-10 sm:pt-16">
        <div className="relative grid grid-cols-1 overflow-hidden rounded-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" style={CTA_BG}>
          <div className="relative z-10 px-7 py-10 sm:px-12 sm:py-14 lg:py-20">
            <h2 className="max-w-md text-balance text-[30px] font-extrabold leading-[1.06] tracking-[-0.04em] sm:text-[44px]">
              {t('Find out what AI tells your customers about you', 'Descubre qué le cuenta la IA a tus clientes sobre ti')}
            </h2>
            <p className="mt-4 max-w-md text-pretty text-[16px] leading-relaxed text-white/85">
              {t(
                'It takes a few minutes to set up, and during your free week you will see real answers about your brand.',
                'Se configura en unos minutos y durante tu semana gratis verás respuestas reales sobre tu marca.',
              )}
            </p>
            <Link href="/signup" className={`${pillWhite} mt-8`}>
              {t(`Start ${TRIAL_DAYS}-day free trial`, `Empieza ${TRIAL_DAYS} días gratis`)}
              <IconArrow size={18} />
            </Link>
          </div>
          {/* La captura sale por la derecha y por abajo, recortada por la tarjeta */}
          <div aria-hidden="true" className="relative h-[230px] sm:h-[320px] lg:h-auto">
            <Image
              src={shotSrc(lang)}
              alt=""
              width={2880}
              height={2000}
              sizes="(min-width: 1024px) 720px, 560px"
              className="absolute left-7 top-0 w-[560px] max-w-none rounded-[12px] shadow-[0_30px_70px_-25px_rgba(4,25,28,0.6)] ring-1 ring-white/30 sm:left-12 lg:left-0 lg:top-16 lg:w-[720px]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
          <BrandLink tone="dark" label={t('Placton home', 'Placton, inicio')} />
          <nav aria-label={t('Footer', 'Pie de página')}>
            <ul className="flex flex-wrap gap-x-7 gap-y-3">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[14px] font-semibold text-white/75 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 py-6 text-[13px] text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>© 2026 SELSPY AGENCY S. COOP. · Placton</span>
            <a href="mailto:contact@placton.tech" className="transition-colors hover:text-white">
              contact@placton.tech
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/terms#aviso-legal" className="transition-colors hover:text-white">
              {t('Legal notice', 'Aviso legal')}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              {t('Terms', 'Términos')}
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-white">
              {t('Privacy', 'Privacidad')}
            </Link>
            <CookieSettingsButton className="transition-colors hover:text-white" short />
            <Suspense fallback={null}>
              <LangSwitch tone="dark" />
            </Suspense>
          </div>
        </div>
      </Container>
    </footer>
  )
}
