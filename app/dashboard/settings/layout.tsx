import { PageHeader } from '@/components/ui'
import { getT } from '@/lib/i18n'
import { SettingsTabs } from './SettingsTabs'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT()
  return (
    <>
      <PageHeader
        title={t('Workspace Settings', 'Ajustes del espacio')}
        hint={t('The brand we track, where, on which platforms, with whom and on which plan.', 'La marca que medimos, dónde, en qué plataformas, con quién y con qué plan.')}
      />
      <SettingsTabs />
      <div className="mt-5">{children}</div>
    </>
  )
}
