'use client'

import { useT } from '../LangProvider'
import { cx, Skeleton, stagger } from '../ui'

// Piezas de las pantallas de carga del panel. Imitan la forma de cada página
// (título, fichas, gráfica, filas) para que la navegación se sienta inmediata.

/** Envoltorio accesible: anuncia «Cargando…» sin texto visible. */
export function Loading({ children }: { children: React.ReactNode }) {
  const t = useT()
  return (
    <div role="status" aria-busy="true" className="anim-fade">
      <span className="sr-only">{t('Loading…', 'Cargando…')}</span>
      {children}
    </div>
  )
}

export function SkHeader({ right = true, back = false }: { right?: boolean; back?: boolean }) {
  return (
    <>
      {back && <Skeleton className="mb-4 h-4 w-24" />}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-56 rounded-lg! sm:h-9" />
          <Skeleton className="h-4 w-[min(420px,80vw)]" />
        </div>
        {right && <Skeleton className="h-9 w-32 rounded-xl!" />}
      </div>
    </>
  )
}

export function SkFilters({ n = 2 }: { n?: number }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {Array.from({ length: n }, (_, k) => (
        <Skeleton key={k} className="h-9 w-40 rounded-xl" />
      ))}
    </div>
  )
}

/** Fichas de cifras (con minigráfica opcional). */
export function SkStats({ n = 4, spark = false, className }: { n?: number; spark?: boolean; className?: string }) {
  return (
    <div className={cx('grid grid-cols-2 gap-3 lg:gap-4', n === 3 ? 'sm:grid-cols-3' : 'lg:grid-cols-4', className)}>
      {Array.from({ length: n }, (_, k) => (
        <div key={k} className="card p-4 sm:p-5" style={stagger(k)}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-24 rounded-lg!" />
          {spark && k === 0 ? <Skeleton className="mt-3 h-8 w-full" /> : <Skeleton className="mt-3 h-3 w-32" />}
        </div>
      ))}
    </div>
  )
}

function SkCardHeader({ right = false }: { right?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-6 pb-3 pt-6">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      {right && <Skeleton className="h-7 w-28 rounded-lg!" />}
    </div>
  )
}

/** Tarjeta con gráfica de columnas. */
export function SkChartCard({ className }: { className?: string }) {
  const heights = [72, 54, 88, 40, 63, 30, 48, 22]
  return (
    <div className={cx('card', className)}>
      <SkCardHeader right />
      <div className="px-6 pb-6">
        <div className="mb-4 flex gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex h-56 items-end gap-1.5 pl-8">
          {heights.map((h, k) => (
            <div key={k} className="flex h-full flex-1 items-end justify-center">
              <Skeleton className="w-full max-w-[44px] rounded-b-none! rounded-t-md!" style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Tarjeta con lista de filas (avatar, dos líneas y un valor). */
export function SkListCard({ rows = 4, className, header = true }: { rows?: number; className?: string; header?: boolean }) {
  return (
    <div className={cx('card overflow-hidden', className)}>
      {header && <SkCardHeader />}
      <div className="divide-y divide-line-2 border-t border-line-2">
        {Array.from({ length: rows }, (_, k) => (
          <div key={k} className="flex items-center gap-3 px-6 py-3.5">
            <Skeleton className="h-7 w-7 shrink-0 rounded-lg!" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5" style={{ width: `${70 - ((k * 13) % 35)}%` }} />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <Skeleton className="h-6 w-14 rounded-full!" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tabla: cabecera y filas con columnas fijas. */
export function SkTableCard({ rows = 6, cols = 5, header = true, className }: { rows?: number; cols?: number; header?: boolean; className?: string }) {
  return (
    <div className={cx('card overflow-hidden', className)}>
      {header && <SkCardHeader />}
      <div className="flex gap-4 border-y border-line-2 bg-[#f8faf9] px-6 py-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={cx('h-2.5', c === 0 ? 'w-1/4' : 'flex-1')} />
        ))}
      </div>
      <div className="divide-y divide-line-2">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 px-6 py-3.5">
            {Array.from({ length: cols }, (_, c) =>
              c === 0 ? (
                <div key={c} className="flex w-1/4 items-center gap-2.5">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-lg!" />
                  <Skeleton className="h-3.5 flex-1" />
                </div>
              ) : (
                <Skeleton key={c} className="h-3 flex-1" style={{ maxWidth: `${50 + ((r + c) * 17) % 50}%` }} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Respuestas de IA (Menciones, Búsquedas, detalle de pregunta). */
export function SkAnswerCards({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: n }, (_, k) => (
        <div key={k} className="card overflow-hidden">
          <div className="space-y-2.5 border-b border-line-2 px-6 py-3.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-[18px] w-[18px] rounded-full!" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
            <div className="space-y-2.5 px-6 py-4">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="space-y-2 border-t border-line-2 px-6 py-4 lg:border-l lg:border-t-0">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Rejilla de tarjetas pequeñas (búsquedas recientes, ideas). */
export function SkCardGrid({ n = 4, className, tall = false }: { n?: number; className?: string; tall?: boolean }) {
  return (
    <div className={cx('grid gap-3', className)}>
      {Array.from({ length: n }, (_, k) => (
        <div key={k} className="card flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
          {tall && <Skeleton className="h-3 w-full" />}
          {tall && <Skeleton className="h-3 w-4/5" />}
          <div className="mt-2 flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-9 w-full rounded-full!" />
        </div>
      ))}
    </div>
  )
}

/** Tarjeta de formulario (campos y botón). */
export function SkFormCard({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div className={cx('card', className)}>
      <SkCardHeader />
      <div className="grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, k) => (
          <div key={k} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full rounded-xl!" />
          </div>
        ))}
        <Skeleton className="h-10 w-36 rounded-xl!" />
      </div>
    </div>
  )
}
