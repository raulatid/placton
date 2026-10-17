import { Skeleton } from '@/components/ui'
import { Loading, SkAnswerCards } from '@/components/panel/Skeletons'

export default function AnswerLoading() {
  return (
    <Loading>
      <Skeleton className="mb-4 h-4 w-24" />
      <SkAnswerCards n={1} />
    </Loading>
  )
}
