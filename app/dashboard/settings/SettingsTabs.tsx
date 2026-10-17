'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/components/LangProvider'
import { cx } from '@/components/ui'

const TABS = [
  { href: '/dashboard/settings', en: 'General', es: 'General' },
  { href: '/dashboard/settings/members', en: 'Members', es: 'Miembros' },
  { href: '/dashboard/settings/billing', en: 'Billing', es: 'Suscripción' },
]

export function SettingsTabs() {
  const path = usePathname()
  const t = useT()
  return (
    <div className="anim-fade flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cx(
            '-mb-px border-b-2 px-3 py-2.5 text-[14px] font-semibold transition-colors duration-200',
            path === tab.href ? 'border-brand-2 text-ink' : 'border-transparent text-mute hover:border-line hover:text-ink',
          )}
        >
          {t(tab.en, tab.es)}
        </Link>
      ))}
    </div>
  )
}
