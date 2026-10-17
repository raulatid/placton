import { Loading, SkFormCard, SkHeader } from '@/components/panel/Skeletons'

export default function AccountLoading() {
  return (
    <Loading>
      <SkHeader right={false} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkFormCard fields={3} />
        <SkFormCard fields={2} />
      </div>
    </Loading>
  )
}
