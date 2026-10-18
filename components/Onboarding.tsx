'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeAction, finishAction, suggestAction } from '@/app/onboarding/actions'
import type { BrandProfile, SuggestedPrompt } from '@/lib/ai'
import { PLANS } from '@/lib/plans'
import { useT } from './LangProvider'
import { BrandAvatar, PlatformDot, cx } from './ui'
import { ActionBar } from './onboarding/ActionBar'
import { CompetitorGrid } from './onboarding/CompetitorGrid'
import { PlanMeter } from './onboarding/PlanMeter'
import { EnginesWaiting, PromptGroups } from './onboarding/PromptGroups'
import { RailStep, StepHeader, type RailState } from './onboarding/Rail'
import { RunDiatom } from './onboarding/RunDiatom'
import { Sonar } from './onboarding/Sonar'
import { StepSummary } from './onboarding/StepSummary'
import { WebField } from './onboarding/WebField'
import { useStepTransition } from './onboarding/useStepTransition'
import {
  ENGINE_IDS,
  ENGINE_NAMES,
  STEP_INDEX,
  cleanDomain,
  nameFromInput,
  reduceMotion,
  vars,
  type Competitor,
  type LocalPrompt,
  type Step,
} from './onboarding/shared'

const TRIAL_LIMIT = PLANS.trial.prompts

// Alta en cuatro pasos sobre una sola línea vertical («la bitácora»): web →
// competidores → prompts → primera medición. El paso en curso se abre; los
// hechos se pliegan en una fila con su dato y se tocan para volver sin perder
// nada; los pendientes se ven desde el principio. Bajar es avanzar: la línea se
// rellena y el fondo se oscurece hasta el marino de la primera medición.

