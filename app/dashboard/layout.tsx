import { LivePing } from '@/components/LivePing'
import { Shell } from '@/components/panel/Shell'
import { canManage, isAdmin, requireCtx } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import { unreadInsights } from '@/lib/insights'
import { planName } from '@/lib/plans'
import * as repo from '@/lib/repo'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { logoutAction } from '../(auth)/actions'
import { newWorkspaceAction, switchWorkspaceAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace: ws } = await requireCtx()
  const { lang, t } = await getT()
  // Visita al panel (una escritura cada 10 minutos como mucho): la segunda medición
  // de la prueba gratis solo se hace a quien vuelve. Si falla, el panel sigue igual.
  try {
    repo.recordVisit(ws)
  } catch (err) {
    console.error('[placton] visita al panel', err)
  }
  const access = repo.accessOf(ws)
  const used = repo.activePromptCount(ws.id)
  const limit = repo.promptLimit(ws)
  const days = repo.trialDaysLeft(ws)
  const name = ws.plan === 'trial' ? '' : planName(ws.plan, lang)
  const planLabel = t(`${name} plan`, `Plan ${name}`)

  let plan: { label: string; detail: string; cta: string | null; warn: boolean }
  if (ws.plan === 'trial') {
    plan = access.ok
      ? {
          label: t('Free trial', 'Prueba gratuita'),
          detail: days === 1 ? t('1 day left', 'Queda 1 día') : t(`${days} days left`, `Quedan ${days} días`),
          cta: t('Choose a plan', 'Elegir plan'),
          warn: days <= 2,
        }
      : { label: t('Trial ended', 'Prueba terminada'), detail: t('Choose a plan to keep tracking', 'Elige un plan para seguir midiendo'), cta: t('Choose a plan', 'Elegir plan'), warn: true }
  } else if (access.reason === 'past_due') {
    plan = { label: planLabel, detail: t('Payment pending', 'Pago pendiente'), cta: t('Review payment', 'Revisar pago'), warn: true }
  } else if (!access.ok) {
    plan = { label: t('Subscription canceled', 'Suscripción cancelada'), detail: t('Reactivate it to keep tracking', 'Reactívala para seguir midiendo'), cta: t('Reactivate', 'Reactivar'), warn: true }
  } else if (ws.manualPlan) {
    // Plan dado a mano por Placton: sin cobro, con o sin fecha de fin.
    const until = ws.manualUntil ? new Date(ws.manualUntil).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short' }) : ''
    plan = { label: planLabel, detail: until ? t(`Included until ${until}`, `Incluido hasta el ${until}`) : t('Included by Placton', 'Incluido por Placton'), cta: null, warn: false }
  } else {
    plan = {
      label: planLabel,
      detail: ws.cancelAtPeriodEnd ? t('Cancels at the end of the period', 'Se cancela al final del periodo') : t('Weekly tracking active', 'Seguimiento semanal activo'),
      cta: ws.plan === 'escala' ? null : t('Upgrade plan', 'Mejorar plan'),
      warn: ws.cancelAtPeriodEnd,
    }
  }

  return (
    <Shell
      user={{ name: repo.displayName(user), email: user.email }}
      workspace={{ id: ws.id, name: ws.name, domain: ws.domain, logo: workspaceLogoUrl(ws) }}
      spaces={repo.workspacesOf(user.id).filter((w) => w.onboarded).map((w) => ({ id: w.id, name: w.name, domain: w.domain }))}
      agency={(() => {
        // «Nuevo cliente» solo para quien administra la agencia.
        const owner = repo.agencyOwnerOf(ws)
        const role = owner ? repo.roleIn(owner.id, user.id) : null
        return owner && role && canManage(role) ? { used: repo.agencyClients(owner.id).length, seats: owner.seats } : null
      })()}
      newSpaceAction={newWorkspaceAction}
      canCreateSpace={repo.canCreateWorkspace(user.id)}
      plan={{ ...plan, used, limit }}
      unreadIdeas={unreadInsights(ws.id)}
      admin={isAdmin(user)}
      switchAction={switchWorkspaceAction}
      logoutAction={logoutAction}
    >
      {children}
      <LivePing app />
    </Shell>
  )
}
