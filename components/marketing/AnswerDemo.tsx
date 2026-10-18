'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { BrandMark } from './BrandMark'
import { DIRECT, INDIRECT } from './format'
import { PlatformLogo } from './PlatformLogo'
import { Typed, typedSchedule, type TypedSegment } from './Typed'

// Ejemplo de lo que mide Placton: la misma pregunta a tres IA, cada respuesta
// escrita en directo y, al terminar, cómo sale la marca (puesto y tipo de
// mención). Rota sola mientras se ve; al tocar una pestaña o entrar en ellas
// con el teclado se queda en ella, y con el ratón encima no pasa a la
// siguiente (la que se está escribiendo termina). Sin JavaScript o con
// «reducir movimiento», la primera respuesta entera y quieta.

const SPEED: [number, number] = [16, 24]
const MAX_TYPING = 4500
const HOLD = 2800
const FADE = 300

type AnswerId = 'chatgpt' | 'claude' | 'perplexity'
type Answer = { id: AnswerId; name: string; text: string; position: number | null; mention: 'direct' | 'indirect'; sources?: string[] }
type Phase = 'static' | 'typing' | 'done' | 'out'

const OWN = { name: 'Asana', domain: 'asana.com' }

function answers(lang: Lang): Answer[] {
  const t = makeT(lang)
  return [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      position: 2,
      mention: 'direct',
      text: t(
        'For a remote team, three tools stand out. Notion works well if you want docs and tasks together. Asana is the strongest for planning across time zones, with timelines and workload views. monday.com suits teams that like simple boards.',
        'Para un equipo en remoto destacan tres herramientas. Notion va bien si quieres documentos y tareas juntos. Asana es la más completa para planificar entre husos horarios, con cronogramas y carga de trabajo. monday.com encaja con equipos que prefieren tableros sencillos.',
      ),
    },
    {
      id: 'claude',
      name: 'Claude',
      position: 1,
      mention: 'direct',
      text: t(
        'If your team is fully remote, Asana is a safe first choice: it handles async updates, dependencies and goals well. monday.com is easier to set up for simple workflows, and Notion fits teams that document a lot.',
        'Si tu equipo trabaja en remoto, Asana es una apuesta segura: gestiona bien las actualizaciones asíncronas, las dependencias y los objetivos. monday.com es más fácil de montar para flujos sencillos y Notion encaja con equipos que documentan mucho.',
      ),
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      position: null,
      mention: 'indirect',
      sources: ['asana.com', 'notion.so', 'monday.com'],
      text: t(
        'The options most recommended for remote teams are Notion, monday.com and ClickUp, mainly for their flexible boards and async features. Most guides stress clear ownership and a weekly review.',
        'Las opciones más recomendadas para equipos en remoto son Notion, monday.com y ClickUp, sobre todo por sus tableros flexibles y sus funciones asíncronas. Casi todas las guías insisten en dejar claro quién se encarga de qué y en revisar el trabajo cada semana.',
      ),
    },
  ]
}

/** Parte la respuesta para resaltar las marcas: la propia, subrayada; las demás, en negrita. */
function segmentsFor(text: string): TypedSegment[] {
  return text
    .split(/(Asana|Notion|monday\.com|ClickUp)/)
    .filter(Boolean)
    .map((part) =>
      part === OWN.name
        ? { text: part, className: 'font-semibold text-ink underline decoration-brand-2 decoration-2 underline-offset-[5px]' }
        : /^(Notion|monday\.com|ClickUp)$/.test(part)
          ? { text: part, className: 'font-semibold text-ink' }
          : { text: part },
    )
}

function typingTime(text: string): number {
  const times = typedSchedule(text, SPEED, MAX_TYPING)
  return times.length ? times[times.length - 1] : 0
}

const TAG = 'inline-flex items-center gap-1.5 rounded-full bg-line-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2'

