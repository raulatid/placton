import { Loading, SkAnswerCards, SkFilters, SkHeader } from '@/components/panel/Skeletons'

export default function SearchesLoading() {
  return (
    <Loading>
      <SkHeader />
      <SkFilters n={2} />
      <SkAnswerCards n={3} />
    </Loading>
  )
}
