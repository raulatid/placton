import { IconLink } from '@/components/icons'
import { Badge, Bar, PLATFORM_META, cx } from '@/components/ui'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { BrandMark } from './BrandMark'
import { PlatformLogo, platformName } from './PlatformLogo'
import { OWN_BRAND, SAMPLE_BRANDS } from './sample'
import { DIRECT, INDIRECT, Ring, StatusIcon, fmtNum, fmtPct, scoreColor, type CheckStatus } from './viz'

// Fragmentos de interfaz para los bloques de funciones y para la auditoría.
// Marcas conocidas con cifras de ejemplo; la guía citada es inventada.

function Snippet({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className={cx('w-full rounded-2xl border border-white/70 bg-white shadow-[0_30px_60px_-30px_rgba(4,25,28,0.45)]', className)}>
      {children}
    </div>
  )
}

/* 01 · Menciones */
export function MentionsSnippet({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  const direct = 922
  const indirect = 308
  const platforms = [
    { id: 'perplexity', v: 54 },
    { id: 'google', v: 41 },
    { id: 'grok', v: 41 },
    { id: 'chatgpt', v: 37 },
    { id: 'claude', v: 31 },
  ]
  return (
    <Snippet className="max-w-[400px]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark domain={OWN_BRAND.domain} name={OWN_BRAND.name} color={OWN_BRAND.color} size={28} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-ink">{OWN_BRAND.name}</p>
            <p className="text-[11.5px] text-mute">{t('Brand mentions', 'Menciones de marca')}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-line-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-2">{t('Last 30 days', 'Últimos 30 días')}</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line-2 px-2 py-4">
        {[
          { label: t('Total', 'Total'), value: direct + indirect, color: null },
          { label: t('Direct', 'Directas'), value: direct, color: DIRECT },
          { label: t('Indirect', 'Indirectas'), value: indirect, color: INDIRECT },
        ].map((s) => (
          <div key={s.label} className="px-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-mute">
              {s.color && <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />}
              {s.label}
            </p>
            <p className="mt-1 text-[24px] font-extrabold leading-none tracking-[-0.03em] text-ink num">{fmtNum(s.value, lang)}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-5 py-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[12.5px] font-semibold text-ink-2">{t('Visibility', 'Visibilidad')}</p>
          <p className="text-[15px] font-extrabold text-ink num">{fmtPct(OWN_BRAND.visibility, lang)}</p>
        </div>
        <Bar value={OWN_BRAND.visibility} className="mt-2 h-2" />
        <ul className="mt-4 space-y-2.5">
          {platforms.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5">
              <PlatformLogo id={p.id} size={22} decorative />
              <span className="w-[80px] shrink-0 truncate text-[12px] font-semibold text-ink-2">{platformName(p.id)}</span>
              <Bar value={p.v} color={PLATFORM_META[p.id].color} />
              <span className="w-9 shrink-0 text-right text-[12px] font-bold text-ink num">{fmtPct(p.v, lang)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Snippet>
  )
}

/* 02 · Competidores */
export function CompetitorsSnippet({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  const ranked = [...SAMPLE_BRANDS].sort((a, b) => b.visibility - a.visibility).slice(0, 4)
  const totalMentions = SAMPLE_BRANDS.reduce((s, b) => s + b.direct + b.indirect, 0)
  const share = Math.round(((OWN_BRAND.direct + OWN_BRAND.indirect) / totalMentions) * 100)
  return (
    <div className="w-full max-w-[400px] space-y-3" aria-hidden="true">
      <Snippet>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <p className="text-[14px] font-bold text-ink">{t('Competitor ranking', 'Ranking de competidores')}</p>
          <span className="text-[11.5px] font-semibold text-faint">{t('Visibility', 'Visibilidad')}</span>
        </div>
        <ol className="px-5 py-1.5">
          {ranked.map((b, i) => (
            <li key={b.key} className={cx('-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2', b.own && 'bg-soft/70')}>
              <span className="w-3 text-[12px] font-bold text-faint num">{i + 1}</span>
              <BrandMark domain={b.domain} name={b.name} color={b.color} size={26} />
              <span className={cx('min-w-0 flex-1 truncate text-[13px]', b.own ? 'font-bold text-ink' : 'font-semibold text-ink-2')}>{b.name}</span>
              {b.own && <Badge tone="brand">{t('You', 'Tú')}</Badge>}
              <span className="w-12 whitespace-nowrap text-right text-[13px] font-bold text-ink num">{fmtPct(b.visibility, lang)}</span>
            </li>
          ))}
        </ol>
      </Snippet>
      <div className="grid grid-cols-2 gap-3">
        <Snippet className="flex items-center gap-3 p-3.5">
          <Ring value={OWN_BRAND.visibility} size={58} stroke={13} center={String(OWN_BRAND.visibility)} color={DIRECT} />
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold leading-tight text-mute">{t('Your visibility', 'Tu visibilidad')}</p>
            <p className="mt-0.5 text-[15px] font-extrabold text-ink num">{fmtPct(OWN_BRAND.visibility, lang)}</p>
          </div>
        </Snippet>
        <Snippet className="flex items-center gap-3 p-3.5">
          <Ring value={share} size={58} stroke={13} center={String(share)} color="#2a78d6" />
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold leading-tight text-mute">{t('Share of voice', 'Cuota de voz')}</p>
            <p className="mt-0.5 text-[15px] font-extrabold text-ink num">{fmtPct(share, lang)}</p>
          </div>
        </Snippet>
      </div>
    </div>
  )
}

/* 03 · Ideas */
export function InsightsSnippet({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  return (
    <div className="w-full max-w-[400px]" aria-hidden="true">
      <Snippet className="relative z-10 p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="brand">{t('Opportunity', 'Oportunidad')}</Badge>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-mute">
            <PlatformLogo id="perplexity" size={18} decorative />
            Perplexity
          </span>
        </div>
        <p className="mt-3 text-[15px] font-bold leading-snug tracking-[-0.01em] text-ink">
          {t('A buying guide recommends three rivals, not you', 'Una guía de compra recomienda a tres rivales y no a ti')}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
          {t(
            'Perplexity leans on this page when it suggests project management tools. Getting listed there is your shortest way in.',
            'Perplexity se apoya en esta página cuando sugiere herramientas de gestión de proyectos. Aparecer en ella es tu atajo más corto.',
          )}
        </p>
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-bg px-2.5 py-2 text-[12px]">
          <IconLink size={14} className="shrink-0 text-brand-2" />
          <span className="min-w-0 truncate font-mono text-ink-2">teamtoolsdigest.com/best-project-apps</span>
        </p>
      </Snippet>
      <Snippet className="relative -mt-2 ml-5 w-[calc(100%-1.25rem)] p-5 pt-6">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="warn">{t('Warning', 'Aviso')}</Badge>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-mute">
            <PlatformLogo id="chatgpt" size={18} decorative />
            ChatGPT
          </span>
        </div>
        <p className="mt-3 text-[15px] font-bold leading-snug tracking-[-0.01em] text-ink">
          {t('ChatGPT names you less than last week', 'ChatGPT te nombra menos que la semana pasada')}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
          {t('You went from 9 to 5 answers on enterprise prompts.', 'Has pasado de 9 a 5 respuestas en los prompts para grandes empresas.')}
        </p>
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-bg px-2.5 py-2 text-[12px]">
          <BrandMark domain={OWN_BRAND.domain} name={OWN_BRAND.name} color={OWN_BRAND.color} size={16} />
          <span className="min-w-0 truncate font-mono text-ink-2">{OWN_BRAND.domain}/enterprise</span>
        </p>
      </Snippet>
    </div>
  )
}

/* 04 · Herramientas: lista de la auditoría */
export function auditChecks(lang: Lang): { label: string; status: CheckStatus }[] {
  const t = makeT(lang)
  return [
    { label: t('AI crawlers allowed', 'Rastreadores de IA permitidos'), status: 'ok' },
    { label: t('Content visible without JavaScript', 'Contenido visible sin JavaScript'), status: 'ok' },
    { label: t('Structured data (JSON-LD)', 'Datos estructurados (JSON-LD)'), status: 'warn' },
    { label: t('llms.txt file', 'Archivo llms.txt'), status: 'fail' },
    { label: t('FAQ section', 'Preguntas frecuentes'), status: 'ok' },
    { label: t('Organisation details', 'Ficha de organización'), status: 'warn' },
  ]
}

export function AuditSnippet({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  const score = 72
  return (
    <Snippet className="max-w-[400px]">
      <div className="flex items-center gap-4 border-b border-line px-5 py-4">
        <Ring value={score} size={84} center={String(score)} caption={t('of 100', 'de 100')} color={scoreColor(score)} />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-mute">{t('AI-readiness audit', 'Auditoría de preparación para IA')}</p>
          <p className="mt-1 flex min-w-0 items-center gap-2 text-[15px] font-bold text-ink">
            <BrandMark domain={OWN_BRAND.domain} name={OWN_BRAND.name} color={OWN_BRAND.color} size={22} />
            <span className="truncate">{OWN_BRAND.domain}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] text-mute">{t('13 of 18 checks passed', '13 de 18 puntos correctos')}</p>
        </div>
      </div>
      <ul className="px-5 py-2">
        {auditChecks(lang).map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 border-t border-line-2 py-2.5 text-[13px] font-semibold text-ink-2 first:border-t-0">
            <StatusIcon status={c.status} />
            <span className="min-w-0 truncate">{c.label}</span>
          </li>
        ))}
      </ul>
    </Snippet>
  )
}

/* Vista previa del resultado de la auditoría (banda de la auditoría gratis) */
export function AuditResultPreview({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  const score = 72
  const groups = [
    { label: t('Access for AI crawlers', 'Acceso de los rastreadores'), ok: 5, total: 5 },
    { label: t('Content and clarity', 'Contenido y claridad'), ok: 5, total: 6 },
    { label: t('Structure and data', 'Estructura y datos'), ok: 3, total: 7 },
  ]
  const fixes = auditChecks(lang).filter((c) => c.status !== 'ok').slice(0, 3)
  return (
    <Snippet className="max-w-[420px]">
      <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-mute">{t('Your AI-readiness score', 'Tu nota de preparación para IA')}</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="text-[44px] font-extrabold leading-none tracking-[-0.04em] num" style={{ color: scoreColor(score) }}>
              {score}
            </span>
            <span className="text-[14px] font-semibold text-faint">/100</span>
          </p>
        </div>
        <Ring value={score} size={70} stroke={12} center="" color={scoreColor(score)} />
      </div>
      <ul className="space-y-3 px-5 pb-4">
        {groups.map((g) => (
          <li key={g.label}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate font-semibold text-ink-2">{g.label}</span>
              <span className="shrink-0 font-bold text-ink num">
                {g.ok}/{g.total}
              </span>
            </div>
            <Bar value={(g.ok / g.total) * 100} color={g.ok === g.total ? '#047857' : '#00a38c'} className="mt-1.5" />
          </li>
        ))}
      </ul>
      <div className="border-t border-line bg-bg/70 px-5 py-3.5">
        <p className="text-[11.5px] font-bold text-ink-2">{t('Fix first', 'Arregla primero')}</p>
        <ul className="mt-2 space-y-2">
          {fixes.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-2">
              <StatusIcon status={c.status} />
              <span className="min-w-0 truncate">{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </Snippet>
  )
}
