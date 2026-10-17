import { makeT, type Lang } from '@/lib/i18n-shared'
import { cx } from '@/components/ui'
import { AuditSnippet, CompetitorsSnippet, InsightsSnippet, MentionsSnippet } from './FeatureVisuals'
import { Container, PANELS, type PanelId } from './parts'

// Cuatro bloques de funciones: tarjeta blanca con el texto a la izquierda y, a
// la derecha y a sangre, un fragmento de interfaz sobre un fondo propio de cada
// bloque. Algunos fragmentos se salen por el borde, como una captura recortada.

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
    <article className="grid grid-cols-1 overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(4,25,28,0.04)] lg:min-h-[520px] lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-10 p-7 sm:p-10 lg:p-12">
        <div>
          <p className="font-mono text-[12.5px] text-mute">
            {String(index).padStart(2, '0')} / {label}
          </p>
          <h3 className="mt-4 text-[28px] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink sm:text-[36px]">
            {lines.map((l, i) => (
              <span key={i} className="sm:block">
                {l}
                {i < lines.length - 1 ? ' ' : ''}
              </span>
            ))}
          </h3>
        </div>
        <p className="max-w-[400px] text-pretty text-[16px] leading-relaxed text-ink-2">{text}</p>
      </div>
      <div
        className={cx(
          'relative flex min-h-[340px] overflow-hidden',
          bleed ? 'items-start justify-start pl-8 pt-10 sm:pl-14 sm:pt-14' : 'items-center justify-center px-5 py-10 sm:p-14',
        )}
        style={PANELS[panel]}
      >
        <div className={cx(bleed ? 'w-[540px] shrink-0 [&>*]:max-w-none' : 'flex w-full justify-center')}>{children}</div>
      </div>
    </article>
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
            'A daily ranking of visibility and average position for you and your competitors, so you know who the AI picks first and where you are losing ground.',
            'Un ranking diario de visibilidad y posición media tuyo y de tu competencia, para saber a quién elige primero la IA y dónde estás perdiendo terreno.',
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
