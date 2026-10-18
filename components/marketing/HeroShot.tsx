import Image from 'next/image'
import { makeT, type Lang } from '@/lib/i18n-shared'

// Captura real del panel (no una recreación), en el idioma de la página. Se
// escala como una imagen en cualquier pantalla y se funde con la página por
// abajo. Se rehace con el espacio de demostración (ver README, «Captura»).
// Al bajar, termina de asentarse (hero-settle, ligado al scroll donde existe).

// Cambia con cada captura nueva: el nombre distinto obliga al navegador a bajarla
// otra vez en vez de enseñar la que tenía guardada.
const SHOT_VERSION = '20261017b'

/** Ruta de la captura del panel en el idioma de la página (también la usa el pie). */
export function shotSrc(lang: Lang): string {
  return `/landing/dashboard-${lang}-${SHOT_VERSION}.webp`
}

const FADE: React.CSSProperties = {
  maskImage: 'linear-gradient(180deg, #000 0%, #000 70%, transparent 100%)',
  WebkitMaskImage: 'linear-gradient(180deg, #000 0%, #000 70%, transparent 100%)',
}

export function HeroShot({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  return (
    <figure className="hero-settle m-0">
      <div className="-mx-4 -mt-6 px-4 pt-6 sm:-mx-6 sm:px-6" style={FADE}>
        <div className="overflow-hidden rounded-[12px] border border-white/70 bg-white shadow-[0_40px_100px_-40px_rgba(4,25,28,0.5)] sm:rounded-[18px]">
          <Image
            src={shotSrc(lang)}
            width={2880}
            height={2000}
            priority
            sizes="(min-width: 1248px) 1152px, calc(100vw - 32px)"
            alt={t(
              'Placton dashboard: visibility, sentiment, average position and mentions, a chart of direct and indirect mentions by brand and the competitor ranking.',
              'Panel de Placton: visibilidad, sentimiento, posición media y menciones, una gráfica de menciones directas e indirectas por marca y el ranking de competidores.',
            )}
            className="block h-auto w-full"
          />
        </div>
      </div>
    </figure>
  )
}
