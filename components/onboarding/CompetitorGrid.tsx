'use client'

import { useEffect, useState } from 'react'
import { useT } from '../LangProvider'
import { IconPlus } from '../icons'
import { BrandAvatar, cx } from '../ui'
import { domainOf, useSettled, vars, type Competitor } from './shared'

/** Casilla visible (la real va justo antes, oculta, con la clase `peer`). */
export function CheckMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'ob-check flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] border-line bg-white text-white peer-checked:border-deep peer-checked:bg-deep peer-disabled:bg-line-2',
        className,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}

/** Entra subiendo solo la primera vez que se ve (no al volver a este paso). */
function useFirstSeen(seen: Set<string>, id: string) {
  const [first] = useState(() => !seen.has(id))
  return first
}

/** Logo en vivo de lo que se escribe: la inicial al momento, el logo tras 650 ms. */
export function LiveAvatar({ value, size }: { value: string; size: number }) {
  const typed = domainOf(value)
  const settled = useSettled(typed?.domain ?? '')
  if (!typed) return null
  return (
    <span className="ob-pop" style={vars({ '--pop-delay': '0s' })}>
      <BrandAvatar name={typed.name} domain={settled === typed.domain ? typed.domain : undefined} size={size} />
    </span>
  )
}

function CompetitorCard({
  c,
  on,
  onToggle,
  seen,
  i,
  nudge,
}: {
  c: Competitor
  on: boolean
  onToggle: () => void
  seen: Set<string>
  i: number
  nudge: number
}) {
  const t = useT()
  const first = useFirstSeen(seen, `c:${c.name.toLowerCase()}`)
  const [delay] = useState(i)
  return (
    <label
      className={cx(
        'group relative flex min-h-[64px] cursor-pointer items-center gap-3 rounded-[16px] border border-line/80 px-3.5 py-3 shadow-[0_1px_2px_rgba(4,25,28,.04)] transition-[background-color,border-color] duration-200 hover:border-line has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-2',
        on ? 'bg-white' : 'bg-white/60',
        first && 'anim-rise',
      )}
      style={first ? vars({ '--i': delay }) : undefined}
    >
      {nudge > 0 && <span key={nudge} aria-hidden="true" className="ob-nudge pointer-events-none absolute inset-0 rounded-[16px]" />}
      <span className={cx('transition-[opacity,filter] duration-200', !on && 'opacity-50 grayscale')}>
        <BrandAvatar name={c.name} domain={c.domain || undefined} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-[15px] font-semibold transition-colors duration-200', on ? 'text-ink' : 'text-faint')}>{c.name}</span>
        <span className={cx('block truncate text-[13px]', c.domain ? 'text-mute' : 'text-faint')}>{c.domain || t('No website', 'Sin web')}</span>
      </span>
      <input type="checkbox" className="peer sr-only" checked={on} onChange={onToggle} aria-label={c.domain ? `${c.name}, ${c.domain}` : c.name} />
      <CheckMark />
    </label>
  )
}

function SkeletonCard() {
  return (
    <div aria-hidden="true" className="flex min-h-[64px] items-center gap-3 rounded-[16px] border border-white bg-white/60 px-3.5 py-3">
      <span className="skeleton h-9 w-9 shrink-0 rounded-[10px]" />
      <span className="flex-1 space-y-2">
        <span className="skeleton block h-3 w-3/5" />
        <span className="skeleton block h-2.5 w-2/5" />
      </span>
      <span className="skeleton h-[22px] w-[22px] shrink-0 rounded-[7px]" />
    </div>
  )
}

function AddCard({ onAdd, wide }: { onAdd: (v: string) => void; wide: boolean }) {
  const t = useT()
  const [v, setV] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim()) return
        onAdd(v)
        setV('')
      }}
      className={cx(
        'ob-add flex min-h-[64px] items-center gap-3 rounded-[16px] border border-dashed border-line bg-white/40 px-3.5 py-3 transition-colors focus-within:border-brand-2/60 focus-within:bg-white/80',
        wide && 'min-[520px]:col-span-2',
      )}
    >
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-faint', !domainOf(v) && 'border border-dashed border-line')}>
        {domainOf(v) ? <LiveAvatar value={v} size={36} /> : <IconPlus size={16} />}
      </span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setV('')
          // ⌘/Ctrl+Intro es «seguir», no «añadir»
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.preventDefault()
        }}
        placeholder={t('Add a brand or its website', 'Añade una marca o su web')}
        aria-label={t('Add a brand or its website', 'Añade una marca o su web')}
        autoCapitalize="none"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-faint focus-visible:outline-none sm:text-[15px]"
      />
      {v.trim() && <button className="anim-fade h-8 shrink-0 rounded-lg bg-deep px-3 text-[13px] font-semibold text-white transition-colors hover:bg-deep-2">{t('Add', 'Añadir')}</button>}
    </form>
  )
}

/**
 * Paso 2: la competencia en fichas con casilla real. Las desmarcadas se quedan
 * en su sitio, atenuadas. La ficha para añadir funciona también mientras carga.
 */
export function CompetitorGrid({
  loading,
  competitors,
  isOn,
  onToggle,
  onAdd,
  seen,
}: {
  loading: boolean
  competitors: Competitor[]
  isOn: (c: Competitor) => boolean
  onToggle: (c: Competitor) => void
  /** Devuelve la clave de la ficha que ya estaba marcada (para señalarla), o null. */
  onAdd: (raw: string) => string | null
  seen: Set<string>
}) {
  const [nudge, setNudge] = useState<{ key: string; n: number }>({ key: '', n: 0 })
  const ids = competitors.map((c) => `c:${c.name.toLowerCase()}`)
  const fresh = ids.filter((id) => !seen.has(id))

  // Lo que ya se ha visto no vuelve a entrar animado.
  useEffect(() => {
    for (const id of ids) seen.add(id)
  })

  return (
    <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
      {loading && [0, 1, 2, 3].map((i) => <SkeletonCard key={`sk-${i}`} />)}
      {competitors.map((c, i) => {
        const key = c.name.toLowerCase()
        return (
          <CompetitorCard
            key={key}
            c={c}
            on={isOn(c)}
            onToggle={() => onToggle(c)}
            seen={seen}
            i={Math.max(0, fresh.indexOf(ids[i]))}
            nudge={nudge.key === key ? nudge.n : 0}
          />
        )
      })}
      <AddCard
        wide={!loading && competitors.length === 0}
        onAdd={(raw) => {
          const dup = onAdd(raw)
          if (dup) setNudge((s) => ({ key: dup, n: s.n + 1 }))
        }}
      />
    </div>
  )
}
