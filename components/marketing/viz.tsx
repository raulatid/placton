import { IconCheck, IconX } from '@/components/icons'
import { cx } from '@/components/ui'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { CountUp } from './CountUp'
import { DIRECT, INDIRECT, fmtNum } from './format'

// Piezas visuales pequeñas de la web pública, en los dos idiomas. Imitan las
// del panel, pero con números y textos formateados según el idioma.

export { DIRECT, INDIRECT, fmtNum, fmtPct } from './format'

export function DeltaChip({
  value,
  lang,
  suffix = '',
  invert = false,
  digits = 0,
}: {
  value: number
  lang: Lang
  suffix?: string
  invert?: boolean
  digits?: number
}) {
  const good = invert ? value < 0 : value > 0
  return (
    <span className={cx('inline-flex rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold num', good ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
      {value > 0 ? '↑' : '↓'} {fmtNum(Math.abs(value), lang, digits)}
      {suffix}
    </span>
  )
}

/**
 * Anillo de progreso con el valor en el centro. Se dibuja al aparecer
 * (anim-ring) y, con `count`, la cifra del centro sube a la vez.
 */
export function Ring({
  value,
  size = 96,
  color = DIRECT,
  center,
  caption,
  stroke = 10,
  count,
  i = 0,
}: {
  value: number
  size?: number
  color?: string
  center: string
  caption?: string
  stroke?: number
  /** Cifra del centro que sube; `delay` en ms desde que se ve (por defecto, el del anillo). */
  count?: { value: number; lang: Lang; delay?: number }
  i?: number
}) {
  const r = 50
  const v = Math.max(0, Math.min(100, value))
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" className="shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#eef3f1" strokeWidth={stroke} />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={100 - v}
        transform="rotate(-90 60 60)"
        className="anim-ring"
        style={{ '--i': i } as React.CSSProperties}
      />
      <text x="60" y={caption ? 60 : 69} textAnchor="middle" fontSize={caption ? 30 : 28} fontWeight="800" fill="#0b1d21" className="num">
        {count ? <CountUp as="tspan" value={count.value} lang={count.lang} delay={count.delay ?? 150 + i * 80} /> : center}
      </text>
      {caption && (
        <text x="60" y="80" textAnchor="middle" fontSize="12" fill="#66797d">
          {caption}
        </text>
      )}
    </svg>
  )
}

export function scoreColor(score: number): string {
  return score >= 75 ? '#047857' : score >= 50 ? '#b45309' : '#c2410c'
}

export type CheckStatus = 'ok' | 'warn' | 'fail'

const STATUS_DOT: Record<CheckStatus, string> = { ok: '#047857', warn: '#d97706', fail: '#c2410c' }

/** Estado de un punto de la auditoría: círculo neutro con el glifo en tinta y el color en un punto. */
export function StatusIcon({ status }: { status: CheckStatus }) {
  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-line-2 text-ink">
      {status === 'ok' ? (
        <IconCheck size={12} />
      ) : status === 'warn' ? (
        <span className="text-[12px] font-extrabold leading-none">!</span>
      ) : (
        <IconX size={12} />
      )}
      <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-white" style={{ background: STATUS_DOT[status] }} />
    </span>
  )
}

export interface MentionDatum {
  key: string
  name: string
  own: boolean
  direct: number
  indirect: number
}

function niceMax(n: number): number {
  if (n <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(n))
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * pow >= n) return s * pow
  return 10 * pow
}

/** Barra de progreso que crece desde la izquierda al cargar. */
export function GrowBar({ value, color = DIRECT, className, i = 0 }: { value: number; color?: string; className?: string; i?: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line-2', className)}>
      <div className="anim-grow-x h-full rounded-full" style={{ width: `${v}%`, background: color, '--i': i } as React.CSSProperties} />
    </div>
  )
}

/** Barras apiladas de menciones directas e indirectas por marca (crecen al cargar). */
export function MentionChart({ data, lang, height = 200 }: { data: MentionDatum[]; lang: Lang; height?: number }) {
  const t = makeT(lang)
  const max = niceMax(Math.max(1, ...data.map((d) => d.direct + d.indirect)))
  const ticks = [max, max / 2, 0]
  return (
    <div className="px-4 pb-4 sm:px-5 sm:pb-5">
      <div className="mb-4 flex items-center gap-4 text-[12px] font-semibold text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DIRECT }} /> {t('Direct', 'Directas')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: INDIRECT }} /> {t('Indirect', 'Indirectas')}
        </span>
      </div>
      <div className="relative flex gap-1.5 pl-9" style={{ height }}>
        <div className="pointer-events-none absolute inset-0">
          {ticks.map((tick, i) => (
            <div key={tick} className="absolute left-0 right-0 flex items-center" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              <span className="w-8 -translate-y-1/2 pr-2 text-right text-[11px] text-faint num">{fmtNum(tick, lang)}</span>
              <span className={cx('h-px flex-1 -translate-y-1/2', tick === 0 ? 'bg-line' : 'bg-line-2')} />
            </div>
          ))}
        </div>
        {data.map((d, i) => (
          <div key={d.key} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <div
              className="anim-grow-y flex w-full max-w-[52px] flex-col justify-end"
              style={{ height: `${((d.direct + d.indirect) / max) * 100}%`, '--i': i } as React.CSSProperties}
            >
              <div className="w-full rounded-t-[4px]" style={{ height: `${(d.indirect / (d.direct + d.indirect)) * 100}%`, background: INDIRECT }} />
              <div className="mt-[2px] w-full flex-1" style={{ background: DIRECT }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 pl-9">
        {data.map((d) => (
          <span key={d.key} className={cx('block min-w-0 flex-1 truncate text-center text-[11.5px]', d.own ? 'font-bold text-ink' : 'text-mute')}>
            {d.name}
          </span>
        ))}
      </div>
    </div>
  )
}
