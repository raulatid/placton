'use client'

import { useLayoutEffect, useRef, useState } from 'react'

// Aparición al hacer scroll y pausa de los bucles fuera de vista, para la web
// pública. Envuelve a piezas de servidor sin convertirlas en cliente: solo
// añade dos atributos que lee el CSS de globals.css («Animaciones de la landing»).
//
// - data-reveal: "" (estado inicial, visible), "wait" (aún no se ha visto:
//   oculto) e "in" (ya se ha visto o ha recibido el foco: entra una sola vez).
//   Lo que está en pantalla al montar no se oculta nunca, así que no hay
//   parpadeos ni al cargar ni al llegar desde otra página. Se puede anidar: un
//   <Reveal> dentro de otro espera a verse él mismo (y retiene sus animaciones).
// - data-live: "on" mientras se ve y "off" fuera de vista (los bucles se paran).
//
// Sin JavaScript o con «reducir movimiento» nada se oculta.

type Tag = 'div' | 'article' | 'section' | 'p' | 'ul' | 'ol'

let revealIO: IntersectionObserver | null = null
let liveIO: IntersectionObserver | null = null
const onReveal = new WeakMap<Element, () => void>()
const onLive = new WeakMap<Element, (on: boolean) => void>()

function revealObserver(): IntersectionObserver {
  revealIO ??= new IntersectionObserver(
    (entries) => {
      // Aparece en cuanto asoma por encima del 88 % de la pantalla (el margen
      // de abajo), sea cual sea su altura: un bloque alto no se queda en blanco.
      for (const e of entries) if (e.isIntersecting) onReveal.get(e.target)?.()
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0 },
  )
  return revealIO
}

function liveObserver(): IntersectionObserver {
  liveIO ??= new IntersectionObserver((entries) => {
    for (const e of entries) onLive.get(e.target)?.(e.isIntersecting)
  })
  return liveIO
}

export function Reveal({
  as = 'div',
  reveal = true,
  live = false,
  delay,
  className,
  style,
  children,
  ...rest
}: {
  as?: Tag
  /** Aparece al verse (por defecto). */
  reveal?: boolean
  /** Para sus bucles (rayos, plancton, marquesina…) mientras no se ve. */
  live?: boolean
  /** Retardo de la propia aparición, en ms. */
  delay?: number
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'>) {
  const ref = useRef<HTMLElement>(null)
  const seen = useRef(false)
  const [state, setState] = useState<'' | 'wait' | 'in'>('')
  const [on, setOn] = useState<'' | 'on' | 'off'>('')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const stop: (() => void)[] = []

    if (reveal && !seen.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const r = el.getBoundingClientRect()
      if (r.top < window.innerHeight && r.bottom > 0) {
        // Ya a la vista: se queda como está.
        seen.current = true
      } else {
        setState('wait')
        const io = revealObserver()
        // También aparece al recibir el foco: nada se enfoca estando invisible.
        const show = () => {
          forget()
          seen.current = true
          setState('in')
        }
        const forget = () => {
          io.unobserve(el)
          onReveal.delete(el)
          el.removeEventListener('focusin', show)
        }
        onReveal.set(el, show)
        el.addEventListener('focusin', show)
        io.observe(el)
        stop.push(forget)
      }
    }

    if (live) {
      const io = liveObserver()
      onLive.set(el, (v) => setOn(v ? 'on' : 'off'))
      io.observe(el)
      stop.push(() => {
        io.unobserve(el)
        onLive.delete(el)
      })
    }

    return () => stop.forEach((f) => f())
  }, [reveal, live])

  const Comp = as as React.ElementType
  return (
    <Comp
      ref={ref}
      className={className}
      style={delay ? ({ ...style, '--rv-delay': `${delay}ms` } as React.CSSProperties) : style}
      data-reveal={reveal ? state : undefined}
      data-live={live ? on : undefined}
      {...rest}
    >
      {children}
    </Comp>
  )
}
