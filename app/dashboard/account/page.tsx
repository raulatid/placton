import type { Metadata } from 'next'
import { DeleteAccountForm, PasswordForm, ProfileForm } from '@/components/panel/Forms'
import { Card, CardHeader, PageHeader } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Your account', 'Tu cuenta') }
}

export default async function AccountPage() {
  const user = await requireUser()
  const { t } = await getT()
  const spaces = repo.workspacesOf(user.id)
  const shared = spaces.filter((w) => repo.membersOf(w.id).length > 1).map((w) => w.name)
  return (
    <>
      <PageHeader
        title={t('Your account', 'Tu cuenta')}
        hint={t('Your personal details. Brand and plan settings live in Workspace Settings.', 'Tus datos personales. Los de la marca y el plan están en Ajustes del espacio.')}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card i={1}>
          <CardHeader title={t('Profile', 'Perfil')} />
          <div className="px-6 pb-6">
            <ProfileForm user={user} />
          </div>
        </Card>
        <Card i={2}>
          <CardHeader
            title={t('Password', 'Contraseña')}
            hint={user.googleId ? t('You sign in with Google. You can also add a password.', 'Entras con Google. Puedes añadir también una contraseña.') : undefined}
          />
          <div className="px-6 pb-6">
            <PasswordForm hasPassword={Boolean(user.passwordHash)} />
          </div>
        </Card>
        <Card i={3} className="lg:col-span-2">
          <CardHeader title={t('Delete account', 'Borrar cuenta')} />
          <div className="max-w-xl px-6 pb-6">
            <DeleteAccountForm sharedSpaces={shared} />
          </div>
        </Card>
      </div>
    </>
  )
}
