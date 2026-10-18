'use client'

import { useLayoutEffect, useRef, useState } from 'react'

// Texto que se escribe letra a letra. El servidor pinta el texto entero (y el
// lector de pantalla siempre lo lee entero); en el cliente se vacía y se
// escribe al verse. Lo que falta por escribir ocupa su sitio, invisible, así
// que nada salta. Con «reducir movimiento», el texto completo y sin cursor.

export type TypedSegment = { text: string; className?: string }

/**
 * Momento (ms desde el inicio) en que aparece cada letra: un ritmo algo
 * irregular, con una pausa tras la puntuación. Si pasa de `maxDuration`, se
 * acelera entero para caber.
 */
export function typedSchedule(text: string, speed: [number, number] = [18, 28], maxDuration?: number): number[] {
  const times: number[] = []
  let t = 0
  for (let i = 0; i < text.length; i++) {
    t += speed[0] + (((i * 37) % 11) / 10) * (speed[1] - speed[0])
    times.push(t)
    const ch = text[i]
    const next = text[i + 1]
    if (next === ' ' || next === undefined) {
      if (/[.?!]/.test(ch)) t += 260
      else if (/[,;:]/.test(ch)) t += 140
    }
  }
  if (maxDuration && times.length && times[times.length - 1] > maxDuration) {
    const k = maxDuration / times[times.length - 1]
    for (let i = 0; i < times.length; i++) times[i] *= k
  }
  return times
}

export function Typed({
  segments,
  speed = [18, 28],
  maxDuration,
  startWhenVisible = true,
  threshold = 0.6,
  delay = 0,
  run = true,
  paused = false,
  onDone,
  caret = true,
  reserve = true,
}: {
  segments: TypedSegment[] | string
  /** Milisegundos por letra (mínimo, máximo). */
  speed?: [number, number]
  maxDuration?: number
  /** Empieza al verse (por defecto). Si no, empieza al montar o cuando `run` pasa a true. */
  startWhenVisible?: boolean
  threshold?: number
  delay?: number
  /** Con false se muestra el texto entero, quieto. */
  run?: boolean
  paused?: boolean
  onDone?: () => void
  caret?: boolean
  /** Reserva el hueco de lo que falta (false en una sola línea recortada). */
  reserve?: boolean
}) {
  const segs: TypedSegment[] = typeof segments === 'string' ? [{ text: segments }] : segments
  const full = segs.map((s) => s.text).join('')
  const [count, setCount] = useState(full.length)
  const [typing, setTyping] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const pausedRef = useRef(paused)
  const doneRef = useRef(onDone)
  const resumeRef = useRef<(() => void) | null>(null)
  const [s0, s1] = speed

  useLayoutEffect(() => {
    pausedRef.current = paused
    doneRef.current = onDone
    if (!paused) resumeRef.current?.()
  })

  useLayoutEffect(() => {
    if (!run) {
      setCount(full.length)
      setTyping(false)
      return
    }
    const finish = () => {
      setCount(full.length)
      setTyping(false)
      doneRef.current?.()
    }
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return finish()
    if (startWhenVisible) {
      if (!('IntersectionObserver' in window)) return finish()
      const r = el.getBoundingClientRect()
      // Ya a la vista al montar: se queda entero.
      if (r.top < window.innerHeight && r.bottom > 0) return finish()
    }

    const times = typedSchedule(full, [s0, s1], maxDuration)
    let raf = 0
    let timer = 0
    let started = false
    let ended = false
    let elapsed = 0
    let last = 0
    let shown = 0
    let io: IntersectionObserver | null = null
    setCount(0)
    setTyping(true)

    const loop = (now: number) => {
      raf = 0
      if (pausedRef.current) return
      // Con la pestaña en segundo plano no se salta de golpe al final.
      elapsed += Math.min(now - last, 250)
      last = now
      let n = shown
      while (n < times.length && times[n] <= elapsed) n++
      if (n !== shown) {
        shown = n
        setCount(n)
      }
      if (n >= times.length) {
        ended = true
        setTyping(false)
        doneRef.current?.()
        return
      }
      raf = requestAnimationFrame(loop)
    }
    const resume = () => {
      if (!started || ended || raf) return
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    resumeRef.current = resume
    const begin = () => {
      timer = window.setTimeout(() => {
        started = true
        resume()
      }, delay)
    }
    if (startWhenVisible) {
      io = new IntersectionObserver(
        ([e]) => {
          if (!e?.isIntersecting) return
          io?.disconnect()
          begin()
        },
        { threshold },
      )
      io.observe(el)
    } else begin()

    return () => {
      io?.disconnect()
      window.clearTimeout(timer)
      if (raf) cancelAnimationFrame(raf)
      resumeRef.current = null
    }
  }, [run, full, startWhenVisible, threshold, delay, maxDuration, s0, s1])

  const n = run ? count : full.length
  const done: React.ReactNode[] = []
  const rest: React.ReactNode[] = []
  let offset = 0
  segs.forEach((s, k) => {
    const a = Math.max(0, Math.min(s.text.length, n - offset))
    if (a > 0)
      done.push(
        <span key={k} className={s.className}>
          {s.text.slice(0, a)}
        </span>,
      )
    if (a < s.text.length && reserve)
      rest.push(
        <span key={k} className={s.className}>
          {s.text.slice(a)}
        </span>,
      )
    offset += s.text.length
  })

  return (
    <span ref={ref}>
      <span className="sr-only">{full}</span>
      <span aria-hidden="true">
        {done}
        {caret && typing && <span className="typed-caret" />}
        {rest.length > 0 && <span className="invisible">{rest}</span>}
      </span>
    </span>
  )
}
