import { Loading, SkAnswerCards, SkHeader, SkStats } from '@/components/panel/Skeletons'

export default function PromptLoading() {
  return (
    <Loading>
      <SkHeader back />
      <SkStats className="mb-6" />
      <SkAnswerCards n={2} />
    </Loading>
  )
}
