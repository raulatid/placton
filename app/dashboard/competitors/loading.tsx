import { Loading, SkFormCard, SkHeader, SkListCard } from '@/components/panel/Skeletons'

export default function CompetitorsLoading() {
  return (
    <Loading>
      <SkHeader />
      <SkFormCard fields={3} className="mb-4" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <SkListCard rows={5} />
        <SkListCard rows={4} />
      </div>
    </Loading>
  )
}
