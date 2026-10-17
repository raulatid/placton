import type { Metadata } from 'next'
import Link from 'next/link'
import { InviteForm } from '@/components/panel/Forms'
import { Select } from '@/components/panel/Select'
import { Badge, Card, CardHeader, cx, fmtDate, Notice, RAISE, stagger } from '@/components/ui'
import { canManage, requireCtx } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'
import type { Role } from '@/lib/types'
import { changeRoleAction, removeMemberAction, revokeInviteAction } from '../../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Members', 'Miembros') }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

const ROLE: Record<Role, { en: string; es: string }> = {
  owner: { en: 'Owner', es: 'Propietario' },
  admin: { en: 'Admin', es: 'Administrador' },
  member: { en: 'Member', es: 'Miembro' },
}

export default async function MembersPage() {
  const { workspace: ws, role, user } = await requireCtx()
  const { lang, t } = await getT()
  const manage = canManage(role)
  const members = repo.membersOf(ws.id)
  const invites = repo.pendingInvites(ws.id)
  const limit = repo.memberLimit(ws)
  const trial = ws.plan === 'trial'

  return (
    <div className="space-y-4">
      <Card i={1}>
        <CardHeader
          title={t('Invite your team', 'Invitar al equipo')}
          right={
            <span className="text-[13px] font-semibold text-mute num">
              {t(`${members.length + invites.length} of ${limit ?? 'unlimited'}`, `${members.length + invites.length} de ${limit ?? 'ilimitados'}`)}
            </span>
          }
        />
        <div className="px-6 pb-6">
          {trial ? (
            <Notice tone="info">
              {t('During the trial the workspace is just yours.', 'Durante la prueba el espacio es solo tuyo.')}{' '}
              <Link href="/dashboard/plans" className="font-bold underline">
                {t('Choose a plan', 'Elige un plan')}
              </Link>{' '}
              {t('to invite your team.', 'para invitar a tu equipo.')}
            </Notice>
          ) : manage ? (
            <InviteForm disabled={limit !== null && members.length + invites.length >= limit} />
          ) : (
            <p className="text-sm text-mute">{t('Only workspace admins can invite people.', 'Solo quien administra el espacio puede invitar.')}</p>
          )}
        </div>
      </Card>

      <Card i={2}>
        <CardHeader title={t('Members', 'Miembros')} />
        <ul className="divide-y divide-line-2 border-t border-line-2">
          {members.map((m, k) => (
            <li key={m.userId} className={cx('anim-fade flex flex-wrap items-center justify-between gap-3 px-6 py-3 transition-colors last:rounded-b-[22px] hover:bg-[#f6f9f8]', RAISE)} style={stagger(3 + Math.min(k, 8))}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-2 to-brand text-[12px] font-bold text-white">
                  {initials(repo.displayName(m))}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    {repo.displayName(m)} {m.userId === user.id && <Badge>{t('You', 'Tú')}</Badge>}
                  </div>
                  <div className="truncate text-[12.5px] text-mute">
                    {m.email} · {t('since', 'desde')} {fmtDate(m.createdAt, lang)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {manage && m.userId !== user.id && (role === 'owner' || m.role !== 'owner') ? (
                  <form action={changeRoleAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="userId" value={m.userId} />
                    <Select
                      name="role"
                      size="sm"
                      align="right"
                      label={t('Role', 'Rol')}
                      defaultValue={m.role}
                      className="w-40"
                      options={(role === 'owner' ? (['member', 'admin', 'owner'] as const) : (['member', 'admin'] as const)).map((r) => ({ value: r, label: ROLE[r][lang] }))}
                    />
                    <button className="h-9 rounded-xl border border-line bg-white px-3 text-[12.5px] font-semibold transition-colors hover:border-brand-2/40 hover:text-brand">{t('Change', 'Cambiar')}</button>
                  </form>
                ) : (
                  <Badge tone={m.role === 'owner' ? 'dark' : 'neutral'}>{ROLE[m.role][lang]}</Badge>
                )}
                {((manage && m.userId !== user.id && m.role !== 'owner') || (m.userId === user.id && m.role !== 'owner')) && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className="h-8 rounded-lg px-2.5 text-[12.5px] font-semibold text-bad transition-colors hover:bg-line-2">{m.userId === user.id ? t('Leave', 'Salir') : t('Remove', 'Quitar')}</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {invites.length > 0 && (
        <Card i={3} className="overflow-hidden">
          <CardHeader title={t('Pending invitations', 'Invitaciones pendientes')} />
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {invites.map((i, k) => (
              <li key={i.id} className="anim-fade flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-[#f6f9f8]" style={stagger(4 + Math.min(k, 8))}>
                <div>
                  <div className="font-semibold">{i.email}</div>
                  <div className="text-[12.5px] text-mute">
                    {ROLE[i.role][lang]} · {t('sent', 'enviada el')} {fmtDate(i.createdAt, lang)}
                  </div>
                </div>
                {manage && (
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className="h-8 rounded-lg px-2.5 text-[12.5px] font-semibold text-bad transition-colors hover:bg-line-2">{t('Revoke', 'Retirar')}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
