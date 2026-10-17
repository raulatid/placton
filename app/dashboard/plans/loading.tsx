import { Skeleton } from '@/components/ui'
import { Loading, SkHeader } from '@/components/panel/Skeletons'

export default function PlansLoading() {
  return (
    <Loading>
      <SkHeader right={false} />
      <div className="mb-6 flex justify-center">
        <Skeleton className="h-10 w-64 rounded-xl!" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((k) => (
          <div key={k} className="card space-y-4 p-6">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-9 w-32 rounded-lg!" />
            <div className="space-y-2.5 pt-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-12 w-full rounded-xl!" />
          </div>
        ))}
      </div>
    </Loading>
  )
}
