import Link from 'next/link'
import { Wordmark } from '@/components/Logo'
import { cx } from '@/components/ui'

// Piezas comunes de la web pública: contenedor, encabezados, cabecera de las
// páginas interiores, botones en píldora y los degradados marinos de Placton.

export function Container({
  className,
  narrow = false,
  wide = false,
  children,
}: {
  className?: string
  narrow?: boolean
  wide?: boolean
  children: React.ReactNode
}) {
  return <div className={cx('mx-auto w-full px-4 sm:px-6', narrow ? 'max-w-3xl' : wide ? 'max-w-[1200px]' : 'max-w-6xl', className)}>{children}</div>
}

export function SectionHeading({
  id,
  title,
  intro,
  center = false,
  as: Tag = 'h2',
}: {
  id?: string
  title: React.ReactNode
  intro?: React.ReactNode
  center?: boolean
  as?: 'h1' | 'h2'
}) {
  return (
    <div className={cx('max-w-2xl', center && 'mx-auto text-center')}>
      <Tag
        id={id}
        className={cx(
          'text-balance font-extrabold leading-[1.06] tracking-[-0.04em] text-ink',
          Tag === 'h1' ? 'text-[36px] sm:text-[52px]' : 'text-[30px] sm:text-[44px]',
        )}
      >
        {title}
      </Tag>
      {intro && <p className="mt-4 text-pretty text-[16px] leading-relaxed text-mute sm:text-[17px]">{intro}</p>}
    </div>
  )
}

/** Fondo suave de cabecera para las páginas interiores. */
export const SOFT_TOP: React.CSSProperties = {
  backgroundImage: [
    'radial-gradient(700px 320px at 20% -10%, rgba(79, 182, 216, 0.30), transparent 70%)',
    'radial-gradient(700px 320px at 85% -15%, rgba(159, 231, 218, 0.55), transparent 70%)',
  ].join(', '),
}

/** Cabecera de las páginas interiores (deja sitio a la barra flotante). */
export function PageHero({ title, intro, center = false }: { title: React.ReactNode; intro?: React.ReactNode; center?: boolean }) {
  return (
    <section className="pb-10 pt-32 sm:pb-14 sm:pt-40" style={SOFT_TOP}>
      <Container>
        <div className="anim-rise">
          <SectionHeading as="h1" title={title} intro={intro} center={center} />
        </div>
      </Container>
    </section>
  )
}

/** Logo enlazado a la portada, con etiqueta en el idioma de la página. */
export function BrandLink({ label, tone = 'light' }: { label: string; tone?: 'light' | 'dark' }) {
  return (
    <Link href="/" className={cx('inline-flex shrink-0 items-center', tone === 'dark' ? 'text-white' : 'text-deep')} aria-label={label}>
      <Wordmark height={21} />
    </Link>
  )
}

