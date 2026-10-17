import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/AuthCard'
import { LoginForm } from '@/components/AuthForms'
import { currentUser } from '@/lib/auth'
import { googleReady } from '@/lib/google'
import { getT } from '@/lib/i18n'

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t('Log in', 'Entrar') }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; error?: string }> }) {
  const { invite, error } = await searchParams
  const { t } = await getT()
  if (await currentUser()) redirect(invite ? `/invite/${encodeURIComponent(invite)}` : '/dashboard')
  return (
    <AuthCard
      title={t('Welcome back', 'Hola de nuevo')}
      sub={
        <>
          {t("Don't have an account?", '¿Aún no tienes cuenta?')}{' '}
          <Link href={invite ? `/signup?invite=${encodeURIComponent(invite)}` : '/signup'} className="font-semibold text-ink underline underline-offset-2">
            {t('Sign up', 'Crea una')}
          </Link>
        </>
      }
    >
      {error && <p className="mb-4 rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink-2 shadow-[inset_3px_0_0_#c2410c]">{error === 'limit'
            ? t('Too many new accounts from this connection today. Try again tomorrow or contact us.', 'Demasiadas cuentas nuevas desde esta conexión hoy. Prueba mañana o escríbenos.')
            : t('Google sign-in failed. Please try again.', 'No se pudo entrar con Google. Inténtalo otra vez.')}</p>}
      <LoginForm google={googleReady()} invite={invite} />
    </AuthCard>
  )
}
