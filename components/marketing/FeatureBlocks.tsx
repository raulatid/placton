import { Fragment } from 'react'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { cx } from '@/components/ui'
import { AuditSnippet, CompetitorsSnippet, InsightsSnippet, MentionsSnippet } from './FeatureVisuals'
import { Container, PANELS, type PanelId } from './parts'
import { Reveal } from './Reveal'

// Cuatro bloques de funciones: tarjeta blanca con el texto a la izquierda y, a
// la derecha y a sangre, un fragmento de interfaz sobre un fondo propio de cada
// bloque. Algunos fragmentos se salen por el borde, como una captura recortada.
//
// Al verse, el bloque entra y su texto sube línea a línea; el fragmento llega
// después (los recortados, desde el corte) y lo de dentro arranca 500 ms más
// tarde. El fragmento tiene su propio <Reveal>: en móvil va debajo del texto y
// espera a verse él. El fondo respira despacio solo mientras se ve.

function Block({
  index,
  label,
  lines,
  text,
  panel,
  bleed = false,
  children,
}: {
  index: number
  label: string
  lines: string[]
  text: string
  panel: PanelId
  /** El fragmento arranca arriba a la izquierda y se corta por la derecha y por abajo. */
  bleed?: boolean
  children: React.ReactNode
}) {
  return (
    <Reveal
      as="article"
      live
      className="grid grid-cols-1 overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(4,25,28,0.04)] lg:min-h-[520px] lg:grid-cols-2"
    >
      <div className="flex flex-col justify-between gap-10 p-7 sm:p-10 lg:p-12">
        <div>
          <p className="rv font-mono text-[12.5px] text-mute" style={{ '--i': 0 } as React.CSSProperties}>
            {String(index).padStart(2, '0')} / {label}
          </p>
          {/* Desde sm, una línea debajo de otra y cada una sube por su cuenta. En
              móvil las líneas van seguidas, como texto corrido, y sube el título
              entero (partirlo por líneas dejaría palabras sueltas). */}
          <h3
            className="rv-title mt-4 text-[28px] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink sm:text-[36px]"
            style={{ '--i': 1 } as React.CSSProperties}
          >
            {lines.map((l, i) => (
              <Fragment key={i}>
                <span className="rv-line sm:block" style={{ '--i': i + 1 } as React.CSSProperties}>
                  {l}
                </span>
                {i < lines.length - 1 ? ' ' : ''}
              </Fragment>
            ))}
          </h3>
        </div>
        <p className="rv max-w-[400px] text-pretty text-[16px] leading-relaxed text-ink-2" style={{ '--i': lines.length + 1 } as React.CSSProperties}>
          {text}
        </p>
      </div>
      <div
        className={cx(
          'relative isolate flex min-h-[340px] overflow-hidden',
          bleed ? 'items-start justify-start pl-8 pt-10 sm:pl-14 sm:pt-14' : 'items-center justify-center px-5 py-10 sm:p-14',
        )}
      >
        <div aria-hidden="true" className="panel-drift absolute inset-0" style={PANELS[panel]} />
        {/* Con su propio disparo: en móvil va debajo del texto y lo de dentro
            (barras, anillos, ranking) no arranca hasta que se ve. */}
        <Reveal
          className={cx('relative z-10', bleed ? 'rv-r w-[540px] shrink-0 [&>*]:max-w-none' : 'rv flex w-full justify-center')}
          style={{ '--i': 4, '--anim-base': '500ms' } as React.CSSProperties}
        >
          {children}
        </Reveal>
      </div>
    </Reveal>
  )
}

export function FeatureBlocks({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  return (
    <section aria-label={t('Features', 'Funciones')} className="pb-20 sm:pb-28">
      <Container className="max-w-[1080px] space-y-6 sm:space-y-8">
        <Block
          index={1}
          panel="reef"
          label={t('Mentions', 'Menciones')}
          lines={lang === 'es' ? ['Sabe cuándo la IA', 'habla de tu marca'] : ['See when AI', 'talks about your brand']}
          text={t(
            'Every answer is checked for your name and for links to your site. Direct mentions show the AI knows your brand; indirect ones show it trusts your pages as a source.',
            'Revisamos cada respuesta buscando tu nombre y enlaces a tu web. Las menciones directas dicen que la IA conoce tu marca; las indirectas, que se fía de tus páginas como fuente.',
          )}
        >
          <MentionsSnippet lang={lang} />
        </Block>

        <Block
          index={2}
          panel="lagoon"
          bleed
          label={t('Competitors', 'Competidores')}
          lines={lang === 'es' ? ['Mira cómo quedas', 'frente a tus rivales'] : ['Track how you stack', 'up against rivals']}
          text={t(
            'A weekly ranking of visibility and average position for you and your competitors, so you know who the AI picks first and where you are losing ground.',
            'Un ranking semanal de visibilidad y posición media tuyo y de tu competencia, para saber a quién elige primero la IA y dónde estás perdiendo terreno.',
          )}
        >
          <CompetitorsSnippet lang={lang} />
        </Block>

        <Block
          index={3}
          panel="shallows"
          label={t('Insights', 'Ideas')}
          lines={lang === 'es' ? ['Ideas hechas para', 'tu marca, cada semana'] : ['Personalised ideas', 'for your brand, weekly']}
          text={t(
            'Each week Placton turns your numbers into a short list of next steps, with the figure behind each one and the pages the AI is already citing.',
            'Cada semana Placton convierte tus números en una lista corta de próximos pasos, con la cifra que justifica cada uno y las páginas que la IA ya está citando.',
          )}
        >
          <InsightsSnippet lang={lang} />
        </Block>

        <Block
          index={4}
          panel="kelp"
          bleed
          label={t('Tools', 'Herramientas')}
          lines={lang === 'es' ? ['Herramientas para', 'crecer en la IA'] : ['Tools to grow your', 'AI search traffic']}
          text={t(
            'Start with an 18-point audit of your site, then use prompt suggestions, source tracking and history to see what actually moves the needle.',
            'Empieza con una auditoría de 18 puntos de tu web y sigue con prompts sugeridos, fuentes citadas e histórico para ver qué funciona de verdad.',
          )}
        >
          <AuditSnippet lang={lang} />
        </Block>
      </Container>
    </section>
  )
}
