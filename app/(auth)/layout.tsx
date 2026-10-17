import { Track } from '@/components/marketing/Track'
import Link from 'next/link'
import { LangSwitch } from '@/components/LangSwitch'
import { Logo } from '@/components/Logo'
import { getT } from '@/lib/i18n'

// Acceso: tarjeta centrada sobre fondo claro, con la navegación de la web
// arriba y los enlaces del pie debajo.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT()
  const links = [
    { href: '/pricing', label: t('Pricing', 'Precios') },
    { href: '/contact', label: t('Contact', 'Contacto') },
    { href: '/login', label: t('Log in', 'Entrar') },
    { href: '/signup', label: t('Sign up', 'Crear cuenta') },
    { href: '/faqs', label: t('FAQs', 'Preguntas') },
    { href: '/terms', label: t('Terms', 'Términos') },
    { href: '/privacy', label: t('Privacy', 'Privacidad') },
  ]
  return (
    <div className="flex min-h-screen flex-col bg-[#f1f4f3]">
      <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 text-[14px] font-semibold text-ink-2 sm:gap-2">
          <Link href="/faqs" className="hidden rounded-full px-3 py-1.5 hover:bg-white sm:inline">
            {t('FAQs', 'Preguntas')}
          </Link>
          <Link href="/pricing" className="hidden rounded-full px-3 py-1.5 hover:bg-white sm:inline">
            {t('Pricing', 'Precios')}
          </Link>
          <Link href="/login" className="rounded-full px-3 py-1.5 hover:bg-white">
            {t('Log in', 'Entrar')}
          </Link>
          <Link href="/signup" className="rounded-full bg-deep px-4 py-1.5 text-white hover:bg-deep-2">
            {t('Get started', 'Empezar')}
          </Link>
          <LangSwitch className="ml-1" />
        </nav>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pb-10 pt-6 sm:pt-12">{children}
        <Track /></main>
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-8 text-[13px] font-semibold text-mute">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-ink">
            {l.label}
          </Link>
        ))}
      </footer>
    </div>
  )
}