/** Sin repetir marcas por nombre (sin distinguir mayúsculas); gana la primera. */
function dedupeByName(list: Competitor[]): Competitor[] {
  const seen = new Set<string>()
  return list.filter((c) => {
    const k = c.name.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Plancton del fondo: posiciones fijas (en %), tamaño en px, opacidad y deriva. */
const PLANKTON_FAR = [
  { x: 8, y: 22, s: 2, o: 0.4, dur: 17, delay: -3 },
  { x: 31, y: 58, s: 2, o: 0.35, dur: 19, delay: -9 },
  { x: 57, y: 34, s: 2.5, o: 0.4, dur: 15, delay: -5 },
  { x: 78, y: 70, s: 2, o: 0.45, dur: 18, delay: -12 },
  { x: 93, y: 44, s: 2.5, o: 0.35, dur: 16, delay: -7 },
]
const PLANKTON_NEAR = [
  { x: 14, y: 64, s: 3, o: 0.6, dur: 13, delay: -2 },
  { x: 24, y: 86, s: 4, o: 0.55, dur: 11, delay: -6 },
  { x: 43, y: 74, s: 3, o: 0.65, dur: 14, delay: -4 },
  { x: 62, y: 90, s: 3.5, o: 0.6, dur: 12, delay: -8 },
  { x: 71, y: 52, s: 3, o: 0.5, dur: 15, delay: -1 },
  { x: 86, y: 82, s: 4, o: 0.6, dur: 13, delay: -10 },
  { x: 96, y: 62, s: 3, o: 0.55, dur: 11, delay: -5 },
]

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
      <span aria-hidden="true" className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-[#d97706]" />
      <span>{children}</span>
    </p>
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
  /** Competidores desmarcados (nombre en minúsculas): se quedan a la vista, atenuados. */
  const [off, setOff] = useState<Set<string>>(() => new Set())
  const [loadingCompetitors, setLoadingCompetitors] = useState(false)
  const [prompts, setPrompts] = useState<LocalPrompt[]>([])
  /** Prompts desmarcados (por texto). Solo cuentan para el límite los marcados. */
  const [offP, setOffP] = useState<Set<string>>(() => new Set())
  const [leftovers, setLeftovers] = useState<SuggestedPrompt[]>([])
  const [promptsFor, setPromptsFor] = useState('')
  const [loadingPrompts, setLoadingPrompts] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [promptWarning, setPromptWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [trialUsed, setTrialUsed] = useState<'persona' | 'web' | null>(null)
  /** La primera medición ya tiene su primera tanda: el nodo 4 pasa a hecho. */
  const [leaving, setLeaving] = useState(false)
  const [announce, setAnnounce] = useState('')
  /** Fichas y burbujas ya vistas: solo entran animadas la primera vez. */
  const [seen] = useState(() => new Set<string>())

  // Respuestas que llegan tarde: solo vale la última petición de cada tipo.
  const analyzeReq = useRef(0)
  const suggestReq = useRef(0)
  const promptsRef = useRef(prompts)
  const offPRef = useRef(offP)
  useEffect(() => {
    promptsRef.current = prompts
    offPRef.current = offP
  })
  const webInput = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const selected = competitors.filter((c) => !off.has(c.name.toLowerCase()))
  const on = (p: LocalPrompt) => !offP.has(p.text)
  const k = prompts.filter(on).length

  // Al panel con una carga completa: el router del cliente puede tener guardada
  // la versión de /dashboard de antes de terminar el alta (que manda aquí) y
  // entraría en un bucle /onboarding ↔ /dashboard hasta mostrar un error.
  const goToDashboard = useCallback(() => window.location.assign('/dashboard?first=1'), [])
  const onLeaving = useCallback(() => setLeaving(true), [])

  const STEP_NAMES: [string, string][] = [
    ['Your website', 'Tu web'],
    ['Competitors', 'Competencia'],
    ['Prompts', 'Prompts'],
    ['First run', 'Primera medición'],
  ]
  const stepName = (i: number) => t(STEP_NAMES[i][0], STEP_NAMES[i][1])
  const stepLabel = (n: number) => t(`Step ${n} of 4`, `Paso ${n} de 4`)

  /** Tras cambiar de paso: foco, scroll si hace falta y anuncio para lectores de pantalla. */
  function afterStep(next: Step, animated: boolean) {
    const i = STEP_INDEX[next]
    setAnnounce(t(`Step ${i + 1} of 4: ${STEP_NAMES[i][0]}`, `Paso ${i + 1} de 4: ${STEP_NAMES[i][1]}`))
    const h1 = listRef.current?.querySelector<HTMLElement>('.ob-step h1') ?? null
    if (next === 'web' && webInput.current) {
      webInput.current.focus({ preventScroll: true })
      webInput.current.select()
    } else h1?.focus({ preventScroll: true })
    if (h1) {
      const r = h1.getBoundingClientRect()
      // Dentro de una transición de vista el salto es directo: la propia transición lo anima.
      if (r.top < 64 || r.bottom > window.innerHeight) h1.scrollIntoView({ block: 'start', behavior: animated || reduceMotion() ? 'instant' : 'smooth' })
    }
  }
  const go = useStepTransition(setStep, afterStep)

  /* Paso 1 → 2: analizar la web (una vez por dirección). */
  function submitWeb(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setError(null)
    go('competitors', 'fwd')
    if (analyzedFor === url.trim()) return
    const id = ++analyzeReq.current
    const submitted = url.trim()
    setLoadingCompetitors(true)
    setWarning(null)
    // Web nueva: nada del análisis anterior (sí se conserva lo que se añada mientras carga).
    setCompetitors([])
    setOff(new Set())
    setProfile(null)
    setAnalyzedFor('')
    analyzeAction(url)
      .then((res) => {
        if (id !== analyzeReq.current) return
        setProfile(res.profile)
        setCompetitors((prev) => dedupeByName([...res.profile.competitors, ...prev]))
        setAnalyzedFor(submitted)
        setWarning(res.warning ?? null)
      })
      .catch(() => {
        if (id !== analyzeReq.current) return
        setWarning(t('Something went wrong reading your website. Add your competitors by hand.', 'Algo ha fallado al leer tu web. Añade tus competidores a mano.'))
      })
      .finally(() => {
        if (id === analyzeReq.current) setLoadingCompetitors(false)
      })
  }

  /* Paso 2 → 3: escribir prompts (se rehacen si cambian los competidores marcados). */
  function toPrompts() {
    go('prompts', 'fwd')
    const signature = JSON.stringify([analyzedFor, selected.map((c) => c.name)])
    if (promptsFor === signature && prompts.length) return
    const id = ++suggestReq.current
    setLoadingPrompts(true)
    setPromptWarning(null)
    const p = profile ?? { brandName: url, description: '', country: '', language: 'en', competitors: [] }
    suggestAction({ brandName: p.brandName, description: p.description, country: p.country, language: p.language, competitors: selected.map((c) => c.name) })
      .then((res) => {
        if (id !== suggestReq.current) return
        if (res.ok) {
          // Los propios (también los añadidos mientras cargaba) se conservan; las
          // sugerencias llenan el hueco que dejan los propios marcados.
          const custom = promptsRef.current.filter((x) => x.custom)
          const offNow = offPRef.current
          const customOn = custom.filter((x) => !offNow.has(x.text)).length
          const room = Math.max(0, LIMIT - customOn)
          setPrompts([...res.prompts.slice(0, room), ...custom])
          setLeftovers(res.prompts.slice(room))
          setOffP(new Set([...offNow].filter((text) => custom.some((c) => c.text === text))))
          setPromptsFor(signature)
        } else {
          setPromptWarning(res.error)
        }
      })
      .catch(() => {
        if (id !== suggestReq.current) return
        setPromptWarning(t('We could not write prompts right now. Add your own or try again.', 'No hemos podido escribir los prompts ahora mismo. Añade los tuyos o vuelve a intentarlo.'))
      })
      .finally(() => {
        if (id === suggestReq.current) setLoadingPrompts(false)
      })
  }

  /* Paso 3 → 4: guardar y lanzar la primera medición. */
  async function finish() {
    const chosen = prompts.filter(on)
    if (!chosen.length) return setError(t('Add at least one prompt to track.', 'Añade al menos un prompt que seguir.'))
    setSaving(true)
    setError(null)
    const p = profile ?? { brandName: url, description: '', country: '', language: 'en', competitors: [] }
    let res: Awaited<ReturnType<typeof finishAction>>
    try {
      res = await finishAction({
        brandName: p.brandName,
        description: p.description,
        country: p.country,
        language: p.language,
        competitors: selected.map((c) => ({ name: c.name, domain: c.domain })),
        prompts: chosen.map((x) => ({ text: x.text, topic: x.topic })),
        // Los desmarcados van delante, como cuando se quitaban de la lista.
        leftovers: [...prompts.filter((x) => !on(x)), ...leftovers].map((x) => ({ text: x.text, topic: x.topic, why: x.why })),
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
      return go('sin-prueba', 'fwd')
    }
    go('setup', 'fwd')
  }

  function toggleCompetitor(c: Competitor) {
    const key = c.name.toLowerCase()
    setOff((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  /** Añade una marca. Si ya estaba desmarcada, la vuelve a marcar; si ya estaba marcada, devuelve su clave para señalarla. */
  function addCompetitor(raw: string): string | null {
    const c = nameFromInput(raw)
    if (!c) return null
    // La misma marca por nombre o por web («monday.com» cuando ya está monday.com).
    const same = competitors.find((x) => x.name.toLowerCase() === c.name.toLowerCase() || (!!c.domain && x.domain.toLowerCase() === c.domain))
    if (same) {
      const key = same.name.toLowerCase()
      if (!off.has(key)) return key
      setOff((s) => {
        const n = new Set(s)
        n.delete(key)
        return n
      })
      return null
    }
    setCompetitors((list) => [...list, c])
    return null
  }

  function togglePrompt(p: LocalPrompt) {
    if (!on(p) && k >= LIMIT) return
    setOffP((s) => {
      const n = new Set(s)
      if (n.has(p.text)) n.delete(p.text)
      else n.add(p.text)
      return n
    })
  }

  function addPrompt(raw: string) {
    const text = raw.trim()
    if (!text) return
    const same = prompts.find((x) => x.text.toLowerCase() === text.toLowerCase())
    if (same) {
      if (!on(same)) togglePrompt(same)
      return
    }
    if (k >= LIMIT) return
    setPrompts((list) => [...list, { text, topic: t('Custom', 'Propias'), why: '', custom: true }])
  }

  // ⌘/Ctrl+Intro lanza la acción principal de los pasos 2 y 3 (sin añadir clics).
  const primary = useRef<(() => void) | null>(null)
  useEffect(() => {
    primary.current =
      step === 'competitors' && !loadingCompetitors ? toPrompts : step === 'prompts' && !loadingPrompts && !saving && k > 0 ? () => void finish() : null
  })
  useEffect(() => {
    if (step !== 'competitors' && step !== 'prompts') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.repeat) return
      const run = primary.current
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // En la primera medición la cabecera de la página pasa a tonos claros.
  useEffect(() => {
    const html = document.documentElement
    if (step === 'setup') html.dataset.obTone = 'dark'
    else delete html.dataset.obTone
    return () => {
      delete html.dataset.obTone
    }
  }, [step])

  const idx = STEP_INDEX[step]
  const dark = step === 'setup'
  const locked = step === 'setup' || step === 'sin-prueba' || saving
  const domain = cleanDomain(analyzedFor || url)
  const brandName = profile?.brandName || nameFromInput(url)?.name || domain
  const found = profile?.competitors.length ?? 0
  const suggested = prompts.filter((p) => !p.custom).length
  const topics = new Set(prompts.filter(on).map((p) => p.topic || 'General')).size

  const stateOf = (i: number): RailState => (i < idx ? 'done' : i === idx ? (step === 'sin-prueba' ? 'info' : 'active') : 'pending')
  const working = (step === 'competitors' && loadingCompetitors) || (step === 'prompts' && (loadingPrompts || saving)) || (step === 'setup' && !leaving)

  const competitorsText =
    selected.length === 0 ? t('No competitors', 'Sin competidores') : selected.length === 1 ? t('1 brand', '1 marca') : t(`${selected.length} brands`, `${selected.length} marcas`)
  const promptsText = `${k} prompts · ${topics === 1 ? t('1 topic', '1 tema') : t(`${topics} topics`, `${topics} temas`)}`

  const summaries: React.ReactNode[] = [
    <StepSummary
      key="s1"
      label={stepName(0)}
      ariaValue={domain}
      dark={dark}
      locked={locked}
      onEdit={() => go('web', 'back')}
      transitionName="ob-sum-1"
      value={
        <>
          <BrandAvatar name={brandName} domain={domain} size={20} />
          <span className="truncate">{domain}</span>
        </>
      }
    />,
    <StepSummary
      key="s2"
      label={stepName(1)}
      ariaValue={competitorsText}
      dark={dark}
      locked={locked}
      onEdit={() => go('competitors', 'back')}
      value={
        <>
          {selected.length > 0 && (
            <span className="flex shrink-0 items-center">
              {selected.slice(0, 5).map((c, i) => (
                <span key={c.name} className={cx('rounded-[6px] ring-2', dark ? 'ring-[#10282b]' : 'ring-white', i > 0 && '-ml-1.5')}>
                  <BrandAvatar name={c.name} domain={c.domain || undefined} size={20} />
                </span>
              ))}
            </span>
          )}
          <span className="truncate">{competitorsText}</span>
        </>
      }
    />,
    <StepSummary key="s3" label={stepName(2)} ariaValue={promptsText} dark={dark} locked={locked} onEdit={() => go('prompts', 'back')} value={<span className="truncate num">{promptsText}</span>} />,
  ]

  const hints = [
    '',
    selected.length ? t(`${selected.length} saved`, `${selected.length} guardados`) : t('We find them for you', 'Las buscamos por ti'),
    k ? t(`${k} saved`, `${k} guardados`) : t('We write them for you', 'Los escribimos por ti'),
    t('The 5 AI platforms answer live', 'Las 5 IA responden en directo'),
  ]
  const hintSaved = [false, selected.length > 0, k > 0, false]

  /* Cuerpo del paso abierto */
  function body(i: number): React.ReactNode {
    if (i === 0)
      return (
        <>
          <StepHeader
            label={stepLabel(1)}
            hKey="web"
            title={t('Which website should we track?', '¿Qué web vamos a medir?')}
            sub={t('We read it to learn what you sell and who you compete with. It takes a few seconds.', 'La leemos para saber qué vendes y con quién compites. Tarda unos segundos.')}
          />
          <WebField url={url} onChange={setUrl} onSubmit={submitWeb} inputRef={webInput} />
        </>
      )

    if (i === 1)
      return (
        <>
          <StepHeader
            label={stepLabel(2)}
            hKey={loadingCompetitors ? 'c-loading' : 'c-done'}
            title={
              loadingCompetitors
                ? t(`Reading ${domain}…`, `Leyendo ${domain}…`)
                : found === 0
                  ? t('Who do you compete with?', '¿Con quién compites?')
                  : found === 1
                    ? t('We found 1 brand that competes with you', 'Hemos encontrado 1 marca que compite contigo')
                    : t(`We found ${found} brands that compete with you`, `Hemos encontrado ${found} marcas que compiten contigo`)
            }
            sub={
              loadingCompetitors
                ? t("We're working out what you sell and which brands sell the same.", 'Estamos viendo qué vendes y qué marcas venden lo mismo.')
                : found === 0
                  ? t('Add the brands your customers compare you with. You can also skip this and add them later.', 'Añade las marcas con las que te comparan tus clientes. También puedes saltarlo y añadirlas luego.')
                  : t("Untick any that don't fit and add the ones we missed. You can change them later from your dashboard.", 'Desmarca las que no encajen y añade las que falten. Luego podrás cambiarlas desde el panel.')
            }
          />
          <div className="col-span-2 mt-5 min-w-0 sm:col-span-1 sm:col-start-2">
            {loadingCompetitors && <Sonar name={brandName} domain={domain} text={t('Scanning your market', 'Rastreando tu mercado')} />}
            {!loadingCompetitors && warning && <Warn>{warning}</Warn>}
            <CompetitorGrid loading={loadingCompetitors} competitors={competitors} isOn={(c) => !off.has(c.name.toLowerCase())} onToggle={toggleCompetitor} onAdd={addCompetitor} seen={seen} />
          </div>
          <ActionBar
            sticky
            onClick={toPrompts}
            disabled={loadingCompetitors}
            label={
              selected.length === 0
                ? t('Continue without competitors', 'Seguir sin competidores')
                : selected.length === 1
                  ? t('Continue with 1 competitor', 'Seguir con 1 competidor')
                  : t(`Continue with ${selected.length} competitors`, `Seguir con ${selected.length} competidores`)
            }
          />
        </>
      )

    if (i === 2) {
      const n = selected.length
      const base =
        n === 0
          ? t(`Based on what ${brandName} sells.`, `A partir de lo que vende ${brandName}.`)
          : n === 1
            ? t(`Based on ${brandName} and your competitor.`, `A partir de ${brandName} y tu competidor.`)
            : t(`Based on ${brandName} and your ${n} competitors.`, `A partir de ${brandName} y tus ${n} competidores.`)
      return (
        <>
          <StepHeader
            label={stepLabel(3)}
            hKey={loadingPrompts ? 'p-loading' : 'p-done'}
            title={
              loadingPrompts
                ? t('Writing the questions your customers ask AI', 'Escribiendo las preguntas que tus clientes hacen a la IA')
                : suggested > 0
                  ? t(`We wrote ${suggested} questions your customers ask`, `Hemos escrito ${suggested} preguntas como las de tus clientes`)
                  : t("Write your customers' questions", 'Escribe las preguntas de tus clientes')
            }
            sub={loadingPrompts ? base : undefined}
          >
            {loadingPrompts ? (
              <EnginesWaiting />
            ) : (
              <div key="p-sub" className="anim-rise mt-2 lg:flex lg:items-end lg:justify-between lg:gap-8" style={vars({ '--i': 1 })}>
                <p className="max-w-[52ch] text-[15px] leading-relaxed text-mute lg:max-w-[40ch]">
                  <span className="mr-2 inline-flex translate-y-[3px] items-center" aria-hidden="true">
                    {ENGINE_IDS.map((id, j) => (
                      <span key={id} className={cx('rounded-full ring-[1.5px] ring-white', j > 0 && '-ml-1')}>
                        <PlatformDot id={id} size={18} />
                      </span>
                    ))}
                  </span>
                  {t(
                    "Every week we ask them to ChatGPT, Claude, Google AI, Perplexity and Grok and compare your results with your competitors'.",
                    'Cada semana se las hacemos a ChatGPT, Claude, Google AI, Perplexity y Grok y comparamos tus resultados con los de tu competencia.',
                  )}
                </p>
                <div className="mt-4 shrink-0 lg:mt-0 lg:w-[190px]">
                  <PlanMeter k={k} limit={LIMIT} />
                </div>
              </div>
            )}
          </StepHeader>
          <div className="col-span-2 mt-3 min-w-0 sm:col-span-1 sm:col-start-2">
            {!loadingPrompts && promptWarning && (
              <div className="mt-3">
                <Warn>{promptWarning}</Warn>
              </div>
            )}
            <PromptGroups loading={loadingPrompts} prompts={prompts} isOn={on} onToggle={togglePrompt} onAdd={addPrompt} k={k} limit={LIMIT} seen={seen} />
          </div>
          <ActionBar
            sticky
            onClick={() => void finish()}
            disabled={loadingPrompts || saving || k === 0}
            busy={saving}
            error={error}
            label={saving ? t('Saving…', 'Guardando…') : t('Start tracking', 'Empezar a medir')}
          />
        </>
      )
    }

    if (step === 'sin-prueba')
      return (
        <>
          <StepHeader
            hKey="sin-prueba"
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
          <ActionBar shortcut={false} onClick={() => window.location.assign('/dashboard/plans')} label={t('Choose a plan', 'Elegir un plan')} />
        </>
      )

    return <Setup onDone={goToDashboard} onLeaving={onLeaving} label={stepLabel(4)} brandName={brandName} domain={domain} />
  }

  return (
    <>
      {/* Fondo: la profundidad sube con cada paso y el plancton con ella */}
      <div aria-hidden="true" className="ob-depth pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[85vh]" style={vars({ '--d': idx })}>
        <div className="ob-plk-far">
          {PLANKTON_FAR.map((p, i) => (
            <span key={i} className="ob-plk" style={vars({ left: `${p.x}%`, top: `${p.y}%`, width: `${p.s}px`, height: `${p.s}px`, '--o': p.o, '--dur': `${p.dur}s`, '--delay': `${p.delay}s` })} />
          ))}
        </div>
        <div className="ob-plk-near">
          {PLANKTON_NEAR.map((p, i) => (
            <span key={i} className="ob-plk" style={vars({ left: `${p.x}%`, top: `${p.y}%`, width: `${p.s}px`, height: `${p.s}px`, '--o': p.o, '--dur': `${p.dur}s`, '--delay': `${p.delay}s` })} />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="ob-abyss ocean pointer-events-none fixed inset-0 -z-10" data-on={dark || undefined} />

      <div className="mx-auto w-full max-w-[600px] pt-4 sm:pt-10 lg:max-w-[640px]">
        <p className={cx('mb-5 text-[12px] font-semibold transition-colors duration-500', dark ? 'text-white/60' : 'text-mute')}>{t('Your workspace in 4 steps', 'Tu espacio en 4 pasos')}</p>
        <ol ref={listRef} aria-label={t('Setup steps', 'Pasos del alta')}>
          {[0, 1, 2, 3].map((i) => {
            const state = stateOf(i)
            return (
              <RailStep
                key={i}
                n={i + 1}
                state={state}
                nodeState={i === 3 && leaving ? 'done' : undefined}
                dark={dark}
                working={i === idx && working}
                title={stepName(i)}
                hint={hints[i]}
                hintSaved={hintSaved[i]}
                summary={summaries[i]}
                fill={idx > i}
                last={i === 3}
                nextDone={i < 3 && stateOf(i + 1) === 'done'}
              >
                {i === idx ? body(i) : null}
              </RailStep>
            )
          })}
        </ol>
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
      </div>
    </>
  )
}

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
 * Paso 4: la primera medición en directo, ya en el fondo marino. La diatomea de
 * la marca enciende cada IA según contesta y el arco del paso avanza con las
 * respuestas reales. Entra al panel en cuanto hay una primera tanda.
 */
function Setup({ onDone, onLeaving, label, brandName, domain }: { onDone: () => void; onLeaving: () => void; label: string; brandName: string; domain: string }) {
  const t = useT()
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [byEngine, setByEngine] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<LiveAnswer[]>([])
  /** Con la primera tanda: cuántas de las últimas respuestas te nombran (k de m). */
  const [final, setFinal] = useState<{ k: number; m: number } | null>(null)
  const started = useRef(Date.now())
  const leaving = useRef(false)
  const lastRecent = useRef<LiveAnswer[]>([])
  const leavingCb = useRef(onLeaving)
  useEffect(() => {
    leavingCb.current = onLeaving
  })

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/run-status', { cache: 'no-store' })
        const data = (await res.json()) as { active: { done: number; total: number } | null; byEngine?: Record<string, number>; recent?: LiveAnswer[] }
        const elapsed = Date.now() - started.current
        if (data.active) setProgress({ done: data.active.done, total: data.active.total })
        if (data.byEngine) setByEngine(data.byEngine)
        if (data.recent) {
          setRecent(data.recent)
          lastRecent.current = data.recent
        }
        // Al panel con una primera tanda (12 respuestas), al terminar o al minuto y medio.
        const enough = data.active ? data.active.done >= Math.min(data.active.total, 12) : elapsed > 5000
        if (!leaving.current && (enough || elapsed > 90_000)) {
          leaving.current = true
          const rec = lastRecent.current
          setFinal({ k: rec.filter((r) => r.own).length, m: rec.length })
          leavingCb.current()
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
  const current = recent[0]?.engine

  const title = final
    ? final.k > 0
      ? final.m === 1
        ? t('You already appear in the latest answer', 'Ya sales en la última respuesta')
        : t(`You already appear in ${final.k} of the last ${final.m} answers`, `Ya sales en ${final.k} de las últimas ${final.m} respuestas`)
      : t('Your dashboard is ready', 'Tu panel está listo')
    : t(`Asking the AI platforms about ${domain}`, `Preguntando a las IA por ${domain}`)
  const sub = final
    ? t('Opening your dashboard…', 'Abriendo tu panel…')
    : progress.total
      ? t(`${shown} of ${progress.total} answers in`, `${shown} de ${progress.total} respuestas recibidas`)
      : t('Sending your prompts to the AI platforms…', 'Enviando tus prompts a las IA…')

  return (
    <>
      <StepHeader dark label={label} hKey={final ? 'setup-done' : 'setup'} title={title} sub={sub} />
      <p aria-live="polite" className="sr-only">
        {final ? `${title}. ${sub}` : ''}
      </p>

      <div className="col-span-2 mt-8 min-w-0 sm:col-span-1 sm:col-start-2">
        <RunDiatom name={brandName} domain={domain} byEngine={byEngine} current={current} done={progress.done} total={progress.total} leaving={final !== null} />

        {/* Últimas respuestas reales */}
        <div className="anim-rise mt-8 overflow-hidden rounded-[22px] border border-white bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)]" style={vars({ '--i': 2 })}>
          <div className="flex items-center justify-between border-b border-line-2 px-5 py-3.5">
            <span className="text-[14px] font-bold text-ink">{t('Latest answers', 'Últimas respuestas')}</span>
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-mute">
              <span aria-hidden="true" className="live-dot h-[7px] w-[7px] rounded-full bg-brand-2" />
              {t('Live', 'En directo')}
            </span>
          </div>
          <ul className="divide-y divide-line-2">
            {recent.length
              ? recent.map((a, i) => {
                  const engine = ENGINE_NAMES[a.engine] ?? a.engine
                  const sources = a.cites === 1 ? t('1 source', '1 fuente') : t(`${a.cites} sources`, `${a.cites} fuentes`)
                  return (
                    <li key={a.id} className="anim-rise flex items-center gap-3 px-5 py-3">
                      <PlatformDot id={a.engine} size={24} />
                      <span className="min-w-0 flex-1">
                        {i === 0 ? (
                          <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink">{t(`${engine} answered “${a.prompt}”`, `${engine} ha respondido a «${a.prompt}»`)}</span>
                        ) : (
                          <span className="block truncate text-[13.5px] font-semibold text-ink">{a.prompt}</span>
                        )}
                        <span className="block text-[12px] text-mute">{i === 0 ? sources : `${engine} · ${sources}`}</span>
                      </span>
                      {a.own ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-line-2 px-2 py-0.5 text-[11.5px] font-bold text-ink">
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-2" />
                          {t('You appear', 'Sales')}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-md bg-line-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-2 num">
                          {a.brands === 1 ? t('1 brand', '1 marca') : t(`${a.brands} brands`, `${a.brands} marcas`)}
                        </span>
                      )}
                    </li>
                  )
                })
              : [0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="skeleton h-6 w-6 rounded-full" />
                    <span className="flex-1 space-y-1.5">
                      <span className="skeleton block h-3 w-4/5" />
                      <span className="skeleton block h-2.5 w-1/3" />
                    </span>
                  </li>
                ))}
          </ul>
        </div>

        <p className="anim-fade mt-5 max-w-[560px] text-[13px] leading-relaxed text-white/60" style={vars({ '--i': 3 })}>
          {t(
            "Each prompt goes to every AI platform, which searches the web just like it does for a real user. We read which brands are named, in what order and which pages are cited. You'll land on your dashboard in a moment.",
            'Cada prompt va a todas las IA, que buscan en internet igual que para una persona. Leemos qué marcas se nombran, en qué orden y qué páginas se citan. En un momento entras en tu panel.',
          )}
        </p>
      </div>
    </>
  )
}
