import { Loading, SkFormCard, SkHeader, SkTableCard } from '@/components/panel/Skeletons'

export default function PromptsLoading() {
  return (
    <Loading>
      <SkHeader />
      <SkFormCard fields={2} className="mb-4" />
      <SkTableCard header={false} rows={7} cols={6} />
    </Loading>
  )
}
