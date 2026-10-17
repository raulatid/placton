import Link from 'next/link'
import { locale, type Lang } from '@/lib/i18n-shared'
import { IconInfo } from './icons'
import { BrandLogo, PlatformLogo } from './ui-client'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-deep text-white hover:bg-deep-2 border border-deep',
  secondary: 'bg-white text-ink border border-line hover:border-faint',
  ghost: 'text-ink-2 hover:bg-line-2 border border-transparent',
  danger: 'bg-white text-bad border border-line hover:border-bad/40 hover:bg-line-2',
  light: 'bg-glow text-deep hover:bg-white border border-glow',
}
const SIZE = { sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5', md: 'h-10 px-4 text-sm rounded-xl gap-2', lg: 'h-12 px-5 text-[15px] rounded-xl gap-2' }

export function btnClass(variant: BtnVariant = 'primary', size: keyof typeof SIZE = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
    BTN[variant],
    SIZE[size],
    extra,
  )
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: { href: string; variant?: BtnVariant; size?: keyof typeof SIZE; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
>) {
  return (
    <Link href={href} className={btnClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}

/** Retardo escalonado para las animaciones de entrada (.anim-rise, .anim-fade…). */
export function stagger(i: number, extra?: React.CSSProperties): React.CSSProperties {
  return { '--i': i, ...extra } as React.CSSProperties
}

/**
 * Tarjeta base. `i` la hace entrar escalonada; `lift` le da relieve al pasar el
 * ratón. Con las dos, entra con fundido (la subida pisaría el transform de .lift).
 * Una tarjeta animada crea su propio contexto de apilamiento: al pasar el ratón
 * o con el foco dentro se pone delante para que sus avisos y menús no queden tapados.
 */
export const RAISE = 'relative hover:z-[5] focus-within:z-[5]'

export function Card({ className, children, i, lift }: { className?: string; children: React.ReactNode; i?: number; lift?: boolean }) {
  const enter = i === undefined ? null : lift ? 'anim-fade' : 'anim-rise'
  return (
    <section className={cx('card', lift && 'lift', enter, (i !== undefined || lift) && RAISE, className)} style={i === undefined ? undefined : stagger(i)}>
      {children}
    </section>
  )
}

/** Ficha de cifra pequeña (cabecera de Menciones, Fuentes, detalle de pregunta…). */
export function StatTile({ label, value, i = 0, className, valueClassName, children }: { label: React.ReactNode; value: React.ReactNode; i?: number; className?: string; valueClassName?: string; children?: React.ReactNode }) {
  return (
    <div className={cx('card anim-rise p-5 sm:p-6', RAISE, className)} style={stagger(i)}>
      <div className="text-[11.5px] font-bold uppercase tracking-[0.09em] text-mute">{label}</div>
      <div className={cx('mt-3 text-[30px] font-extrabold leading-none tracking-[-0.035em] num', valueClassName)}>{value}</div>
      {children}
    </div>
  )
}

/** Clases del control segmentado (pestañas pequeñas dentro de una cápsula). */
export const segmentWrap = 'inline-flex rounded-xl border border-line/80 bg-white/70 p-1 text-[13px] font-semibold shadow-[0_1px_2px_rgba(4,25,28,0.05)] backdrop-blur'
export function segmentItem(active: boolean): string {
  return cx('rounded-lg px-3 py-1.5 transition-colors duration-200', active ? 'bg-deep text-white shadow-[0_1px_2px_rgba(4,25,28,0.2)]' : 'text-ink-2 hover:bg-line-2')
}

/** Botón de paginación en cápsula. */
export const pagerBtn = 'rounded-full border border-line bg-white px-3.5 py-1.5 font-semibold shadow-[0_1px_2px_rgba(4,25,28,0.05)] transition-colors hover:border-brand-2/40 hover:text-brand'

/** Bloque gris con brillo para las pantallas de carga. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx('skeleton', className)} style={style} aria-hidden="true" />
}

export function CardHeader({ title, hint, info, right }: { title: React.ReactNode; hint?: React.ReactNode; info?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-[var(--card-px,1.25rem)] pt-[var(--card-px,1.25rem)] pb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-[16px] font-bold tracking-[-0.015em]">
          {title}
          {info && <InfoTip text={info} />}
        </h2>
        {hint && <p className="mt-0.5 text-[13px] text-mute">{hint}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function InfoTip({ text, align = 'center' }: { text: string; align?: 'center' | 'end' }) {
  return (
    <span className="group relative inline-flex cursor-help text-faint transition-colors hover:text-mute" tabIndex={0} aria-label={text}>
      <IconInfo size={14} />
      {/* Oculto con display: none para que no ensanche la página cuando el icono está al borde */}
      <span
        className={cx(
          'pointer-events-none absolute top-full z-30 mt-2 hidden w-60 animate-[p-rise_0.15s_ease-out_both] rounded-lg bg-deep px-3 py-2 text-[12px] font-medium normal-case leading-snug tracking-normal text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,0.5)] group-hover:block group-focus:block motion-reduce:animate-none',
          align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
        )}
      >
        {text}
      </span>
    </span>
  )
}

