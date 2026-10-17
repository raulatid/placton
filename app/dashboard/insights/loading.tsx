import { Skeleton } from '@/components/ui'
import { Loading, SkCardGrid, SkHeader } from '@/components/panel/Skeletons'

export default function InsightsLoading() {
  return (
    <Loading>
      <SkHeader />
      <Skeleton className="mb-3 h-3 w-28" />
      <SkCardGrid n={4} tall className="lg:grid-cols-2" />
    </Loading>
  )
}
