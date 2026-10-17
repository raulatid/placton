import { Delta, InfoTip, cx } from '../ui'
import { change, int, percent } from './format'

// Piezas del panel de administración: secciones, cifras, mapas de calor,
// embudo y listas con barra. Sin color de fondo en las fichas: el color se
// reserva para los datos (verde Placton para lo bueno, naranja para costes).

export const TEAL = '#00a38c'
export const ORANGE = '#eb6834'
export const NEUTRAL = '#cfdad7'

export function Section({ id, title, hint, children, right }: { id: string; title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.03em]">{title}</h2>
          {hint && <p className="mt-0.5 max-w-3xl text-[13px] text-mute">{hint}</p>}
        </div>
        {right}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Panel({ title, hint, info, right, children, className, pad = true }: { title?: string; hint?: string; info?: string; right?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={cx('card min-w-0', className)}>
      {title && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.01em]">
              {title}
              {info && <InfoTip text={info} />}
            </h3>
            {hint && <p className="mt-0.5 text-[12.5px] text-mute">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={pad ? 'px-5 pb-5 pt-2' : ''}>{children}</div>
    </div>
  )
}

/** Cifra principal con su variación frente al periodo anterior. */
export function Kpi({
  label,
  value,
  info,
  now,
  prev,
  invert,
  foot,
  big,
}: {
  label: string
  value: string
  info?: string
  now?: number | null
  prev?: number | null
  invert?: boolean
  foot?: React.ReactNode
  big?: boolean
}) {
  const delta = change(now, prev)
  return (
    <div className="card flex min-w-0 flex-col p-5">
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-mute">
        <span className="truncate">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <div className={cx('mt-2 font-extrabold tracking-[-0.035em] text-ink num', big ? 'text-[34px] leading-none' : 'text-[26px] leading-none')}>{value}</div>
      <div className="mt-3 flex min-h-[22px] flex-wrap items-center gap-2 text-[12px] text-mute">
        {delta !== null && (
          <>
            <Delta value={delta} suffix=" %" invert={invert} lang="es" />
            <span>vs. periodo anterior</span>
          </>
        )}
        {delta === null && foot}
      </div>
      {delta !== null && foot && <div className="mt-1 text-[12px] text-mute">{foot}</div>}
    </div>
  )
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Mapa de calor día de la semana × hora (hora de Madrid). */
export function Heatmap({ values, unit, unitOne }: { values: number[][]; unit: string; unitOne?: string }) {
  const max = Math.max(0, ...values.flat())
  const total = values.flat().reduce((a, b) => a + b, 0)
  let best = { d: 0, h: 0, v: -1 }
  values.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { d, h, v })))
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: '34px repeat(24, minmax(0, 1fr))' }}>
            {values.map((row, d) => (
              <Row key={d} label={DAYS[d]} row={row} max={max} unit={unit} />
            ))}
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="pt-1 text-center text-[10px] text-faint num">
                {h % 3 === 0 ? h : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-mute">
        <span>{total ? `Momento más activo: ${DAYS[best.d].toLowerCase()} a las ${best.h}:00 (${int(best.v)} ${best.v === 1 ? unitOne ?? unit : unit})` : 'Todavía sin datos en este periodo.'}</span>
        <span className="inline-flex items-center gap-1.5">
          Menos
          {[0.08, 0.3, 0.55, 0.8, 1].map((a) => (
            <span key={a} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `rgba(0,163,140,${a})` }} />
          ))}
          Más
        </span>
      </div>
    </div>
  )
}

function Row({ label, row, max, unit }: { label: string; row: number[]; max: number; unit: string }) {
  return (
    <>
      <span className="self-center text-[11px] font-semibold text-mute">{label}</span>
      {row.map((v, h) => (
        <span
          key={h}
          title={`${label} ${h}:00 · ${int(v)} ${unit}`}
          className="aspect-square rounded-[4px]"
          style={{ background: v && max ? `rgba(0,163,140,${0.1 + 0.9 * (v / max)})` : '#f1f4f3' }}
        />
      ))}
    </>
  )
}

/** Embudo horizontal: cada paso con su volumen y la conversión desde el anterior. */
export function Funnel({ steps }: { steps: { label: string; n: number; hint: string }[] }) {
  const first = Math.max(1, steps[0]?.n ?? 1)
  return (
    <ol className="space-y-3.5">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].n : null
        return (
          <li key={s.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-1.5 font-semibold text-ink">
                {s.label}
                <InfoTip text={s.hint} />
              </span>
              <span className="flex items-baseline gap-3 num">
                {prev !== null && <span className="text-[12px] text-mute">{prev ? percent(s.n / prev) : 'Sin datos'} del paso anterior</span>}
                <span className="font-bold text-ink">{int(s.n)}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#eef2f1]">
              <div className="anim-grow-x h-full rounded-full" style={{ width: `${Math.max(s.n ? 1.5 : 0, (s.n / first) * 100)}%`, background: i === steps.length - 1 ? TEAL : '#0b6b62' }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Lista con barra de proporción (páginas, fuentes, países…). */
export function BarList({ rows, unit, empty = 'Todavía sin datos.' }: { rows: { label: string; n: number }[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  const total = rows.reduce((a, b) => a + b.n, 0)
  if (!rows.length) return <p className="py-4 text-[13px] text-mute">{empty}</p>
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.label} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg px-2.5 py-1.5 text-[13px]">
          <span className="absolute inset-y-0 left-0 rounded-lg bg-[#eef3f1]" style={{ width: `${(r.n / max) * 100}%` }} />
          <span className="relative min-w-0 truncate text-ink-2" title={r.label}>
            {r.label}
          </span>
          <span className="relative shrink-0 font-semibold text-ink num">
            {int(r.n)}
            {unit ? ` ${unit}` : ''} <span className="ml-1 text-[11.5px] font-medium text-faint">{total ? percent(r.n / total, 0) : ''}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Línea de una cuenta de resultados: concepto, importe y su peso sobre los ingresos. */
export function PnlLine({ label, value, base, strong, negative, hint }: { label: string; value: string; base?: number | null; strong?: boolean; negative?: boolean; hint?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 py-2.5', strong && 'border-t border-line pt-3')}>
      <span className={cx('flex items-center gap-1.5 text-[13.5px]', strong ? 'font-bold text-ink' : 'text-ink-2')}>
        {label}
        {hint && <InfoTip text={hint} />}
      </span>
      <span className="flex items-baseline gap-3 num">
        {base !== undefined && base !== null && <span className="text-[12px] text-faint">{percent(base, 0)}</span>}
        <span className={cx('text-[14px]', strong ? 'text-[16px] font-extrabold text-ink' : 'font-semibold', negative && 'text-ink-2')}>{value}</span>
      </span>
    </div>
  )
}

/** Aviso de una línea (impagos, saldos bajos…), sobrio: texto y un trazo de color. */
export function Flag({ tone, children }: { tone: 'bad' | 'warn' | 'ok'; children: React.ReactNode }) {
  const color = tone === 'bad' ? '#c2410c' : tone === 'warn' ? '#b45309' : '#047857'
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-[13px] leading-relaxed text-ink-2">
      <span aria-hidden="true" className="mt-[9px] h-[2px] w-3.5 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
