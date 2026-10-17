import { Loading, SkFormCard, SkHeader, SkListCard } from '@/components/panel/Skeletons'

export default function HelpLoading() {
  return (
    <Loading>
      <SkHeader right={false} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SkListCard rows={7} />
        <SkFormCard fields={2} />
      </div>
    </Loading>
  )
}
