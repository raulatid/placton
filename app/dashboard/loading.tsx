import { Loading, SkCardGrid, SkChartCard, SkHeader, SkListCard, SkStats, SkTableCard } from '@/components/panel/Skeletons'

export default function OverviewLoading() {
  return (
    <Loading>
      <SkHeader />
      <SkStats spark />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.65fr_1fr]">
        <SkChartCard />
        <SkListCard rows={3} />
      </div>
      <SkTableCard className="mt-4" rows={5} cols={6} />
      <SkCardGrid className="mt-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" n={4} />
    </Loading>
  )
}
