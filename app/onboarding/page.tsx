import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LangSwitch } from '@/components/LangSwitch'
import { Logo } from '@/components/Logo'
import { Onboarding } from '@/components/Onboarding'
import { requireUser } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'
import { logoutAction } from '../(auth)/actions'
import './onboarding.css'

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t('Set up your workspace', 'Configura tu espacio') }
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string; web?: string }> }) {
  const sp = await searchParams
  const { t } = await getT()
  const user = await requireUser()
  const spaces = repo.workspacesOf(user.id)
  // Quien ya tiene un espacio terminado va al panel, salvo que tenga uno nuevo a medias
  // (se crean desde «Nuevo espacio» o «Nuevo cliente», con un formulario, nunca con un enlace).
  if (spaces.some((w) => w.onboarded) && !spaces.some((w) => !w.onboarded && w.role === 'owner')) redirect('/dashboard')
  const draft = repo.workspacesOf(user.id).find((w) => !w.onboarded && w.role === 'owner')
  const limit = draft ? repo.promptLimit(draft) : repo.promptLimit({ ...spaces[0], plan: 'trial', billingOwnerId: null } as never)

  return (
    // `isolate` deja que los fondos del alta (profundidad, plancton y el marino del
    // paso 4) vivan en capas -z-10 por encima del color de la página.
    <div className="ob-shell relative isolate flex min-h-screen flex-col bg-[#f2f4f3]">
      <header className="ob-hdr flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="ob-logo">
          <Logo href="/dashboard" />
        </span>
        <div className="flex items-center gap-3">
          {spaces.some((w) => w.onboarded) && (
            <Link href="/dashboard" className="ob-hdr-btn rounded-full px-3 py-1.5 text-[13px] font-semibold text-mute hover:bg-white hover:text-ink">
              {t('Back to the dashboard', 'Volver al panel')}
            </Link>
          )}
          <LangSwitch />
          <form action={logoutAction}>
            <button className="ob-hdr-btn rounded-full px-3 py-1.5 text-[13px] font-semibold text-mute hover:bg-white hover:text-ink">{t('Log out', 'Salir')}</button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-4 pb-24 sm:px-6">
        <Onboarding initialWeb={sp.web ?? ''} limit={limit} />
      </main>
    </div>
  )
}
