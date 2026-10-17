import { Loading, SkAnswerCards, SkFilters, SkHeader, SkListCard, SkStats } from '@/components/panel/Skeletons'

export default function MentionsLoading() {
  return (
    <Loading>
      <SkHeader />
      <SkFilters n={3} />
      <SkStats className="mb-4" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <SkAnswerCards n={2} />
        <SkListCard rows={4} className="hidden xl:block" />
      </div>
    </Loading>
  )
}