export function PageHeader({ title, hint, right }: { title: string; hint?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="anim-rise">
        <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.04em] sm:text-[40px]">{title}</h1>
        {hint && <p className="mt-2 max-w-2xl text-[14px] text-mute">{hint}</p>}
      </div>
      {right && (
        // Por encima de las tarjetas: aquí viven desplegables como el selector de periodo.
        <div className="anim-fade relative z-20" style={stagger(1)}>
          {right}
        </div>
      )}
    </div>
  )
}

function TrendArrow({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'up' ? <path d="M5 8.5V1.8M1.8 4.8 5 1.6l3.2 3.2" /> : dir === 'down' ? <path d="M5 1.5v6.7M1.8 5.2 5 8.4l3.2-3.2" /> : <path d="M2 5h6" />}
    </svg>
  )
}

/**
 * Chip de variación frente al periodo anterior: icono circular con flecha y la
 * cifra, en verde si es buena noticia y en rojo si no (`invert` para posiciones).
 */
export function Delta({ value, suffix = '', invert = false, precision = 0, lang = 'en' }: { value: number | null; suffix?: string; invert?: boolean; precision?: number; lang?: Lang }) {
  // Píldora neutra con el texto en tinta; solo la flecha lleva color.
  const chip = 'inline-flex items-center gap-1 rounded-full bg-white px-2 py-[3px] text-[12px] font-bold text-ink ring-1 ring-inset ring-line num'
  // Sin periodo anterior no se enseña nada: la ficha queda limpia.
  if (value === null || !Number.isFinite(value)) return null
  const rounded = Number(value.toFixed(precision))
  if (rounded === 0)
    return (
      <span className={cx(chip, 'text-mute')}>
        <span className="text-faint">
          <TrendArrow dir="flat" />
        </span>
        0{suffix}
      </span>
    )
  const good = invert ? rounded < 0 : rounded > 0
  return (
    <span className={chip}>
      <span style={{ color: good ? '#047857' : '#c2410c' }}>
        <TrendArrow dir={rounded > 0 ? 'up' : 'down'} />
      </span>
      {rounded > 0 ? '+' : '−'}
      {Math.abs(rounded).toLocaleString(locale(lang))}
      {suffix}
    </span>
  )
}

/** Barra horizontal 0-100 que crece desde la izquierda al cargar (`i` escalona). */
export function Bar({ value, color = 'var(--color-brand-2)', className, i = 0 }: { value: number; color?: string; className?: string; i?: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line-2', className)}>
      {/* El mismo color, un punto más claro al final, con un brillo al aparecer */}
      <div
        className="anim-grow-x sheen h-full rounded-full"
        style={stagger(i, { width: `${v}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 80%, #ffffff))` })}
      />
    </div>
  )
}

// Color sin teñir: nunca texto de un color sobre un fondo del mismo color. Las
// insignias son neutras (o tinta, para «Tú») y el estado va en un punto.
const STATUS_DOT = { good: '#047857', warn: '#d97706', bad: '#c2410c' } as const

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'good' | 'warn' | 'bad' | 'dark'; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-line-2 text-ink-2',
    brand: 'bg-deep text-white',
    dark: 'bg-deep text-white',
    good: 'bg-white text-ink-2 ring-1 ring-inset ring-line',
    warn: 'bg-white text-ink-2 ring-1 ring-inset ring-line',
    bad: 'bg-white text-ink-2 ring-1 ring-inset ring-line',
  }
  const dot = tone === 'good' || tone === 'warn' || tone === 'bad' ? STATUS_DOT[tone] : null
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold', tones[tone], className)}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  )
}

export const PLATFORM_META: Record<string, { name: string; short: string; color: string; domain: string }> = {
  chatgpt: { name: 'ChatGPT', short: 'GPT', color: '#10a37f', domain: 'chatgpt.com' },
  claude: { name: 'Claude', short: 'Cl', color: '#d97757', domain: 'claude.ai' },
  google: { name: 'Google AI', short: 'G', color: '#4285f4', domain: 'gemini.google.com' },
  perplexity: { name: 'Perplexity', short: 'Px', color: '#20808d', domain: 'perplexity.ai' },
  grok: { name: 'Grok', short: 'Gk', color: '#111111', domain: 'grok.com' },
}

