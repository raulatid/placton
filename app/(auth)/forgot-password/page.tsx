import Link from 'next/link'
import { AuthCard } from '@/components/AuthCard'
import { ForgotForm } from '@/components/AuthForms'
import { getT } from '@/lib/i18n'

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t('Reset password', 'Recuperar contraseña') }
}

export default async function ForgotPage() {
  const { t } = await getT()
  return (
    <AuthCard
      title={t('Reset your password', 'Recupera tu contraseña')}
      sub={
        <>
          {t('Remembered it?', '¿Ya la recuerdas?')}{' '}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            {t('Log in', 'Entra')}
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthCard>
  )
}
