import { Loading, SkFormCard, SkListCard } from '@/components/panel/Skeletons'

export default function MembersLoading() {
  return (
    <Loading>
      <div className="space-y-4">
        <SkFormCard fields={2} />
        <SkListCard rows={3} />
      </div>
    </Loading>
  )
}