/** Logo oficial de la plataforma (favicon) en círculo blanco; con las iniciales si no carga. */
export function PlatformDot({ id, size = 20 }: { id: string; size?: number }) {
  const m = PLATFORM_META[id]
  return <PlatformLogo name={m?.name ?? id} short={m?.short ?? id.slice(0, 2)} color={m?.color ?? '#66797d'} src={m ? `/platforms/${id}.png` : null} size={size} />
}

export function PlatformTag({ id }: { id: string }) {
  const m = PLATFORM_META[id] ?? { name: id }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
      <PlatformDot id={id} size={18} />
      {m.name}
    </span>
  )
}

/** Logo de una marca: favicon de su web si hay dominio; la inicial mientras carga o si no hay. */
export function BrandAvatar({ name, domain, color, size = 28 }: { name: string; domain?: string; color?: string; size?: number }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  const clean = domain?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()
  // Icono de app: el logo ocupa todo el cuadrado redondeado; un filo interior
  // muy fino lo separa del fondo cuando el icono es blanco. Mientras carga, la
  // inicial en tinta sobre gris (sin teñir con el color de la marca).
  void color
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden font-bold shadow-[0_1px_2px_rgba(4,25,28,0.08)]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        borderRadius: Math.max(6, Math.round(size * 0.26)),
        color: '#31464b',
        background: '#eef1ef',
      }}
      title={name}
    >
      {clean ? <BrandLogo letter={letter} domain={clean} /> : letter}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/[0.07]" />
    </span>
  )
}

/** Ilustración propia de los estados vacíos: una diatomea con su órbita (colores de marca). */
function EmptyArt() {
  const dots = Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2
    return { x: 48 + Math.cos(a) * 21, y: 48 + Math.sin(a) * 21, r: k % 2 === 0 ? 3 : 2, c: k % 2 === 0 ? '#00a38c' : '#6ef0d2' }
  })
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true" className="mb-4">
      <circle cx="48" cy="48" r="44" fill="#e5f6f2" opacity="0.55" />
      <circle cx="48" cy="48" r="34" stroke="#2a78d6" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2 5" />
      <g className="animate-[p-spin_28s_linear_infinite] [transform-origin:48px_48px] motion-reduce:animate-none">
        <circle cx="48" cy="14" r="3.2" fill="#2a78d6" />
        <circle cx="82" cy="48" r="2" fill="#6ef0d2" />
      </g>
      <circle cx="48" cy="48" r="21" stroke="#00a38c" strokeOpacity="0.35" strokeWidth="1.2" />
      {dots.map((d, k) => (
        <circle key={k} cx={d.x} cy={d.y} r={d.r} fill={d.c} />
      ))}
      <circle cx="48" cy="48" r="9" fill="#00a38c" />
      <circle cx="48" cy="48" r="4" fill="#6ef0d2" />
      <path d="M48 27v-6M48 75v-6M27 48h-6M75 48h-6" stroke="#2a78d6" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="anim-fade flex flex-col items-center justify-center px-6 py-14 text-center">
      <EmptyArt />
      <h3 className="text-[16px] font-bold tracking-[-0.01em]">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-mute">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Field({ label, hint, children, error }: { label: string; hint?: React.ReactNode; children: React.ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
      {error && <span className="mt-1 block text-[12px] font-medium text-bad">{error}</span>}
    </label>
  )
}

export const inputClass =
  'block w-full h-11 rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-faint focus:border-brand-2 focus:outline-none transition-colors'

export const textareaClass =
  'block w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus:border-brand-2 focus:outline-none transition-colors'

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'good' | 'warn' | 'bad'; children: React.ReactNode }) {
  // Aviso en blanco con una franja de color a la izquierda; el texto, en tinta.
  const bar = { info: '#00a38c', good: '#047857', warn: '#d97706', bad: '#c2410c' }[tone]
  return (
    <div className="anim-fade rounded-xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink-2" style={{ boxShadow: `inset 3px 0 0 ${bar}` }}>
      {children}
    </div>
  )
}

export function pct(n: number | null | undefined, digits = 0, lang: Lang = 'en'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return lang === 'es' ? 'Sin datos' : 'No data'
  const num = n.toLocaleString(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits })
  return lang === 'es' ? `${num} %` : `${num}%`
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }, lang: Lang = 'en'): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale(lang), { ...opts, timeZone: 'UTC' })
}

export function fmtDate(iso: string | null | undefined, lang: Lang = 'en'): string {
  if (!iso) return lang === 'es' ? 'Sin fecha' : 'No date'
  return new Date(iso).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
}

export function num(n: number, lang: Lang = 'en'): string {
  return n.toLocaleString(locale(lang))
}

export const SERIES = ['#00a38c', '#eb6834', '#2a78d6', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

/** Color fijo por posición de la marca en la lista seguida (propia = 1). */
export function seriesColor(index: number): string {
  return SERIES[index] ?? '#93a3a6'
}