// Botones en píldora. Si terminan en una flecha, la flecha se adelanta un poco
// al pasar el ratón (en toda la web, sin tocar cada uso).
export const pillWhite =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-6 text-[15px] font-bold text-deep shadow-[0_12px_30px_-12px_rgba(4,25,28,0.45)] transition-colors hover:bg-[#ecfbf7] [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200 hover:[&>svg:last-child]:translate-x-0.5'

export const pillDark =
  'inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-deep px-4 text-[14px] font-bold text-white transition-colors hover:bg-deep-2 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200 hover:[&>svg:last-child]:translate-x-0.5'

export const pillDarkLg =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-deep px-6 text-[15px] font-bold text-white transition-colors hover:bg-deep-2 disabled:pointer-events-none disabled:opacity-60 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200 hover:[&>svg:last-child]:translate-x-0.5'

/** Fondo de página de la web pública. */
export const PAGE_BG = '#f2f4f3'

/** Degradado marino de la portada: azul mar arriba, aguamarina y blanco roto abajo. */
export const HERO_BG: React.CSSProperties = {
  backgroundColor: PAGE_BG,
  backgroundImage: [
    'radial-gradient(55% 40% at 50% 0%, rgba(255, 255, 255, 0.16), transparent 70%)',
    'radial-gradient(40% 30% at 12% 38%, rgba(110, 240, 210, 0.22), transparent 70%)',
    'radial-gradient(40% 30% at 90% 30%, rgba(42, 120, 214, 0.35), transparent 70%)',
    // Paradas en píxeles: el texto blanco siempre queda sobre la parte azul.
    'linear-gradient(180deg, #2a78d6 0px, #3488d8 240px, #45a3d8 420px, #6fcfdc 570px, #9fe7da 690px, #f2f4f3 100%)',
  ].join(', '),
}

/** Degradado suave para los paneles de las funciones y la auditoría. */
export const OCEAN_PANEL: React.CSSProperties = {
  backgroundColor: '#e9f4f6',
  backgroundImage: [
    'radial-gradient(55% 65% at 15% 20%, rgba(159, 231, 218, 0.95), transparent 70%)',
    'radial-gradient(55% 60% at 90% 15%, rgba(79, 182, 216, 0.55), transparent 72%)',
    'radial-gradient(60% 65% at 75% 100%, rgba(42, 120, 214, 0.30), transparent 72%)',
    'radial-gradient(45% 50% at 5% 100%, rgba(0, 163, 140, 0.28), transparent 70%)',
  ].join(', '),
}

/** Grano fino encima de los degradados para que parezcan foto y no CSS plano. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.10 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

function panel(base: string, layers: string[]): React.CSSProperties {
  return { backgroundColor: base, backgroundImage: [GRAIN, ...layers].join(', ') }
}

/**
 * Un fondo distinto para cada bloque de funciones y para la auditoría, todos
 * del mar: arrecife, laguna, bajíos, bosque de algas y puesta de sol.
 */
export const PANELS = {
  reef: panel('#ffd9c8', [
    'radial-gradient(60% 70% at 18% 22%, rgba(255, 255, 255, 0.85), transparent 70%)',
    'radial-gradient(55% 60% at 85% 18%, rgba(255, 138, 112, 0.85), transparent 70%)',
    'radial-gradient(60% 65% at 70% 95%, rgba(235, 104, 52, 0.75), transparent 72%)',
    'radial-gradient(50% 55% at 8% 90%, rgba(232, 123, 164, 0.75), transparent 70%)',
  ]),
  lagoon: panel('#cfd4ff', [
    'radial-gradient(55% 60% at 15% 15%, rgba(159, 231, 218, 0.9), transparent 70%)',
    'radial-gradient(60% 70% at 88% 25%, rgba(122, 111, 240, 0.85), transparent 72%)',
    'radial-gradient(60% 65% at 30% 100%, rgba(74, 58, 167, 0.7), transparent 72%)',
    'radial-gradient(45% 50% at 95% 95%, rgba(79, 182, 216, 0.8), transparent 70%)',
  ]),
  shallows: panel('#d9ecfb', [
    'radial-gradient(60% 65% at 20% 85%, rgba(255, 228, 140, 0.95), transparent 70%)',
    'radial-gradient(55% 60% at 85% 15%, rgba(42, 120, 214, 0.75), transparent 72%)',
    'radial-gradient(50% 55% at 10% 10%, rgba(143, 211, 244, 0.95), transparent 70%)',
    'radial-gradient(45% 50% at 95% 90%, rgba(255, 245, 214, 0.9), transparent 70%)',
  ]),
  kelp: panel('#d6f2e4', [
    'radial-gradient(55% 60% at 15% 20%, rgba(215, 245, 155, 0.95), transparent 70%)',
    'radial-gradient(60% 70% at 90% 30%, rgba(0, 163, 140, 0.7), transparent 72%)',
    'radial-gradient(55% 60% at 40% 100%, rgba(0, 131, 0, 0.45), transparent 72%)',
    'radial-gradient(45% 50% at 5% 95%, rgba(79, 182, 216, 0.6), transparent 70%)',
  ]),
  sunset: panel('#ff9b6a', [
    'radial-gradient(70% 80% at 10% 10%, rgba(255, 196, 120, 0.95), transparent 70%)',
    'radial-gradient(60% 70% at 95% 20%, rgba(232, 123, 164, 0.95), transparent 72%)',
    'radial-gradient(70% 70% at 70% 105%, rgba(122, 111, 240, 0.75), transparent 72%)',
    'radial-gradient(50% 55% at 0% 100%, rgba(235, 104, 52, 0.9), transparent 70%)',
  ]),
} satisfies Record<string, React.CSSProperties>

export type PanelId = keyof typeof PANELS

/**
 * Puntos de plancton sobre el degradado de la portada: flotan y titilan despacio
 * (cada uno a su ritmo), se paran fuera de vista y se quedan quietos con
 * «reducir movimiento». Al bajar, la capa entera va más lenta que la página.
 */
const DOTS: [number, number, number, number][] = [
  // x %, y %, tamaño px, opacidad
  [6, 18, 3, 0.7],
  [11, 46, 2, 0.55],
  [17, 30, 4, 0.45],
  [22, 62, 2, 0.6],
  [28, 14, 2, 0.75],
  [33, 52, 3, 0.35],
  [41, 9, 2, 0.6],
  [46, 70, 2, 0.4],
  [57, 12, 3, 0.55],
  [63, 58, 2, 0.5],
  [69, 24, 2, 0.7],
  [74, 44, 4, 0.4],
  [80, 10, 2, 0.6],
  [85, 66, 3, 0.45],
  [91, 34, 2, 0.7],
  [95, 54, 3, 0.5],
  [3, 74, 2, 0.4],
  [51, 38, 2, 0.35],
]

export function Plankton() {
  return (
    <div aria-hidden="true" className="par-slow pointer-events-none absolute inset-0">
      {DOTS.map(([x, y, s, o], i) => (
        <span
          key={i}
          className="plk absolute rounded-full"
          // La opacidad va en --o porque el titileo la hace respirar a partir de ese valor.
          style={
            {
              left: `${x}%`,
              top: `${y}%`,
              width: s,
              height: s,
              '--o': o,
              '--dur': `${9 + ((i * 7) % 9)}s`,
              '--delay': `${(-i * 1.3).toFixed(1)}s`,
              background: i % 3 === 0 ? '#bff8ea' : '#ffffff',
              boxShadow: s >= 3 ? `0 0 ${s * 3}px rgba(255, 255, 255, 0.7)` : undefined,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
