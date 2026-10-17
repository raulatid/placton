'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'
import { IconMenu, IconX } from '@/components/icons'
import { LangSwitch } from '@/components/LangSwitch'
import { useT } from '@/components/LangProvider'

// Menú móvil con <details>: funciona sin JavaScript y se cierra solo al
// navegar o al pulsar un enlace.

export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const t = useT()
  const ref = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (ref.current) ref.current.open = false
  }, [pathname])

  function closeOnLink(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('a') && ref.current) ref.current.open = false
  }

  return (
    <details ref={ref} className="group">
      <summary className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-line-2">
        <span className="sr-only">{t('Menu', 'Menú')}</span>
        <IconMenu size={20} className="group-open:hidden" />
        <IconX size={20} className="hidden group-open:block" />
      </summary>
      <div
        onClick={closeOnLink}
        className="absolute inset-x-0 top-full mt-2 rounded-3xl border border-line bg-white p-2 shadow-[0_24px_50px_-20px_rgba(4,25,28,0.35)]"
      >
        <nav aria-label={t('Mobile menu', 'Menú móvil')} className="flex flex-col">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-2xl px-4 py-3 text-[15px] font-semibold text-ink-2 hover:bg-line-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-1 flex items-center justify-between border-t border-line px-4 pb-2 pt-3">
          <span className="text-[13px] font-semibold text-mute">{t('Language', 'Idioma')}</span>
          <Suspense fallback={null}>
            <LangSwitch />
          </Suspense>
        </div>
      </div>
    </details>
  )
}