export function AnswerDemo({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  const list = useMemo(() => answers(lang), [lang])
  const uid = useId()
  const rootRef = useRef<HTMLElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const holdLeft = useRef(HOLD)

  const [active, setActive] = useState(0)
  const [phase, setPhase] = useState<Phase>('static')
  const [cycle, setCycle] = useState(0)
  const [cycleDur, setCycleDur] = useState(0)
  const [auto, setAuto] = useState(true)
  const [visible, setVisible] = useState(false)
  // Ratón encima: la rotación espera (para leer la respuesta con calma).
  const [hold, setHold] = useState(false)
  // El remate entra con movimiento solo cuando llega tras escribir.
  const [rise, setRise] = useState(false)

  // Arranque: con «reducir movimiento» se queda quieta. Si ya se ve al montar,
  // la primera respuesta se queda entera y la rotación sigue desde ahí; si no,
  // se vacía y se escribe al llegar.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    holdLeft.current = HOLD
    if (r.top < window.innerHeight && r.bottom > 0) {
      setCycleDur(HOLD + FADE)
      setPhase('done')
    } else {
      setCycleDur(typingTime(list[0].text) + HOLD + FADE)
      setPhase('typing')
    }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
    // Solo al montar: la primera respuesta es siempre la misma.
  }, [])

  // Remate a la vista: espera y pasa a la siguiente (se para fuera de vista y
  // con el ratón encima, y sigue con lo que le quedaba).
  useEffect(() => {
    if (phase !== 'done' || !auto || !visible || hold) return
    const started = performance.now()
    const id = window.setTimeout(() => setPhase('out'), holdLeft.current)
    return () => {
      window.clearTimeout(id)
      holdLeft.current = Math.max(0, holdLeft.current - (performance.now() - started))
    }
  }, [phase, auto, visible, hold])

  // Fundido y siguiente pestaña.
  useEffect(() => {
    if (phase !== 'out') return
    const id = window.setTimeout(() => {
      const next = (active + 1) % list.length
      setActive(next)
      setCycle((c) => c + 1)
      setCycleDur(typingTime(list[next].text) + HOLD + FADE)
      setRise(false)
      setPhase('typing')
    }, FADE)
    return () => window.clearTimeout(id)
  }, [phase, active, list])

  const onDone = useCallback(() => {
    holdLeft.current = HOLD
    setRise(true)
    setPhase('done')
  }, [])

  const choose = (i: number) => {
    setAuto(false)
    if (phase === 'static') {
      setActive(i)
      return
    }
    if (i === active && phase !== 'out') return
    setActive(i)
    setCycle((c) => c + 1)
    setRise(false)
    setPhase('typing')
  }

  // Con el foco en las pestañas la rotación se para del todo: la pestaña con el
  // foco no cambia sola. Si estaba fundiéndose, vuelve.
  const onFocus = () => {
    if (!auto) return
    setAuto(false)
    if (phase === 'out') setPhase('done')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = list.length
    // Desde la pestaña con el foco (si la hay), no desde la activa.
    const focused = tabRefs.current.findIndex((b) => b === document.activeElement)
    const from = focused >= 0 ? focused : active
    const next =
      e.key === 'ArrowRight' ? (from + 1) % n
      : e.key === 'ArrowLeft' ? (from - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : -1
    if (next < 0) return
    e.preventDefault()
    choose(next)
    tabRefs.current[next]?.focus()
  }

  const progress = auto && phase !== 'static'
  // La barra va al paso de la rotación: se para fuera de vista y, con el ratón
  // encima, cuando ya está escrita (mientras escribe sigue, como el texto).
  const running = visible && !(hold && phase === 'done')
  const question = t(
    "What's the best project management tool for a remote team?",
    '¿Cuál es la mejor herramienta de gestión de proyectos para un equipo en remoto?',
  )

  return (
    <figure
      ref={rootRef}
      onPointerEnter={(e) => e.pointerType !== 'touch' && setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={onFocus}
      aria-label={t('Example of an AI answer', 'Ejemplo de respuesta de una IA')}
      className="m-0 overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_30px_60px_-30px_rgba(4,25,28,0.35)]"
    >
      <div role="tablist" aria-label={t('AI assistants', 'Asistentes de IA')} onKeyDown={onKeyDown} className="flex gap-1 border-b border-line px-3 sm:px-4">
        {list.map((a, i) => {
          const on = i === active
          return (
            <button
              key={a.id}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              id={`${uid}-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(i)}
              className={cx(
                'relative my-2.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold transition-colors',
                on ? 'bg-line-2 text-ink' : 'text-mute hover:text-ink-2',
              )}
            >
              <PlatformLogo id={a.id} size={18} decorative />
              {a.name}
              {on && (
                <span aria-hidden="true" className="absolute inset-x-2.5 -bottom-[11px] h-0.5 overflow-hidden rounded-full">
                  <span
                    key={cycle}
                    className={cx('block h-full w-full origin-left bg-ink', progress && 'tab-progress')}
                    style={progress ? ({ '--dur': `${cycleDur}ms`, animationPlayState: running ? 'running' : 'paused' } as React.CSSProperties) : undefined}
                  />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
        <p className="ml-auto w-fit max-w-[85%] rounded-[16px] rounded-tr-md bg-line-2 px-4 py-2.5 text-[14px] leading-snug text-ink">{question}</p>

        {/* Las tres respuestas en la misma celda: el alto es el de la más larga y nada salta al cambiar. */}
        <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${active}`} className="mt-4 grid">
          {list.map((a, i) => {
            const on = i === active
            const tags = on && phase !== 'typing'
            return (
              <div
                key={a.id}
                className={cx(
                  'col-start-1 row-start-1 transition-opacity duration-300',
                  on ? (phase === 'out' ? 'opacity-0' : 'opacity-100') : 'invisible opacity-0',
                )}
              >
                <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-2">
                  <PlatformLogo id={a.id} size={20} decorative />
                  {a.name}
                </p>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
                  <Typed
                    segments={segmentsFor(a.text)}
                    speed={SPEED}
                    maxDuration={MAX_TYPING}
                    startWhenVisible={false}
                    run={on && phase === 'typing'}
                    paused={!visible}
                    onDone={on ? onDone : undefined}
                  />
                </p>
                <div className={cx('mt-4', !tags ? 'invisible' : rise && 'anim-rise')}>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={TAG}>
                      <BrandMark name={OWN.name} domain={OWN.domain} size={14} />
                      {OWN.name}
                    </span>
                    <span className={cx(TAG, 'num')}>{a.position ? t(`position ${a.position}`, `puesto ${a.position}`) : t('not named', 'no la nombra')}</span>
                    <span className={TAG}>
                      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.mention === 'direct' ? DIRECT : INDIRECT }} />
                      {a.mention === 'direct' ? t('direct mention', 'mención directa') : t('indirect mention (cites asana.com)', 'mención indirecta (cita asana.com)')}
                    </span>
                  </div>
                  {a.sources && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="mr-0.5 text-[12px] font-semibold text-mute">{t('Sources', 'Fuentes')}</span>
                      {a.sources.map((s) => (
                        <span
                          key={s}
                          className={cx(TAG, 'font-mono font-normal', s === OWN.domain && 'text-ink underline decoration-brand-2 decoration-2 underline-offset-[3px]')}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </figure>
  )
}
