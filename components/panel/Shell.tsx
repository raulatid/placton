'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT } from '../LangProvider'
import { LangSwitch } from '../LangSwitch'
import { Logo, Mark } from '../Logo'
import { IconChevron, IconLogout, IconMenu, IconPlus, IconSettings, IconUser, IconX } from '../icons'
import { cx } from '../ui'
import { SidebarFooterNav, SidebarNav } from './SidebarNav'

export interface ShellProps {
  user: { name: string; email: string }
  workspace: { id: number; name: string; domain: string }
  spaces: { id: number; name: string; domain: string }[]
  /** Plan Agencia: clientes creados y contratados (null si no es agencia). */
  agency?: { used: number; seats: number } | null
  plan: { label: string; detail: string; used: number; limit: number; cta: string | null; warn: boolean }
  unreadIdeas: number
  admin: boolean
  switchAction: (fd: FormData) => void
  logoutAction: () => void
  children: React.ReactNode
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

const PanelIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9 4.5v15" />
  </svg>
)

/** Selector de espacio, abajo del todo de la barra lateral; el menú se abre hacia arriba. */
function WorkspaceSwitcher({ workspace, spaces, switchAction, onNavigate, collapsed, agency }: Pick<ShellProps, 'workspace' | 'spaces' | 'switchAction' | 'agency'> & { onNavigate?: () => void; collapsed?: boolean }) {
  const t = useT()
  return (
    <details className="group relative">
      <summary className={cx('glass flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-white', collapsed && 'justify-center px-0')} title={workspace.name}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-deep text-[12px] font-bold text-glow">{workspace.name.slice(0, 1).toUpperCase()}</span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold">{workspace.name}</span>
              <span className="block truncate text-[11.5px] text-mute">{workspace.domain || t('No website', 'Sin web')}</span>
            </span>
            <IconChevron size={15} className="rotate-180 text-faint transition-transform group-open:rotate-0" />
          </>
        )}
      </summary>
      <div className={cx('absolute bottom-full z-40 mb-1.5 animate-[p-rise_0.18s_ease-out_both] motion-reduce:animate-none rounded-xl border border-line bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(4,25,28,0.3)]', collapsed ? 'left-0 w-60' : 'left-0 right-0')}>
        <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-faint">{t('Workspaces', 'Espacios')}</div>
        {spaces.map((s) => (
          <form key={s.id} action={switchAction}>
            <input type="hidden" name="id" value={s.id} />
            <button className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-line-2', s.id === workspace.id && 'font-bold text-brand')}>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.id === workspace.id && <span className="h-1.5 w-1.5 rounded-full bg-brand-2" />}
            </button>
          </form>
        ))}
        <div className="my-1 border-t border-line-2" />
        <Link href="/onboarding?new=1" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-ink-2 hover:bg-line-2">
          <IconPlus size={15} />{' '}
          {agency ? t(`New client (${agency.used} of ${agency.seats})`, `Nuevo cliente (${agency.used} de ${agency.seats})`) : t('New workspace', 'Nuevo espacio')}
        </Link>
        <Link href="/dashboard/settings" onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-ink-2 hover:bg-line-2">
          <IconSettings size={15} /> {t('Workspace settings', 'Ajustes del espacio')}
        </Link>
        <Link href="/dashboard/settings/billing" onClick={onNavigate} className="flex items-center gap-2 rounded-lg px-2.5 py-2 pl-[37px] text-[13px] font-semibold text-ink-2 hover:bg-line-2">
          {t('Billing', 'Suscripción')}
        </Link>
      </div>
    </details>
  )
}

function PlanCard({ plan, onNavigate }: Pick<ShellProps, 'plan'> & { onNavigate?: () => void }) {
  const t = useT()
  const share = Math.min(100, (plan.used / Math.max(1, plan.limit)) * 100)
  if (plan.warn)
    return (
      <div className="rounded-2xl border border-line bg-white p-3 shadow-[inset_3px_0_0_#d97706]">
        <div className="text-[13px] font-bold">{plan.label}</div>
        <div className="mt-0.5 text-[12px] text-mute">{plan.detail}</div>
        {plan.cta && (
          <Link href="/dashboard/plans" onClick={onNavigate} className="mt-2.5 flex h-8 items-center justify-center rounded-full bg-deep text-[12.5px] font-semibold text-white hover:bg-deep-2">
            {plan.cta}
          </Link>
        )}
      </div>
    )
  return (
    <div className="rounded-2xl border border-line bg-white/80 p-3.5 shadow-[0_1px_2px_rgba(4,25,28,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold">{plan.label}</span>
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand-2" aria-hidden="true" />
      </div>
      <div className="mt-0.5 text-[12px] text-mute">{plan.detail}</div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line-2">
        <div className="anim-grow-x h-full rounded-full" style={{ width: `${share}%`, background: 'linear-gradient(90deg, #00a38c, #2fbfa8)' }} />
      </div>
      <div className="mt-1.5 text-[11.5px] text-mute num">{t(`${plan.used} of ${plan.limit} prompts used`, `${plan.used} de ${plan.limit} prompts usados`)}</div>
      {plan.cta && (
        <Link href="/dashboard/plans" onClick={onNavigate} className="mt-2.5 flex h-8 items-center justify-center rounded-full bg-deep text-[12.5px] font-semibold text-white transition-colors hover:bg-deep-2">
          {plan.cta}
        </Link>
      )}
    </div>
  )
}

