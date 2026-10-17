import Link from 'next/link'
import type { Lang } from '@/lib/i18n-shared'
import { RANGE_LABEL, type RangeId } from '@/lib/metrics'
import { IconCalendar, IconCheck, IconChevron } from '../icons'
import { cx } from '../ui'

/** Selector de periodo en desplegable (último día, 7, 30 o 90 días). */
export function RangePicker({ current, base, extra = {}, lang }: { current: RangeId; base: string; extra?: Record<string, string | undefined>; lang: Lang }) {
  const ids: RangeId[] = ['hoy', '7d', '30d', '90d']
  return (
    <details className="group relative">
      <summary className="glass inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-white">
        <IconCalendar size={15} className="text-mute" />
        {RANGE_LABEL[current][lang]}
        <IconChevron size={14} className="text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1.5 w-44 animate-[p-rise_0.18s_ease-out_both] rounded-xl border border-line bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(4,25,28,0.3)] motion-reduce:animate-none">
        {ids.map((id) => {
          const q = new URLSearchParams()
          q.set('r', id)
          for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
          return (
            <Link
              key={id}
              href={`${base}?${q}`}
              scroll={false}
              className={cx('flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors hover:bg-line-2', id === current ? 'text-brand' : 'text-ink-2')}
            >
              {RANGE_LABEL[id][lang]}
              {id === current && <IconCheck size={14} />}
            </Link>
          )
        })}
      </div>
    </details>
  )
}
