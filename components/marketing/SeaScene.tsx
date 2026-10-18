import Image from 'next/image'

// Fondo marino de la portada: rayos de luz tenues arriba y, donde empieza la
// captura del panel, la superficie del mar hasta el horizonte. Decorativo: los
// rayos se mecen, el mar sube y baja 3 px y, al bajar, los rayos van más lentos
// que la página. Todo se para fuera de vista y con «reducir movimiento».

const SEA_VERSION = 2

// La superficie es un render propio (scripts/render-sea.mjs): océano en
// perspectiva con el horizonte al 20 % de la imagen. Se funde por arriba (el
// horizonte se suaviza) y por abajo con la página, sin ningún corte.
const SEA_MASK = 'linear-gradient(180deg, transparent 18%, #000 23%, #000 50%, rgba(0,0,0,0.6) 68%, transparent 96%)'

export function SeaSurface() {
  return (
    <>
      <div
        aria-hidden="true"
        className="sea-swell pointer-events-none absolute inset-x-0 -top-[120px] h-[320px] sm:-top-[170px] sm:h-[460px] lg:-top-[215px] lg:h-[580px]"
        style={{ maskImage: SEA_MASK, WebkitMaskImage: SEA_MASK }}
      >
        <Image src={`/landing/sea-${SEA_VERSION}.webp`} alt="" fill priority sizes="100vw" className="object-cover object-top" />
      </div>
      {/* Bruma del horizonte: el cielo se aclara al llegar al mar, como en una foto */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-[126px] h-[110px] sm:-top-[148px] lg:-top-[169px]"
        style={{ background: 'linear-gradient(180deg, rgba(214,242,243,0) 0%, rgba(214,242,243,0.55) 62%, rgba(214,242,243,0.25) 78%, rgba(214,242,243,0) 100%)' }}
      />
    </>
  )
}

// Rayos casi paralelos e inclinados hacia el mismo lado, como la luz que entra
// por la superficie; muy tenues y desenfocados.
const RAYS = [
  { left: '14%', width: 140, opacity: 0.07, delay: '0s' },
  { left: '31%', width: 90, opacity: 0.05, delay: '-5s' },
  { left: '46%', width: 180, opacity: 0.07, delay: '-9s' },
  { left: '63%', width: 110, opacity: 0.05, delay: '-3s' },
  { left: '78%', width: 160, opacity: 0.06, delay: '-12s' },
]

export function SeaRays() {
  return (
    <div aria-hidden="true" className="par-slow pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
      {/* El sol, muy difuso, justo encima de la superficie */}
      <div className="absolute left-1/2 top-[-300px] h-[520px] w-[1000px] -translate-x-1/2 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,0.16), transparent)' }} />
      {RAYS.map((r, i) => (
        <span
          key={i}
          className="sea-ray absolute -top-20 h-[820px] origin-top blur-[22px]"
          // La opacidad va en --ray-o porque la animación la hace respirar a partir de ese valor.
          style={
            {
              left: r.left,
              width: r.width,
              opacity: r.opacity,
              '--ray-o': r.opacity,
              rotate: '16deg',
              animationDelay: r.delay,
              background: 'linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.6) 40%, transparent 90%)',
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
