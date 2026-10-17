'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconAudit, IconHelp, IconIdea, IconMention, IconOverview, IconPrompt, IconRivals, IconSearch, IconSettings } from '../icons'
import { useT } from '../LangProvider'
import { cx } from '../ui'

// Fuentes no tiene entrada propia: se llega desde Menciones («Todas las fuentes citadas»).
const MAIN = [
  { href: '/dashboard', en: 'Overview', es: 'Resumen', icon: IconOverview, exact: true },
  { href: '/dashboard/prompts', en: 'Prompts', es: 'Prompts', icon: IconPrompt },
  { href: '/dashboard/competitors', en: 'Competitors', es: 'Competidores', icon: IconRivals },
  { href: '/dashboard/mentions', en: 'Mentions', es: 'Menciones', icon: IconMention, also: ['/dashboard/sources'] },
  { href: '/dashboard/searches', en: 'Searches', es: 'Búsquedas', icon: IconSearch },
  { href: '/dashboard/insights', en: 'Insights', es: 'Ideas', icon: IconIdea, badge: 'ideas' },
]

function Item({
  href,
  label,
  icon: Icon,
  exact,
  also = [],
  count,
  onNavigate,
  collapsed,
}: {
  href: string
  label: string
  icon: typeof IconOverview
  exact?: boolean
  also?: string[]
  count?: number
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const path = usePathname()
  const under = (h: string) => path === h || path.startsWith(`${h}/`)
  const active = exact ? path === href : under(href) || also.some(under)
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cx(
        'group/nav relative flex h-9 items-center gap-2.5 rounded-lg text-[14px] font-semibold transition-colors duration-200',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        active
          ? 'bg-white text-ink shadow-[0_1px_2px_rgba(4,25,28,0.06),0_6px_16px_-10px_rgba(4,25,28,0.25)] ring-1 ring-black/[0.04] [&_svg]:text-brand-2'
          : 'text-ink-2 hover:bg-white/60 hover:text-ink',
      )}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      {/* Barra de acento a la izquierda del elemento activo */}
      <span
        aria-hidden="true"
        className={cx(
          'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-2 transition-all duration-300',
          active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
          collapsed && '-left-2',
        )}
      />
      <span className={cx('flex transition-transform duration-200', !active && 'group-hover/nav:translate-x-px')}>
        <Icon size={17} />
      </span>
      {!collapsed && <span className={cx('flex-1 transition-transform duration-200', !active && 'group-hover/nav:translate-x-0.5')}>{label}</span>}
      {count ? (
        <span className={cx('rounded-full bg-brand-2 px-1.5 text-[11px] font-bold leading-[18px] text-white num', collapsed && 'absolute -right-0.5 -top-0.5 px-1 text-[10px] leading-[15px]')}>{count}</span>
      ) : null}
    </Link>
  )
}

export function SidebarNav({ unreadIdeas, onNavigate, collapsed }: { unreadIdeas: number; onNavigate?: () => void; collapsed?: boolean }) {
  const t = useT()
  return (
    <nav className="flex flex-col gap-0.5" aria-label={t('Dashboard sections', 'Secciones del panel')}>
      {MAIN.map(({ en, es, badge, ...i }) => (
        <Item key={i.href} {...i} label={t(en, es)} count={badge ? unreadIdeas : undefined} onNavigate={onNavigate} collapsed={collapsed} />
      ))}
      {collapsed ? (
        <div className="mx-auto my-3 h-px w-6 bg-line" />
      ) : (
        <div className="mb-1 mt-5 px-2.5 text-[11px] font-bold uppercase tracking-wide text-faint">{t('Free tools', 'Herramientas gratis')}</div>
      )}
      <Item href="/dashboard/audit" label={t('AI Site Audit', 'Auditoría IA')} icon={IconAudit} onNavigate={onNavigate} collapsed={collapsed} />
    </nav>
  )
}

export function SidebarFooterNav({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const t = useT()
  return (
    <nav className="flex flex-col gap-0.5" aria-label={t('Help and settings', 'Ayuda y ajustes')}>
      <Item href="/dashboard/help" label={t('Help & Support', 'Ayuda')} icon={IconHelp} onNavigate={onNavigate} collapsed={collapsed} />
      <Item href="/dashboard/settings" label={t('Workspace Settings', 'Ajustes del espacio')} icon={IconSettings} onNavigate={onNavigate} collapsed={collapsed} />
    </nav>
  )
}
