import { Skeleton } from '@/components/ui'
import { Loading, SkFormCard, SkHeader, SkListCard } from '@/components/panel/Skeletons'

export default function AuditLoading() {
  return (
    <Loading>
      <SkHeader right={false} />
      <SkFormCard fields={1} className="mb-4" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="card flex flex-col items-center p-6">
          <Skeleton className="h-[120px] w-[120px] rounded-full!" />
          <Skeleton className="mt-4 h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </div>
        <div className="space-y-4">
          <SkListCard rows={4} />
          <SkListCard rows={3} />
        </div>
      </div>
    </Loading>
  )
}
