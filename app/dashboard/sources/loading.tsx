import { Loading, SkFilters, SkHeader, SkListCard, SkStats } from '@/components/panel/Skeletons'

export default function SourcesLoading() {
  return (
    <Loading>
      <SkHeader back />
      <SkFilters n={1} />
      <SkStats n={3} className="mb-4" />
      <SkListCard rows={8} />
    </Loading>
  )
}