function Sidebar(props: Omit<ShellProps, 'children'> & { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const { plan, unreadIdeas, admin, onNavigate, collapsed, onToggle } = props
  const t = useT()
  return (
    <div className={cx('flex h-full flex-col gap-3 py-4', collapsed ? 'px-2' : 'px-3')}>
      <div className={cx('flex items-center pt-1', collapsed ? 'flex-col gap-3' : 'justify-between px-2')}>
        {collapsed ? (
          <Link href="/dashboard" aria-label="Placton">
            <Mark size={26} />
          </Link>
        ) : (
          <Logo href="/dashboard" />
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded-md p-1 text-faint hover:bg-line-2 hover:text-ink"
            aria-label={collapsed ? t('Expand sidebar', 'Desplegar menú') : t('Collapse sidebar', 'Plegar menú')}
            title={collapsed ? t('Expand sidebar', 'Desplegar menú') : t('Collapse sidebar', 'Plegar menú')}
          >
            <PanelIcon />
          </button>
        )}
      </div>

      <div className="mt-3 flex-1 overflow-y-auto">
        <SidebarNav unreadIdeas={unreadIdeas} onNavigate={onNavigate} collapsed={collapsed} />
      </div>

      <SidebarFooterNav onNavigate={onNavigate} collapsed={collapsed} />
      {admin && !collapsed && (
        <Link href="/admin" className="px-2.5 text-[12px] font-semibold text-mute hover:text-ink">
          {t('Admin', 'Administración')}
        </Link>
      )}
      {!collapsed && <PlanCard plan={plan} onNavigate={onNavigate} />}
      <WorkspaceSwitcher workspace={props.workspace} spaces={props.spaces} switchAction={props.switchAction} onNavigate={onNavigate} collapsed={collapsed} agency={props.agency} />
    </div>
  )
}

/** Usuario arriba a la derecha: cuenta, idioma y salir. */
function UserMenu({ user, logoutAction }: Pick<ShellProps, 'user' | 'logoutAction'>) {
  const t = useT()
  return (
    <details className="group relative">
      <summary className="flex items-center gap-2 rounded-full border border-transparent py-1 pl-3 pr-1 transition-colors hover:border-white hover:bg-white/70">
        <span className="hidden text-[13px] font-semibold text-ink-2 sm:inline">{user.name}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-2 text-[12px] font-bold text-white ring-2 ring-white">{initials(user.name)}</span>
      </summary>
      <div className="absolute right-0 top-full z-40 mt-1.5 w-64 animate-[p-rise_0.18s_ease-out_both] motion-reduce:animate-none rounded-xl border border-line bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(4,25,28,0.3)]">
        <div className="px-3 pb-2 pt-1.5">
          <div className="truncate text-[13px] font-bold">{user.name}</div>
          <div className="truncate text-[12px] text-mute">{user.email}</div>
        </div>
        <div className="border-t border-line-2" />
        <Link href="/dashboard/account" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-2 hover:bg-line-2">
          <IconUser size={15} /> {t('Account', 'Tu cuenta')}
        </Link>
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] font-semibold text-ink-2">
          {t('Language', 'Idioma')}
          <LangSwitch />
        </div>
        <form action={logoutAction}>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-ink-2 hover:bg-line-2">
            <IconLogout size={15} /> {t('Log out', 'Cerrar sesión')}
          </button>
        </form>
      </div>
    </details>
  )
}

export function Shell(props: ShellProps) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const t = useT()

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('placton_sidebar') === 'plegado')
    } catch {}
  }, [])
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('placton_sidebar', c ? 'abierto' : 'plegado')
      } catch {}
      return !c
    })

  return (
    <div
      className={cx(
        // .panel da a las tarjetas el acabado de cristal (globals.css).
        'panel relative min-h-screen bg-[#f3f5f4] transition-[padding] duration-300 [--card-px:1.5rem]',
        collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]',
      )}
    >
      {/* Fondo: un brillo marino muy tenue arriba y una trama de puntos que se desvanece. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[720px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(900px 380px at 25% -170px, rgba(110,240,210,0.16), transparent 70%)',
              'radial-gradient(900px 400px at 75% -200px, rgba(79,182,216,0.12), transparent 70%)',
            ].join(', '),
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(11,29,33,0.06) 1px, transparent 1.2px)',
            backgroundSize: '22px 22px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 85%)',
          }}
        />
      </div>
      <aside
        className={cx('fixed inset-y-0 left-0 z-30 hidden border-r border-white/80 backdrop-blur-xl transition-[width] duration-300 lg:block', collapsed ? 'w-[76px]' : 'w-[248px]')}
        style={{ background: 'rgba(243,245,244,0.9)', boxShadow: '1px 0 0 rgba(4,25,28,0.05)' }}
      >
        <Sidebar {...props} collapsed={collapsed} onToggle={toggle} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <div className="flex items-center gap-1">
          <UserMenu user={props.user} logoutAction={props.logoutAction} />
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-line-2" aria-label={t('Open menu', 'Abrir menú')}>
            <IconMenu size={20} />
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-[p-fade_0.2s_ease_both] motion-reduce:animate-none bg-deep/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] animate-[p-fade_0.2s_ease_both] motion-reduce:animate-none overflow-y-auto bg-white shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 hover:bg-line-2" aria-label={t('Close menu', 'Cerrar menú')}>
              <IconX size={18} />
            </button>
            <Sidebar {...props} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-9">
        <div className="hidden justify-end pt-4 lg:flex">
          <UserMenu user={props.user} logoutAction={props.logoutAction} />
        </div>
        <main className="pb-10 pt-4 lg:pt-1">{props.children}</main>
      </div>
    </div>
  )
}
