import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/AuthCard'
import { RegisterForm } from '@/components/AuthForms'
import { currentUser } from '@/lib/auth'
import { googleReady } from '@/lib/google'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t('Sign up', 'Crear cuenta') }
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string; web?: string }> }) {
  const { invite, web } = await searchParams
  const { t } = await getT()
  if (await currentUser()) redirect(invite ? `/invite/${encodeURIComponent(invite)}` : web ? `/onboarding?web=${encodeURIComponent(web)}` : '/dashboard')
  const inv = invite ? repo.inviteByToken(invite) : null
  const ws = inv ? repo.workspaceById(inv.workspaceId) : null
  return (
    <AuthCard
      title={ws ? t(`Join ${ws.name}`, `Únete a ${ws.name}`) : t('Join Placton', 'Únete a Placton')}
      sub={
        <>
          {t('Already have an account?', '¿Ya tienes cuenta?')}{' '}
          <Link href={invite ? `/login?invite=${encodeURIComponent(invite)}` : '/login'} className="font-semibold text-ink underline underline-offset-2">
            {t('Log in', 'Entra')}
          </Link>
        </>
      }
    >
      <RegisterForm google={googleReady()} invite={invite} email={inv?.email} web={web} />
    </AuthCard>
  )
}
