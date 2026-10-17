import { Loading, SkFormCard, SkListCard } from '@/components/panel/Skeletons'

export default function BillingLoading() {
  return (
    <Loading>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <SkFormCard fields={4} />
        <SkListCard rows={2} header={false} />
      </div>
    </Loading>
  )
}
