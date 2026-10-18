'use client'

import { useEffect, useState } from 'react'
import { useT } from '../LangProvider'
import { IconPlus } from '../icons'
import { PlatformDot, SERIES, cx } from '../ui'
import { CheckMark } from './CompetitorGrid'
import { ENGINE_IDS, vars, type LocalPrompt } from './shared'

function useFirstSeen(seen: Set<string>, id: string) {
  const [first] = useState(() => !seen.has(id))
  return first
}

function Bubble({
  p,
  on,
  disabled,
  limit,
  onToggle,
  seen,
  i,
}: {
  p: LocalPrompt
  on: boolean
  disabled: boolean
  limit: number
  onToggle: () => void
  seen: Set<string>
  i: number
}) {
  const t = useT()
  const first = useFirstSeen(seen, `p:${p.text}`)
  const [delay] = useState(i)
  return (
    <label
      title={disabled ? t(`Your plan includes ${limit}`, `Tu plan incluye ${limit}`) : undefined}
      className={cx(
        'flex items-start gap-3 rounded-[18px] rounded-tl-md border border-line/80 px-4 py-3 shadow-[0_1px_2px_rgba(4,25,28,.04)] transition-[background-color,border-color] duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-2',
        on ? 'bg-white hover:border-line' : 'bg-white/50',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        first && 'anim-rise',
      )}
      style={first ? vars({ '--i': delay }) : undefined}
    >
      <input type="checkbox" className="peer sr-only" checked={on} disabled={disabled} onChange={onToggle} aria-label={p.text} />
      <CheckMark className="mt-px" />
      <span className={cx('min-w-0 flex-1 text-[15px] font-medium leading-snug transition-colors duration-200', on ? 'text-ink' : 'text-faint')}>{p.text}</span>
    </label>
  )
}

function GroupHead({ color, topic, count }: { color: string; topic: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-2 pt-5 text-[12px] font-semibold text-mute">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{topic}</span>
      <span className="num text-faint">· {count}</span>
    </div>
  )
}

function AddBubble({ onAdd, full, limit }: { onAdd: (v: string) => void; full: boolean; limit: number }) {
  const t = useT()
  const [v, setV] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim() || full) return
        onAdd(v)
        setV('')
      }}
      className={cx(
        'ob-add mt-2 flex items-center gap-3 rounded-[18px] rounded-tl-md border border-dashed border-line px-4 py-2.5 transition-colors',
        full ? 'bg-white/30' : 'bg-white/40 focus-within:border-brand-2/60 focus-within:bg-white/80',
      )}
    >
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border border-dashed border-line text-faint">
        <IconPlus size={13} />
      </span>
      {full ? (
        // Con el plan lleno, el aviso en texto (un texto de ejemplo se cortaría en móvil).
        <p className="min-h-9 flex-1 py-1.5 text-[14px] leading-snug text-faint sm:text-[15px]">
          {t(`Your plan includes ${limit}. Untick one to add another.`, `Tu plan incluye ${limit}. Desmarca uno para añadir otro.`)}
        </p>
      ) : (
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setV('')
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.preventDefault()
          }}
          placeholder={t('Write a question the way a customer would', 'Escribe una pregunta como la haría un cliente')}
          aria-label={t('Write a question the way a customer would', 'Escribe una pregunta como la haría un cliente')}
          className="min-h-9 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-faint sm:text-[15px]"
        />
      )}
      {!full && v.trim() && <button className="anim-fade h-8 shrink-0 rounded-lg bg-deep px-3 text-[13px] font-semibold text-white transition-colors hover:bg-deep-2">{t('Add', 'Añadir')}</button>}
    </form>
  )
}

/** Esqueleto con la forma del resultado: una cabecera con 3 burbujas y otra con 2. */
function SkeletonGroups() {
  return (
    <div aria-hidden="true">
      {[3, 2].map((n, g) => (
        <div key={g}>
          <div className="flex items-center gap-2 px-1 pb-2 pt-5">
            <span className="skeleton h-1.5 w-1.5 rounded-full" />
            <span className="skeleton block h-2.5 w-24" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex items-start gap-3 rounded-[18px] rounded-tl-md border border-white bg-white/60 px-4 py-3.5">
                <span className="skeleton h-[22px] w-[22px] shrink-0 rounded-[7px]" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="skeleton block h-3" style={{ width: `${[86, 64, 75, 70, 58][(g * 3 + i) % 5]}%` }} />
                  {i % 2 === 0 && <span className="skeleton block h-3 w-2/5" />}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Fila de las 5 IA en gris mientras se escriben las preguntas. */
export function EnginesWaiting() {
  const t = useT()
  return (
    <div className="mt-4 flex items-center gap-3">
      <span className="flex items-center gap-1.5 opacity-40 grayscale" aria-hidden="true">
        {ENGINE_IDS.map((id) => (
          <PlatformDot key={id} id={id} size={28} />
        ))}
      </span>
      <span className="text-[13px] font-medium text-mute">{t("We'll ask these 5 AI platforms", 'Se las haremos a estas 5 IA')}</span>
    </div>
  )
}

/**
 * Paso 3: las preguntas agrupadas por tema, como burbujas con casilla real.
 * Los temas salen en el orden en que llegan y no se reordenan al marcar; las
 * propias van al final. Solo cuentan para el límite las marcadas.
 */
export function PromptGroups({
  loading,
  prompts,
  isOn,
  onToggle,
  onAdd,
  k,
  limit,
  seen,
}: {
  loading: boolean
  prompts: LocalPrompt[]
  isOn: (p: LocalPrompt) => boolean
  onToggle: (p: LocalPrompt) => void
  onAdd: (text: string) => void
  k: number
  limit: number
  seen: Set<string>
}) {
  const t = useT()
  const custom = prompts.filter((p) => p.custom)
  const shownSuggested = loading ? [] : prompts.filter((p) => !p.custom)
  const groups: { topic: string; items: LocalPrompt[] }[] = []
  for (const p of shownSuggested) {
    const topic = p.topic || 'General'
    const g = groups.find((x) => x.topic === topic)
    if (g) g.items.push(p)
    else groups.push({ topic, items: [p] })
  }
  if (custom.length) groups.push({ topic: t('Custom', 'Propias'), items: custom })

  const ids = groups.flatMap((g) => g.items.map((p) => `p:${p.text}`))
  const fresh = ids.filter((id) => !seen.has(id))
  useEffect(() => {
    for (const id of ids) seen.add(id)
  })
  const full = k >= limit

  return (
    <div>
      {loading && (
        <>
          <SkeletonGroups />
          <p className="shimmer-text mt-4 text-center text-[14px] font-semibold" aria-hidden="true">
            {t('Thinking like your customers', 'Pensando como tus clientes')}
          </p>
        </>
      )}
      {groups.map((g, gi) => (
        <section key={g.items === custom ? 'custom' : `${gi}-${g.topic}`} aria-label={g.topic}>
          <GroupHead color={SERIES[gi % 8]} topic={g.topic} count={g.items.length} />
          <div className="space-y-2">
            {g.items.map((p, pi) => {
              const on = isOn(p)
              return (
                <Bubble
                  key={`${pi}:${p.text}`}
                  p={p}
                  on={on}
                  disabled={!on && full}
                  limit={limit}
                  onToggle={() => onToggle(p)}
                  seen={seen}
                  i={Math.min(12, Math.max(0, fresh.indexOf(`p:${p.text}`)))}
                />
              )
            })}
          </div>
        </section>
      ))}
      <AddBubble onAdd={onAdd} full={full} limit={limit} />
    </div>
  )
}
