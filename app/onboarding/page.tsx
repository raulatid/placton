import { redirect } from 'next/navigation'
import { LangSwitch } from '@/components/LangSwitch'
import { Logo } from '@/components/Logo'
import { Onboarding } from '@/components/Onboarding'
import { requireUser } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'
import { logoutAction } from '../(auth)/actions'

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t('Set up your workspace', 'Configura tu espacio') }
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string; web?: string }> }) {
  const sp = await searchParams
  const { t } = await getT()
  const user = await requireUser()
  const spaces = repo.workspacesOf(user.id)
  // Quien ya tiene un espacio terminado va al panel, salvo que esté creando otro.
  if (!sp.new && spaces.some((w) => w.onboarded) && !spaces.some((w) => !w.onboarded && w.role === 'owner')) redirect('/dashboard')
  if (sp.new && !spaces.some((w) => !w.onboarded && w.role === 'owner')) {
    // En una agencia, «nuevo espacio» es un cliente más de su suscripción.
    const current = user.currentWorkspaceId ? repo.workspaceById(user.currentWorkspaceId) : null
    const owner = current ? repo.agencyOwnerOf(current) : null
    if (owner && repo.accessOf(owner).ok) {
      const client = repo.createClientWorkspace(user.id, owner, 'New client')
      if (!client) redirect(`/dashboard/settings/billing?error=${encodeURIComponent(t('You have used all the clients in your plan. Add more here.', 'Has usado todos los clientes de tu plan. Añade más aquí.'))}`)
    } else {
      repo.createWorkspace(user.id, 'My workspace')
    }
    redirect('/onboarding')
  }
  const draft = repo.workspacesOf(user.id).find((w) => !w.onboarded && w.role === 'owner')
  const limit = draft ? repo.promptLimit(draft) : repo.promptLimit({ ...spaces[0], plan: 'trial', billingOwnerId: null } as never)

  return (
    <div className="sea-fade flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo href="/dashboard" />
        <div className="flex items-center gap-3">
          <LangSwitch />
          <form action={logoutAction}>
            <button className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-mute hover:bg-white hover:text-ink">{t('Log out', 'Salir')}</button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-4 pb-24">
        <Onboarding initialWeb={sp.web ?? ''} limit={limit} />
      </main>
    </div>
  )
}
