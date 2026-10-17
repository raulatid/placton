import {
  IconAudit,
  IconCalendar,
  IconGlobe,
  IconIdea,
  IconLink,
  IconMention,
  IconPrompt,
  IconRivals,
  IconSearch,
  IconSpark,
  IconTeam,
  IconTrend,
} from '@/components/icons'
import { PLATFORM_META } from '@/components/ui'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { Container } from './parts'
import { PlatformLogo, platformName } from './PlatformLogo'

// Dos filas de etiquetas que se desplazan en bucle, en sentidos opuestos. Se
// paran al pasar el ratón y se quedan quietas si la persona pide menos
// movimiento en su sistema.

type Chip = { key: string; label: string; color: string; Icon?: (p: { size?: number; className?: string }) => React.ReactNode; platform?: string }

const MARQUEE_CSS = `
@keyframes pl-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.pl-marquee { -webkit-mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent); mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent); }
.pl-track { animation: pl-marquee var(--pl-dur, 48s) linear infinite; }
.pl-track[data-dir="reverse"] { animation-direction: reverse; }
.pl-marquee:hover .pl-track, .pl-marquee:focus-within .pl-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .pl-marquee { -webkit-mask-image: none; mask-image: none; }
  .pl-track { animation: none; width: auto; flex-wrap: wrap; justify-content: center; }
  .pl-track > [data-copy="2"] { display: none; }
  .pl-track > [data-copy="1"] { flex-wrap: wrap; justify-content: center; padding-right: 0; }
}
`

function ChipView({ chip }: { chip: Chip }) {
  return (
    <li className="inline-flex h-12 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border border-line bg-white pl-2 pr-5 text-[14.5px] font-semibold text-ink-2 shadow-[0_6px_20px_-14px_rgba(4,25,28,0.35)]">
      {chip.platform ? (
        <PlatformLogo id={chip.platform} size={30} decorative />
      ) : (
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full" style={{ background: `${chip.color}1f`, color: chip.color }}>
          {chip.Icon && <chip.Icon size={16} />}
        </span>
      )}
      {chip.label}
    </li>
  )
}

function Row({ chips, reverse = false, duration }: { chips: Chip[]; reverse?: boolean; duration: number }) {
  return (
    <div className="pl-marquee overflow-hidden py-1.5">
      <div className="pl-track flex w-max" data-dir={reverse ? 'reverse' : 'normal'} style={{ '--pl-dur': `${duration}s` } as React.CSSProperties}>
        <ul data-copy="1" className="flex gap-3 pr-3">
          {chips.map((c) => (
            <ChipView key={c.key} chip={c} />
          ))}
        </ul>
        <ul data-copy="2" className="flex gap-3 pr-3" aria-hidden="true">
          {chips.map((c) => (
            <ChipView key={c.key} chip={c} />
          ))}
        </ul>
      </div>
    </div>
  )
}

export function ToolsMarquee({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  const monitoring = (id: string) => t(`${platformName(id)} monitoring`, `Seguimiento de ${platformName(id)}`)

  const rowA: Chip[] = [
    { key: 'urls', label: t('Cited URLs', 'URL citadas'), color: '#2a78d6', Icon: IconLink },
    { key: 'direct', label: t('Direct mentions', 'Menciones directas'), color: '#00a38c', Icon: IconMention },
    { key: 'chatgpt', label: monitoring('chatgpt'), color: PLATFORM_META.chatgpt.color, platform: 'chatgpt' },
    { key: 'ranking', label: t('Competitor ranking', 'Ranking de competidores'), color: '#eda100', Icon: IconRivals },
    { key: 'insights', label: t('Weekly insights', 'Ideas semanales'), color: '#4a3aa7', Icon: IconIdea },
    { key: 'claude', label: monitoring('claude'), color: PLATFORM_META.claude.color, platform: 'claude' },
    { key: 'indirect', label: t('Indirect mentions', 'Menciones indirectas'), color: '#eb6834', Icon: IconMention },
    { key: 'history', label: t('Daily history', 'Histórico diario'), color: '#008300', Icon: IconCalendar },
    { key: 'position', label: t('Average position', 'Posición media'), color: '#e34948', Icon: IconTrend },
  ]
  const rowB: Chip[] = [
    { key: 'prompts', label: t('Prompt suggestions', 'Prompts sugeridos'), color: '#e87ba4', Icon: IconPrompt },
    { key: 'google', label: monitoring('google'), color: PLATFORM_META.google.color, platform: 'google' },
    { key: 'audit', label: t('AI-readiness audit', 'Auditoría de preparación para IA'), color: '#047857', Icon: IconAudit },
    { key: 'domains', label: t('Source domains', 'Dominios fuente'), color: '#2a78d6', Icon: IconGlobe },
    { key: 'perplexity', label: monitoring('perplexity'), color: PLATFORM_META.perplexity.color, platform: 'perplexity' },
    { key: 'sentiment', label: t('Sentiment', 'Sentimiento'), color: '#eda100', Icon: IconSpark },
    { key: 'searches', label: t('AI search queries', 'Búsquedas de la IA'), color: '#4a3aa7', Icon: IconSearch },
    { key: 'team', label: t('Team workspaces', 'Espacios de equipo'), color: '#00a38c', Icon: IconTeam },
    { key: 'grok', label: monitoring('grok'), color: PLATFORM_META.grok.color, platform: 'grok' },
  ]

  return (
    <section aria-labelledby="all-tools" className="py-20 sm:py-28">
      <style>{MARQUEE_CSS}</style>
      <Container className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-end lg:gap-16">
        <h2 id="all-tools" className="text-balance text-[30px] font-extrabold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[44px]">
          {t('Everything you need to show up in AI answers', 'Todo lo que necesitas para aparecer en las respuestas de la IA')}
        </h2>
        <p className="max-w-lg text-pretty text-[16px] leading-relaxed text-mute sm:text-[17px] lg:justify-self-end">
          {t(
            'From the first prompt to the last cited link, Placton keeps the whole picture in one place and updates it every day.',
            'Desde el primer prompt hasta el último enlace citado, Placton reúne todo en un solo sitio y lo actualiza cada día.',
          )}
        </p>
      </Container>
      <div className="mt-12 space-y-2 sm:mt-14">
        <Row chips={rowA} duration={52} />
        <Row chips={rowB} duration={58} reverse />
      </div>
    </section>
  )
}
