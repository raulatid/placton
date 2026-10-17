'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeAction, finishAction, suggestAction } from '@/app/onboarding/actions'
import type { BrandProfile, SuggestedPrompt } from '@/lib/ai'
import { PLANS } from '@/lib/plans'

const TRIAL_LIMIT = PLANS.trial.prompts
import { useT } from './LangProvider'
import { IconArrow, IconPrompt, IconSearch, IconX } from './icons'
import { BrandAvatar, PlatformDot, cx } from './ui'

// Alta en cuatro pantallas, una cada vez: web → competidores → prompts →
// preparando el panel. Cada pantalla tiene su estado de carga dentro de la
// tarjeta y se puede volver atrás sin perder nada.


type Step = 'web' | 'competitors' | 'prompts' | 'setup' | 'sin-prueba'

interface Competitor {
  name: string
  domain: string
}

function nameFromInput(raw: string): Competitor | null {
  const v = raw.trim()
  if (!v) return null
  if (/^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(v.replace(/^https?:\/\//, ''))) {
    const domain = v
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
    const label = domain.split('.')[0]
    const name = label
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    return { name, domain }
  }
  return { name: v, domain: '' }
}

function Heading({ title, sub, k }: { title: string; sub: string; k: string }) {
  return (
    <div key={k} className="anim-rise text-center">
      <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.035em] text-ink sm:text-[34px]">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-mute">{sub}</p>
    </div>
  )
}

function Card({ title, count, children, footer }: { title: string; count?: number; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="anim-rise mt-8 overflow-hidden rounded-[26px] border border-white bg-white/90 shadow-[0_1px_2px_rgba(11,29,33,0.05),0_24px_60px_-30px_rgba(11,29,33,0.35)] backdrop-blur" style={{ '--i': 1 } as React.CSSProperties}>
      <div className="flex items-center gap-2 border-b border-line-2 px-6 py-4">
        <span className="text-[16px] font-bold tracking-[-0.01em]">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-line-2 px-2 py-0.5 text-[12px] font-bold text-ink num">{count}</span>
        )}
      </div>
      {children}
      {footer && <div className="border-t border-line-2 px-6 pb-5 pt-4">{footer}</div>}
    </div>
  )
}

function Loading({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-3">
      <div className="relative flex h-12 w-12 items-center justify-center">
        <span className="spin absolute inset-0 rounded-full border-2 border-line border-t-brand-2" />
        <span className="text-faint">{icon}</span>
      </div>
      <p className="shimmer-text text-[15px] font-semibold">{text}</p>
    </div>
  )
}

function AddRow({
  label,
  hint,
  placeholder,
  onAdd,
  disabled,
}: {
  label: string
  hint: string
  placeholder: string
  onAdd: (v: string) => void
  disabled?: boolean
}) {
  const [v, setV] = useState('')
  const t = useT()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim() || disabled) return
        onAdd(v)
        setV('')
      }}
    >
      <label className="mb-2 block text-[14px] font-semibold text-ink">
        {label} <span className="font-normal text-mute">({hint})</span>
      </label>
      <div className="pill-field flex items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-5 transition-shadow focus-within:border-brand-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
        />
        <button
          disabled={!v.trim() || disabled}
          className="h-10 shrink-0 rounded-full bg-deep px-5 text-[14px] font-semibold text-white transition-opacity disabled:bg-line disabled:text-faint"
        >
          {t('Add', 'Añadir')}
        </button>
      </div>
    </form>
  )
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="anim-rise mx-auto mt-7 flex h-12 items-center justify-center rounded-full bg-deep px-8 text-[15px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,0.6)] transition-all hover:bg-deep-2 disabled:bg-[#7d8d90] disabled:shadow-none"
      style={{ '--i': 2 } as React.CSSProperties}
    >
      {children}
    </button>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button type="button" onClick={onClick} className="mx-auto mt-4 block text-[14px] text-mute underline decoration-line underline-offset-4 hover:text-ink">
      {t('or go back', 'o vuelve atrás')}
    </button>
  )
}

