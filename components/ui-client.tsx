'use client'

import { useEffect, useRef, useState } from 'react'

// Piezas de ui.tsx que necesitan el navegador (saber si un favicon cargó o falló).
// Los logotipos son el icono oficial de cada web (de /public/platforms o de /api/logo); nunca se dibujan aquí.

/** Comprueba tras hidratar si la imagen ya terminó antes de que React escuchara sus eventos. */
function useImageState(src: string | null) {
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error')
  useEffect(() => {
    setState(src ? 'loading' : 'error')
    const img = ref.current
    if (img && img.complete) setState(img.naturalWidth > 0 ? 'ok' : 'error')
  }, [src])
  return { ref, state, onLoad: () => setState('ok'), onError: () => setState('error') }
}

/**
 * Logo de una plataforma de IA en círculo: su icono oficial, guardado en
 * /public/platforms (sin pedirlo a terceros en cada visita); si falta, iniciales.
 */
export function PlatformLogo({ name, short, color, src, size }: { name: string; short: string; color: string; src: string | null; size: number }) {
  const { ref, state, onLoad, onError } = useImageState(src)
  if (state === 'error' || !src) {
    return (
      <span
        title={name}
        className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
        style={{ width: size, height: size, background: color, fontSize: size * 0.4, letterSpacing: '-0.02em' }}
      >
        {short}
      </span>
    )
  }
  return (
    <span title={name} className="relative inline-flex shrink-0 overflow-hidden rounded-full bg-white" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={src} alt={name} decoding="async" onLoad={onLoad} onError={onError} className="h-full w-full object-cover" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/[0.08]" />
    </span>
  )
}

/**
 * Logo de una marca como icono de app: la inicial hasta que carga y, después,
 * el cuadrado que prepara /api/logo con el icono de su web, a todo el tamaño.
 */
export function BrandLogo({ letter, domain }: { letter: string; domain: string }) {
  const src = `/api/logo?d=${encodeURIComponent(domain)}`
  const { ref, state, onLoad, onError } = useImageState(src)
  return (
    <>
      {state !== 'ok' && <span aria-hidden="true">{letter}</span>}
      {state !== 'error' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
          onError={onError}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: state === 'ok' ? 1 : 0 }}
        />
      )}
    </>
  )
}
