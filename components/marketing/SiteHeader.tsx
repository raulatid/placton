import Link from 'next/link'
import { Suspense } from 'react'
import { IconArrow } from '@/components/icons'
import { LangSwitch } from '@/components/LangSwitch'
import { getT } from '@/lib/i18n'
import { MobileMenu } from './MobileMenu'
import { BrandLink, pillDark } from './parts'

// Barra de navegación flotante: una píldora blanca compacta, centrada y fija arriba.

export async function SiteHeader() {
  const { t } = await getT()
  const links = [
    { href: '/faqs', label: t('FAQs', 'Preguntas') },
    { href: '/pricing', label: t('Pricing', 'Precios') },
    { href: '/login', label: t('Log in', 'Entrar') },
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:pt-4">
      {/* Píldora compacta que abraza su contenido (a lo ancho solo en móvil) */}
      <div className="relative flex h-14 w-full max-w-[560px] items-center justify-between gap-2 rounded-full border border-black/[0.06] bg-white/95 pl-5 pr-1.5 shadow-[0_10px_30px_-14px_rgba(4,25,28,0.45)] backdrop-blur-md md:w-auto md:max-w-none md:justify-start md:gap-8 md:pl-6">
        <BrandLink label={t('Placton home', 'Placton, inicio')} />

        <nav aria-label={t('Main', 'Principal')} className="hidden items-center md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-2 text-[14px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Suspense fallback={null}>
            <LangSwitch />
          </Suspense>
          <Link href="/signup" className={pillDark}>
            {t('Get started', 'Prueba gratis')}
            <IconArrow size={16} />
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Link href="/signup" className={pillDark}>
            {t('Get started', 'Prueba gratis')}
            <IconArrow size={16} />
          </Link>
          <MobileMenu links={links} />
        </div>
      </div>
    </header>
  )
}
