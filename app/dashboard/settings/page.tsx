import type { Metadata } from 'next'
import { EnginesForm, WorkspaceForm } from '@/components/panel/Forms'
import { btnClass, Card, CardHeader, Notice } from '@/components/ui'
import { canManage, requireCtx } from '@/lib/auth'
import { platforms } from '@/lib/engines'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'
import { deleteWorkspaceAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Settings', 'Ajustes') }
}

export default async function SettingsPage() {
  const { workspace: ws, role } = await requireCtx()
  const { t } = await getT()
  const manage = canManage(role)
  const members = repo.membersOf(ws.id)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card i={1}>
        <CardHeader title={t('Brand and market', 'Marca y mercado')} />
        <div className="px-6 pb-6">
          {!manage && <div className="mb-4"><Notice tone="info">{t('Only workspace admins can change these details.', 'Solo quien administra el espacio puede cambiar estos datos.')}</Notice></div>}
          <WorkspaceForm ws={ws} disabled={!manage} />
        </div>
      </Card>
      <div className="space-y-4">
        <Card i={2}>
          <CardHeader title={t('Platforms', 'Plataformas')} hint={t('Where we ask every day.', 'Dónde preguntamos cada día.')} />
          <div className="px-6 pb-6">
            <EnginesForm all={platforms().map((p) => ({ id: p.id, available: p.available }))} selected={ws.engines} disabled={!manage} />
          </div>
        </Card>
        {role === 'owner' && (
          <Card i={3}>
            <CardHeader
              title={t('Delete workspace', 'Borrar espacio')}
              hint={t("Its prompts, answers and insights are deleted. This can't be undone.", 'Se borran sus prompts, respuestas e ideas. No se puede deshacer.')}
            />
            <div className="px-6 pb-6">
              {members.length > 1 ? (
                <p className="text-sm text-mute">
                  {t('Before deleting it, remove the other members from the Members tab.', 'Antes de borrarlo, saca al resto de miembros desde la pestaña Miembros.')}
                </p>
              ) : (
                <form action={deleteWorkspaceAction} className="space-y-2">
                  <label className="block text-[13px] text-ink-2">
                    {t('Type', 'Escribe')} <strong>{ws.name}</strong> {t('to confirm', 'para confirmar')}
                    <input name="confirm" autoComplete="off" className="mt-1.5 block h-10 w-full rounded-xl border border-line px-3 text-sm" />
                  </label>
                  <button className={btnClass('danger')}>{t('Delete workspace', 'Borrar espacio')}</button>
                </form>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
