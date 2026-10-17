import Link from 'next/link'
import { AuthCard } from '@/components/AuthCard'
import { ResetForm } from '@/components/AuthForms'
import { peekPasswordReset } from '@/lib/auth'
import { getT } from '@/lib/i18n'

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t('New password', 'Contraseña nueva') }
}

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { t } = await getT()
  const valid = peekPasswordReset(token)
  return (
    <AuthCard
      title={t('Choose a new password', 'Elige una contraseña nueva')}
      sub={valid ? t('We will sign you out of other devices when you save it.', 'Al guardarla cerraremos las sesiones abiertas en otros dispositivos.') : undefined}
    >
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <p className="text-sm text-mute">
          {t('This link has expired or was already used.', 'Este enlace ha caducado o ya se usó.')}{' '}
          <Link href="/forgot-password" className="font-semibold text-brand hover:underline">
            {t('Request a new one', 'Pide otro')}
          </Link>
          .
        </p>
      )}
    </AuthCard>
  )
}
