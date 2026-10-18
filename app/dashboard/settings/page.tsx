import type { Metadata } from 'next'
import { DigestForm, EnginesForm, LogoForm, WorkspaceForm } from '@/components/panel/Forms'
import { btnClass, Card, CardHeader, Notice } from '@/components/ui'
import { canManage, requireCtx } from '@/lib/auth'
import { digestOn, recipients } from '@/lib/digest'
import { platforms } from '@/lib/engines'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { deleteWorkspaceAction } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Settings', 'Ajustes') }
}

export default async function SettingsPage() {
  const { workspace: ws, role, user } = await requireCtx()
  const { t } = await getT()
  const manage = canManage(role)
  const members = repo.membersOf(ws.id)
  const digestMode = ws.digestMode ?? 'all'
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card i={1}>
        <CardHeader title={t('Brand and market', 'Marca y mercado')} />
        <div className="px-6 pb-6">
          {!manage && <div className="mb-4"><Notice tone="info">{t('Only workspace admins can change these details.', 'Solo quien administra el espacio puede cambiar estos datos.')}</Notice></div>}
          <WorkspaceForm ws={{ name: ws.name, brandName: ws.brandName, domain: ws.domain, aliases: ws.aliases, description: ws.description, country: ws.country, language: ws.language }} disabled={!manage} />
        </div>
      </Card>
      <div className="space-y-4">
        <Card i={2}>
          <CardHeader title={t('Logo', 'Logo')} hint={t('How your brand looks in the dashboard.', 'Cómo se ve tu marca en el panel.')} />
          <div className="px-6 pb-6">
            <LogoForm name={ws.brandName || ws.name} domain={ws.domain} logo={workspaceLogoUrl(ws)} disabled={!manage} />
          </div>
        </Card>
        <Card i={2}>
          <CardHeader title={t('Platforms', 'Plataformas')} hint={t('Where we ask every week.', 'Dónde preguntamos cada semana.')} />
          <div className="px-6 pb-6">
            <EnginesForm all={platforms().map((p) => ({ id: p.id, available: p.available }))} selected={ws.engines} disabled={!manage} />
          </div>
        </Card>
        <Card i={3}>
          <CardHeader
            title={t('Email summary', 'Resumen por correo')}
            hint={t('After each weekly run, with alerts when something changes.', 'Tras cada medición semanal, con alertas si algo cambia.')}
          />
          <div className="px-6 pb-6">
            <DigestForm
              mode={digestMode}
              me={digestOn(user.id, ws.id, role)}
              manage={manage}
              recipients={digestMode === 'off' ? [] : recipients(ws.id).map((r) => repo.displayName(r))}
            />
          </div>
        </Card>
        {role === 'owner' && (
          <Card i={4}>
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
