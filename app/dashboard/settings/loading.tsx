import { Loading, SkFormCard, SkListCard } from '@/components/panel/Skeletons'

// Va dentro del layout de Ajustes: el título y las pestañas ya están pintados.
export default function SettingsLoading() {
  return (
    <Loading>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SkFormCard fields={6} />
        <SkListCard rows={4} />
      </div>
    </Loading>
  )
}
