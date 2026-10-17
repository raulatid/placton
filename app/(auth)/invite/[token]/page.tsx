import Link from 'next/link'
import { acceptInviteAction } from '../../actions'
import { AuthCard } from '@/components/AuthCard'
import { btnClass, ButtonLink, Notice } from '@/components/ui'
import { currentUser } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'

export async function generateMetadata() {
  const { t } = await getT()
  return { title: t('Invitation', 'Invitación') }
}

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ full?: string }> }) {
  const { token } = await params
  const { full } = await searchParams
  const { t } = await getT()
  const invite = repo.inviteByToken(token)
  const ws = invite ? repo.workspaceById(invite.workspaceId) : null
  const user = await currentUser()

  if (!invite || !ws || invite.acceptedAt) {
    return (
      <AuthCard title={t('Invitation not valid', 'Invitación no válida')}>
        <p className="mb-5 text-sm text-mute">
          {t('It may have been used already or withdrawn. Ask the person who invited you for a new one.', 'Puede que ya se haya usado o que la hayan retirado. Pide a quien te invitó que te mande otra.')}
        </p>
        <ButtonLink href={user ? '/dashboard' : '/login'} className="w-full rounded-full">
          {user ? t('Go to dashboard', 'Ir al panel') : t('Log in', 'Entrar')}
        </ButtonLink>
      </AuthCard>
    )
  }

  const inviter = invite.invitedBy ? repo.userById(invite.invitedBy) : null
  const who = inviter ? repo.displayName(inviter) : null
  const brand = ws.brandName || ws.name
  return (
    <AuthCard
      title={t(`Join ${ws.name}`, `Únete a ${ws.name}`)}
      sub={who ? t(`${who} invited you to track ${brand} on Placton.`, `${who} te ha invitado a seguir ${brand} en Placton.`) : t(`You have been invited to track ${brand} on Placton.`, `Te han invitado a seguir ${brand} en Placton.`)}
    >
      {full && (
        <div className="mb-4">
          <Notice tone="warn">{t('This workspace has no seats left on its plan. Ask them to upgrade or free a seat.', 'Este espacio ya tiene todos los miembros que permite su plan. Pide que amplíen el plan o liberen un hueco.')}</Notice>
        </div>
      )}
      {user ? (
        <form action={acceptInviteAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-ink-2">
            {t('You will join as', 'Entrarás como')} <strong>{user.email}</strong>.
          </p>
          <button type="submit" className={btnClass('primary', 'lg', 'w-full rounded-full')}>
            {t('Accept invitation', 'Aceptar invitación')}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <ButtonLink href={`/signup?invite=${encodeURIComponent(token)}`} size="lg" className="w-full rounded-full">
            {t('Create account and join', 'Crear cuenta y unirme')}
          </ButtonLink>
          <p className="text-center text-sm text-mute">
            {t('Already have an account?', '¿Ya tienes cuenta?')}{' '}
            <Link href={`/login?invite=${encodeURIComponent(token)}`} className="font-semibold text-brand hover:underline">
              {t('Log in', 'Entra')}
            </Link>
          </p>
        </div>
      )}
    </AuthCard>
  )
}
