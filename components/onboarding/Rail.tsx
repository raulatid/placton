'use client'

import { IconCheck, IconInfo } from '../icons'
import { cx } from '../ui'

// La línea del alta: un hilo vertical con 4 nodos. El paso en curso se abre,
// los hechos se pliegan en una fila con su dato y los pendientes esperan en gris.

export type RailState = 'pending' | 'active' | 'done' | 'info'

/** Mini diatomea de 14 px (núcleo y 4 cuentas en cruz), la marca del paso en curso. */
export function MiniDiatom({ dark }: { dark?: boolean }) {
  const core = dark ? 'var(--color-glow, #6ef0d2)' : 'var(--color-brand-2, #00a38c)'
  const bead = dark ? 'rgba(110,240,210,.75)' : 'var(--color-brand-2, #00a38c)'
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="2.5" fill={core} />
      <circle cx="7" cy="1.5" r="1" fill={bead} />
      <circle cx="12.5" cy="7" r="1" fill={bead} />
      <circle cx="7" cy="12.5" r="1" fill={bead} />
      <circle cx="1.5" cy="7" r="1" fill={bead} />
    </svg>
  )
}

export function RailNode({ n, state, dark, working }: { n: number; state: RailState; dark?: boolean; working?: boolean }) {
  const base = 'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-300 sm:h-9 sm:w-9'
  const style = { viewTransitionName: `ob-node-${n}` } as React.CSSProperties
  if (state === 'done')
    return (
      <span className={cx(base, 'ob-pop', dark ? 'bg-white text-deep' : 'bg-deep text-white')} style={style}>
        <IconCheck size={14} />
      </span>
    )
  if (state === 'active')
    return (
      <span className={cx(base, dark ? 'bg-deep-2 ring-2 ring-glow/70' : 'bg-white ring-2 ring-brand-2')} style={style}>
        {/* El halo va en una capa aparte: el anillo del nodo también es una sombra */}
        {working && <span aria-hidden="true" className="live-dot absolute inset-0 rounded-full" />}
        <MiniDiatom dark={dark} />
      </span>
    )
  if (state === 'info')
    return (
      <span className={cx(base, 'border border-line bg-white text-ink-2')} style={style}>
        <IconInfo size={15} />
      </span>
    )
  return (
    <span className={cx(base, 'border border-line bg-white text-[12px] font-semibold text-faint num')} style={style}>
      {n}
    </span>
  )
}

/**
 * Un paso de la línea. Los nodos hechos bajan para quedar centrados con su fila
 * resumen (58 px de alto); el tramo hacia el siguiente nodo empieza 4 px por
 * debajo del nodo y llega hasta el siguiente aunque este también haya bajado.
 */
export function RailStep({
  n,
  state,
  nodeState,
  dark,
  working,
  title,
  hint,
  hintSaved,
  summary,
  fill,
  last,
  nextDone,
  children,
}: {
  n: number
  state: RailState
  /** Estado del nodo si no coincide con el de la fila (el 4 se marca hecho antes de salir). */
  nodeState?: RailState
  dark?: boolean
  working?: boolean
  title: string
  hint?: string
  hintSaved?: boolean
  summary?: React.ReactNode
  fill?: boolean
  last?: boolean
  nextDone?: boolean
  children?: React.ReactNode
}) {
  const open = state === 'active' || state === 'info'
  const done = state === 'done'
  return (
    <li className={cx('relative grid grid-cols-[28px_1fr] gap-x-3 pb-6 sm:grid-cols-[36px_1fr] sm:gap-x-5', open && 'ob-step')}>
      {!last && (
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute left-[13px] w-0.5 overflow-hidden rounded-full sm:left-[17px]',
            done ? 'top-[47px] sm:top-[51px]' : 'top-[32px] sm:top-[40px]',
            nextDone ? '-bottom-[15px] sm:-bottom-[11px]' : 'bottom-0',
            open && 'hidden sm:block',
          )}
          style={{ background: `linear-gradient(${dark ? 'rgba(255,255,255,.2)' : 'var(--color-line, #e2e9e7)'} 50%, transparent 0) 0 0 / 2px 6px` }}
        >
          <span
            className="ob-rail-fill absolute inset-0"
            data-on={fill || undefined}
            style={{
              background: dark
                ? 'linear-gradient(var(--color-brand-2, #00a38c), var(--color-glow, #6ef0d2))'
                : 'linear-gradient(var(--color-brand-2, #00a38c), var(--color-deep, #04191c))',
            }}
          />
        </span>
      )}

      <div className={cx('relative z-[1] col-start-1 row-start-1 self-start', done && 'pt-[15px] sm:pt-[11px]')}>
        <RailNode n={n} state={nodeState ?? state} dark={dark} working={working} />
      </div>

      {open ? (
        <div className="ob-active col-span-2 col-start-1 row-start-1 grid min-w-0 grid-cols-subgrid" style={{ viewTransitionName: 'ob-active' } as React.CSSProperties}>
          {children}
        </div>
      ) : done ? (
        <div className="col-start-2 row-start-1 min-w-0">{summary}</div>
      ) : (
        <div className="col-start-2 row-start-1 min-w-0 pt-1 sm:pt-2" style={{ viewTransitionName: `ob-pend-${n}` } as React.CSSProperties}>
          <div className="text-[15px] font-semibold leading-5 text-faint">{title}</div>
          {hint && <div className={cx('mt-0.5 text-[13px] leading-[18px]', hintSaved ? 'text-mute' : 'text-faint')}>{hint}</div>}
        </div>
      )}
    </li>
  )
}

/** Cabecera del paso abierto: «Paso 2 de 4», el titular y el subtítulo. */
export function StepHeader({
  label,
  title,
  sub,
  dark,
  hKey,
  children,
}: {
  label?: string
  title: React.ReactNode
  sub?: React.ReactNode
  dark?: boolean
  hKey: string
  children?: React.ReactNode
}) {
  return (
    <div className="col-start-2 min-w-0 pt-1.5 sm:pt-2.5">
      {label && <p className={cx('font-mono text-[12px] leading-4', dark ? 'text-white/60' : 'text-mute')}>{label}</p>}
      <h1
        key={hKey}
        tabIndex={-1}
        className={cx(
          'anim-rise mt-1 text-balance text-[24px] font-extrabold leading-[1.15] tracking-[-0.03em] focus:outline-none sm:text-[30px]',
          dark ? 'text-white' : 'text-ink',
        )}
      >
        {title}
      </h1>
      {sub && (
        <div key={`${hKey}-sub`} className={cx('anim-rise mt-2 max-w-[52ch] text-[15px] leading-relaxed', dark ? 'text-white/70' : 'text-mute')} style={{ '--i': 1 } as React.CSSProperties}>
          {sub}
        </div>
      )}
      {children}
    </div>
  )
}