export function Onboarding({ initialWeb = '', limit = TRIAL_LIMIT }: { initialWeb?: string; limit?: number }) {
  const LIMIT = limit
  const t = useT()
  const [step, setStep] = useState<Step>('web')
  const [url, setUrl] = useState(initialWeb)
  const [profile, setProfile] = useState<BrandProfile | null>(null)
  const [analyzedFor, setAnalyzedFor] = useState('')
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loadingCompetitors, setLoadingCompetitors] = useState(false)
  const [prompts, setPrompts] = useState<SuggestedPrompt[]>([])
  const [leftovers, setLeftovers] = useState<SuggestedPrompt[]>([])
  const [promptsFor, setPromptsFor] = useState('')
  const [loadingPrompts, setLoadingPrompts] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [trialUsed, setTrialUsed] = useState<'persona' | 'web' | null>(null)

  // Al panel con una carga completa: el router del cliente puede tener guardada
  // la versión de /dashboard de antes de terminar el alta (que manda aquí) y
  // entraría en un bucle /onboarding ↔ /dashboard hasta mostrar un error.
  const goToDashboard = useCallback(() => window.location.assign('/dashboard?first=1'), [])

  /* Paso 1 → 2: analizar la web (una vez por dirección). */
  function submitWeb(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setError(null)
    setStep('competitors')
    if (analyzedFor === url.trim()) return
    setLoadingCompetitors(true)
    setWarning(null)
    analyzeAction(url)
      .then((res) => {
        setProfile(res.profile)
        setCompetitors(res.profile.competitors)
        setAnalyzedFor(url.trim())
        setWarning(res.warning ?? null)
      })
      .catch(() => setWarning(t('Something went wrong reading your website. Add your competitors by hand.', 'Algo ha fallado al leer tu web. Añade tus competidores a mano.')))
      .finally(() => setLoadingCompetitors(false))
  }

  /* Paso 2 → 3: escribir prompts (se rehacen si cambian los competidores). */
  function toPrompts() {
    setStep('prompts')
    const signature = JSON.stringify([analyzedFor, competitors.map((c) => c.name)])
    if (promptsFor === signature && prompts.length) return
    setLoadingPrompts(true)
    setWarning(null)
    const p = profile ?? { brandName: url, description: '', country: 'España', language: 'en', competitors: [] }
    suggestAction({ brandName: p.brandName, description: p.description, country: p.country, language: p.language, competitors: competitors.map((c) => c.name) })
      .then((res) => {
        if (res.ok) {
          setPrompts(res.prompts.slice(0, LIMIT))
          setLeftovers(res.prompts.slice(LIMIT))
          setPromptsFor(signature)
        } else {
          setWarning(res.error)
        }
      })
      .catch(() => setWarning(t('We could not write prompts right now. Add your own or try again.', 'No hemos podido escribir los prompts ahora mismo. Añade los tuyos o vuelve a intentarlo.')))
      .finally(() => setLoadingPrompts(false))
  }

  /* Paso 3 → 4: guardar y lanzar la primera medición. */
  async function finish() {
    if (!prompts.length) return setError(t('Add at least one prompt to track.', 'Añade al menos un prompt que seguir.'))
    setSaving(true)
    setError(null)
    const p = profile ?? { brandName: url, description: '', country: 'España', language: 'en', competitors: [] }
    let res: Awaited<ReturnType<typeof finishAction>>
    try {
      res = await finishAction({
        brandName: p.brandName,
        description: p.description,
        country: p.country,
        language: p.language,
        competitors,
        prompts: prompts.map((x) => ({ text: x.text, topic: x.topic })),
        leftovers,
      })
    } catch {
      // Un corte o una actualización recién publicada: el botón no se queda cargando.
      setSaving(false)
      return setError(t('We could not save it. Check your connection and try again.', 'No hemos podido guardarlo. Revisa la conexión y vuelve a intentarlo.'))
    }
    setSaving(false)
    if ('error' in res) return setError(res.error)
    if (res.trialUsed) {
      setTrialUsed(res.trialUsed)
      return setStep('sin-prueba')
    }
    setStep('setup')
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {step === 'web' && (
        <div className="flex min-h-[62vh] flex-col justify-center">
          <Heading
            k="web"
            title={t("Let's see who you're up against", 'Vamos a ver contra quién compites')}
            sub={t("Enter your website and we'll look for the brands competing with you.", 'Escribe tu web y buscaremos las marcas que compiten contigo.')}
          />
          <form onSubmit={submitWeb} className="anim-rise mx-auto mt-10 w-full max-w-[560px]" style={{ '--i': 1 } as React.CSSProperties}>
            <label htmlFor="web" className="mb-2 block text-[14px] font-semibold text-ink">
              {t('Your website', 'Tu web')}
            </label>
            <div className="pill-field flex items-center gap-2 rounded-full border border-white bg-white/90 p-1.5 pl-5 shadow-[0_20px_50px_-28px_rgba(11,29,33,0.45)] transition-shadow focus-within:border-brand-2">
              <input
                id="web"
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('e.g. yourbrand.com', 'p. ej. tumarca.com')}
                inputMode="url"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[16px] text-ink placeholder:text-faint focus:outline-none"
              />
              <button
                aria-label={t('Continue', 'Continuar')}
                disabled={!url.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-deep text-white transition-all hover:scale-105 disabled:bg-[#c9d3d1]"
              >
                <IconArrow size={18} />
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'competitors' && (
        <div className="pt-6">
          <Heading
            k={loadingCompetitors ? 'c-loading' : 'c-done'}
            title={loadingCompetitors ? t('Looking for your competitors', 'Buscando a tu competencia') : t('These look like your competitors', 'Esta parece ser tu competencia')}
            sub={
              loadingCompetitors
                ? t('Hold on, this takes a few seconds…', 'Un momento, tarda unos segundos…')
                : t("Remove the ones that don't fit or add your own. You can change them anytime.", 'Quita los que no encajen o añade los tuyos. Puedes cambiarlos cuando quieras.')
            }
          />
          <Card
            title={t('Competitors', 'Competidores')}
            count={loadingCompetitors ? undefined : competitors.length}
            footer={
              <AddRow
                label={t('Add a competitor', 'Añade un competidor')}
                hint={t('optional, you can do it later', 'opcional, puedes hacerlo luego')}
                placeholder={t('e.g. rivalbrand.com', 'p. ej. competidor.com')}
                onAdd={(v) => {
                  const c = nameFromInput(v)
                  if (c && !competitors.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) setCompetitors((list) => [...list, c])
                }}
              />
            }
          >
            {loadingCompetitors ? (
              <Loading icon={<IconSearch size={18} />} text={t('Scanning your market…', 'Explorando tu mercado…')} />
            ) : (
              <>
                {warning && <p className="border-b border-line-2 bg-white px-6 py-3 text-[13px] font-medium text-ink-2 shadow-[inset_3px_0_0_#d97706]">{warning}</p>}
                {competitors.length === 0 ? (
                  <p className="px-6 py-10 text-center text-[14px] text-mute">{t('No competitors yet. Add one below.', 'Aún no hay competidores. Añade uno abajo.')}</p>
                ) : (
                  <ul className="max-h-[360px] overflow-y-auto">
                    {competitors.map((c, i) => (
                      <li key={`${c.name}-${i}`} className="anim-rise flex items-center gap-3.5 border-b border-line-2 px-6 py-3 last:border-0" style={{ '--i': i } as React.CSSProperties}>
                        <BrandAvatar name={c.name} domain={c.domain || undefined} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[16px] font-semibold text-ink">{c.name}</div>
                          {c.domain && <div className="truncate text-[13.5px] text-mute">{c.domain}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCompetitors((list) => list.filter((_, j) => j !== i))}
                          className="rounded-full p-2 text-faint transition-colors hover:bg-line-2 hover:text-ink"
                          aria-label={t(`Remove ${c.name}`, `Quitar ${c.name}`)}
                        >
                          <IconX size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
          <PrimaryButton onClick={toPrompts} disabled={loadingCompetitors}>
            {t('Continue to the last step', 'Seguir al último paso')}
          </PrimaryButton>
          <BackLink onClick={() => setStep('web')} />
        </div>
      )}

      {step === 'prompts' && (
        <div className="pt-6">
          <Heading
            k={loadingPrompts ? 'p-loading' : 'p-done'}
            title={loadingPrompts ? t('Drafting your prompts', 'Escribiendo tus prompts') : t('Your first prompts', 'Tus primeros prompts')}
            sub={
              loadingPrompts
                ? t('We are writing the questions your customers ask AI…', 'Estamos escribiendo las preguntas que tus clientes hacen a la IA…')
                : t(
                    "We'll ask every AI platform these questions every week to compare you with your competitors.",
                    'Haremos estas preguntas cada semana a todas las IA para compararte con tu competencia.',
                  )
            }
          />
          <Card
            title={t('Prompts', 'Prompts')}
            count={loadingPrompts ? undefined : prompts.length}
            footer={
              <AddRow
                label={t('Add a prompt', 'Añade un prompt')}
                hint={prompts.length >= LIMIT ? t(`trial limit is ${LIMIT}`, `la prueba admite ${LIMIT}`) : t('optional, you can do it later', 'opcional, puedes hacerlo luego')}
                placeholder={t('e.g. which accounting tool is best for freelancers?', 'p. ej. ¿qué gestoría online es mejor para autónomos?')}
                disabled={prompts.length >= LIMIT}
                onAdd={(v) => setPrompts((list) => [...list, { text: v.trim(), topic: t('Custom', 'Propias'), why: '' }])}
              />
            }
          >
            {loadingPrompts ? (
              <Loading icon={<IconPrompt size={18} />} text={t('Thinking like your customers…', 'Pensando como tus clientes…')} />
            ) : (
              <>
                {warning && <p className="border-b border-line-2 bg-white px-6 py-3 text-[13px] font-medium text-ink-2 shadow-[inset_3px_0_0_#d97706]">{warning}</p>}
                {prompts.length === 0 ? (
                  <p className="px-6 py-10 text-center text-[14px] text-mute">{t('No prompts yet. Write one below.', 'Aún no hay prompts. Escribe uno abajo.')}</p>
                ) : (
                  <ul className="max-h-[420px] overflow-y-auto">
                    {prompts.map((p, i) => (
                      <li key={`${p.text}-${i}`} className="anim-rise flex items-center gap-3 border-b border-line-2 px-6 py-3.5 last:border-0" style={{ '--i': i } as React.CSSProperties}>
                        <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-ink">{p.text}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPrompts((list) => list.filter((_, j) => j !== i))
                            setLeftovers((l) => [p, ...l])
                          }}
                          className="shrink-0 rounded-full p-2 text-faint transition-colors hover:bg-line-2 hover:text-ink"
                          aria-label={t('Remove prompt', 'Quitar prompt')}
                        >
                          <IconX size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
          {error && <p className="mt-4 text-center text-[14px] font-medium text-bad">{error}</p>}
          <PrimaryButton onClick={finish} disabled={loadingPrompts || saving || !prompts.length}>
            {saving ? t('Saving…', 'Guardando…') : t('Finish setup', 'Terminar el alta')}
          </PrimaryButton>
          <BackLink onClick={() => setStep('competitors')} />
        </div>
      )}

      {step === 'setup' && <Setup onDone={goToDashboard} />}
      {step === 'sin-prueba' && (
        <div className="flex min-h-[62vh] flex-col items-center justify-center text-center">
          <Heading
            k="sin-prueba"
            title={trialUsed === 'web' ? t('This website already had its free trial', 'Esta web ya tuvo su prueba gratis') : t("You've already used your free trial", 'Ya has usado tu prueba gratis')}
            sub={
              trialUsed === 'web'
                ? t(
                    'The free trial is one per website, and another account already used it. Your workspace is ready with its prompts and competitors: choose a plan and we start tracking right away.',
                    'La prueba gratis es una por web y otra cuenta ya la usó. Tu espacio está listo con sus prompts y competidores: elige un plan y empezamos a medir enseguida.',
                  )
                : t(
                    'The free trial is one per person, and you used it with your first workspace. This one is ready with its prompts and competitors: choose a plan and we start tracking right away.',
                    'La prueba gratis es una por persona y ya la usaste con tu primer espacio. Este está listo con sus prompts y competidores: elige un plan y empezamos a medir enseguida.',
                  )
            }
          />
          <button
            type="button"
            onClick={() => window.location.assign('/dashboard/plans')}
            className="anim-rise mt-8 h-12 rounded-full bg-deep px-7 text-[15px] font-semibold text-white transition-colors hover:bg-deep-2"
            style={{ '--i': 2 } as React.CSSProperties}
          >
            {t('Choose a plan', 'Elegir un plan')}
          </button>
        </div>
      )}
    </div>
  )
}

const ENGINE_IDS = ['chatgpt', 'claude', 'google', 'perplexity', 'grok'] as const
const ENGINE_NAMES: Record<string, string> = { chatgpt: 'ChatGPT', claude: 'Claude', google: 'Google AI', perplexity: 'Perplexity', grok: 'Grok' }

interface LiveAnswer {
  id: number
  engine: string
  prompt: string
  brands: number
  own: boolean
  cites: number
}

/** Número que sube poco a poco hasta su valor (sin saltos bruscos). */
function useCountUp(target: number) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setValue((v) => {
        if (v >= target) return target
        const next = v + Math.max(1, Math.ceil((target - v) / 8))
        if (next < target) raf = requestAnimationFrame(tick)
        return Math.min(next, target)
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return value
}

/**
 * Paso 4: la primera medición en directo. Las cinco IA se iluminan según van
 * contestando, el contador sube y entran las últimas respuestas reales con las
 * marcas que nombran. Entra al panel en cuanto hay una primera tanda.
 */
function Setup({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [byEngine, setByEngine] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<LiveAnswer[]>([])
  const started = useRef(Date.now())
  const leaving = useRef(false)

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/run-status', { cache: 'no-store' })
        const data = (await res.json()) as { active: { done: number; total: number } | null; byEngine?: Record<string, number>; recent?: LiveAnswer[] }
        const elapsed = Date.now() - started.current
        if (data.active) setProgress({ done: data.active.done, total: data.active.total })
        if (data.byEngine) setByEngine(data.byEngine)
        if (data.recent) setRecent(data.recent)
        // Al panel con una primera tanda (12 respuestas), al terminar o al minuto y medio.
        const enough = data.active ? data.active.done >= Math.min(data.active.total, 12) : elapsed > 5000
        if (!leaving.current && (enough || elapsed > 90_000)) {
          leaving.current = true
          setProgress((p) => ({ ...p, done: Math.max(p.done, p.total) }))
          setTimeout(onDone, 1200)
        }
      } catch {}
    }
    void poll()
    const iv = setInterval(poll, 1500)
    return () => clearInterval(iv)
  }, [onDone])

  const shown = useCountUp(progress.done)
  const pct = progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 4
  const current = recent[0]?.engine

  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center">
      {/* Las cinco IA: se encienden al contestar; la última que ha contestado late */}
      <div className="anim-rise flex items-center gap-3 sm:gap-4" aria-hidden="true">
        {ENGINE_IDS.map((id) => {
          const n = byEngine[id] ?? 0
          const live = current === id
          return (
            <div key={id} className="relative flex flex-col items-center gap-2">
              <span className={cx('relative rounded-full transition-all duration-500', n ? 'opacity-100' : 'opacity-35 grayscale')}>
                {live && <span className="absolute -inset-1.5 animate-ping rounded-full border border-brand-2/40 motion-reduce:animate-none" />}
                <span className={cx('block rounded-full ring-4 transition-all duration-500', live ? 'ring-brand-2/20' : 'ring-transparent')}>
                  <PlatformDot id={id} size={44} />
                </span>
              </span>
              <span className={cx('text-[11.5px] font-bold num transition-colors', n ? 'text-ink' : 'text-faint')}>{n || '·'}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-8">
        <Heading
          k="setup"
          title={t('Preparing your dashboard', 'Preparando tu panel')}
          sub={
            progress.total
              ? t(`${shown} of ${progress.total} answers in`, `${shown} de ${progress.total} respuestas recibidas`)
              : t('Sending your prompts to the AI platforms…', 'Enviando tus prompts a las IA…')
          }
        />
      </div>

      <div className="anim-rise mt-6 h-1.5 w-full max-w-[420px] overflow-hidden rounded-full bg-white/80" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="sheen h-full rounded-full bg-brand-2 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>

      {/* Respuestas en directo */}
      <div className="anim-rise mt-8 w-full max-w-[560px] overflow-hidden rounded-[22px] border border-white bg-white/90 shadow-[0_24px_60px_-30px_rgba(11,29,33,0.35)]" style={{ '--i': 2 } as React.CSSProperties}>
        <div className="flex items-center justify-between border-b border-line-2 px-5 py-3.5">
          <span className="text-[14px] font-bold text-ink">{t('Live answers', 'Respuestas en directo')}</span>
          <span className="text-[12px] font-semibold text-mute">{t('Live', 'En directo')}</span>
        </div>
        <ul className="divide-y divide-line-2">
          {recent.length ? (
            recent.map((a) => (
              <li key={a.id} className="anim-rise flex items-center gap-3 px-5 py-3">
                <PlatformDot id={a.engine} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{a.prompt}</span>
                  <span className="block text-[12px] text-mute">
                    {ENGINE_NAMES[a.engine] ?? a.engine} · {a.cites === 1 ? t('1 source', '1 fuente') : t(`${a.cites} sources`, `${a.cites} fuentes`)}
                  </span>
                </span>
                {a.own ? (
                  <span className="shrink-0 rounded-md bg-deep px-2 py-0.5 text-[11.5px] font-bold text-white">{t('You appear', 'Sales')}</span>
                ) : (
                  <span className="shrink-0 rounded-md bg-line-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-2 num">
                    {a.brands === 1 ? t('1 brand', '1 marca') : t(`${a.brands} brands`, `${a.brands} marcas`)}
                  </span>
                )}
              </li>
            ))
          ) : (
            [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                <span className="skeleton h-6 w-6 rounded-full" />
                <span className="flex-1 space-y-1.5">
                  <span className="skeleton block h-3 w-4/5" />
                  <span className="skeleton block h-2.5 w-1/3" />
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="anim-fade mt-5 max-w-[520px] text-center text-[13px] leading-relaxed text-mute" style={{ '--i': 3 } as React.CSSProperties}>
        {t(
          "Each prompt goes to every AI platform, which searches the web just like it does for a real user. We read which brands are named, in what order and which pages are cited. You'll land on your dashboard in a moment.",
          'Cada prompt va a todas las IA, que buscan en internet igual que para una persona. Leemos qué marcas se nombran, en qué orden y qué páginas se citan. En un momento entras en tu panel.',
        )}
      </p>
    </div>
  )
}
