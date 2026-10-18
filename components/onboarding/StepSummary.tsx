'use client'

import { useT } from '../LangProvider'
import { cx } from '../ui'

/**
 * Fila resumen de un paso hecho: el nombre del paso arriba, su dato debajo y
 * «Cambiar» a la derecha. Un toque vuelve a ese paso. Bloqueada (en la primera
 * medición, sin prueba o mientras se guarda) no se puede pulsar.
 */
export function StepSummary({
  label,
  value,
  ariaValue,
  onEdit,
  locked,
  dark,
  transitionName,
}: {
  label: string
  value: React.ReactNode
  ariaValue: string
  onEdit: () => void
  locked?: boolean
  dark?: boolean
  transitionName?: string
}) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={locked ? undefined : onEdit}
      aria-disabled={locked || undefined}
      aria-label={locked ? `${label}, ${ariaValue}` : t(`Edit: ${label}, ${ariaValue}`, `Cambiar: ${label}, ${ariaValue}`)}
      className={cx(
        'flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors',
        dark ? 'border-white/10 bg-white/[.06] text-white' : 'border-white bg-white/70',
        locked ? 'cursor-default' : !dark && 'hover:bg-white',
      )}
      style={transitionName ? ({ viewTransitionName: transitionName } as React.CSSProperties) : undefined}
    >
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[12px] leading-4', dark ? 'text-white/60' : 'text-mute')}>{label}</span>
        <span className={cx('mt-0.5 flex min-w-0 items-center gap-2 text-[14.5px] font-semibold leading-5', dark ? 'text-white' : 'text-ink')}>{value}</span>
      </span>
      {!locked && <span className="shrink-0 text-[13px] text-mute">{t('Edit', 'Cambiar')}</span>}
    </button>
  )
}
