import { BrandLogo } from '@/components/ui-client'

/**
 * Logo de una marca de los ejemplos como icono de app (el de su web, a todo el
 * cuadrado), con la inicial en tinta mientras carga o si falla. Va
 * siempre junto al nombre escrito, así que se oculta a los lectores de pantalla.
 */
export function BrandMark({ name, domain, size = 26 }: { name: string; domain: string; color?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[26%] font-extrabold leading-none shadow-[0_1px_2px_rgba(4,25,28,0.08)]"
      style={{ width: size, height: size, color: '#31464b', fontSize: Math.round(size * 0.46), background: '#eef1ef' }}
    >
      <BrandLogo letter={(name.trim()[0] ?? '?').toUpperCase()} domain={domain} />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/[0.07]" />
    </span>
  )
}
