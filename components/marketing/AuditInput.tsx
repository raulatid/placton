'use client'

import { useEffect, useRef, useState } from 'react'

// Campo de la auditoría gratis: mientras está vacío, sin foco y a la vista, el
// texto de ejemplo va escribiendo dominios. Al tocarlo vuelve al ejemplo fijo.
// Con «reducir movimiento» (o sin JavaScript) se queda el ejemplo fijo.

export function AuditInput({
  words,
  placeholder,
  ...rest
}: { words: string[]; placeholder: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'placeholder'>) {
  const ref = useRef<HTMLInputElement>(null)
  // null: el ejemplo fijo (el de la prop, que cambia con el idioma).
  const [ph, setPh] = useState<string | null>(null)
  const key = words.join('|')

  useEffect(() => {
    const el = ref.current
    const list = key.split('|').filter(Boolean)
    if (!el || !list.length || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let visible = false
    let timer = 0
    let word = 0
    let pos = 0
    let mode: 'type' | 'hold' | 'erase' = 'type'
    const canRun = () => visible && document.activeElement !== el && el.value === ''
    const schedule = (ms: number) => {
      timer = window.setTimeout(tick, ms)
    }
    const stop = () => {
      window.clearTimeout(timer)
      timer = 0
      pos = 0
      mode = 'type'
      setPh(null)
    }
    function tick() {
      timer = 0
      if (!canRun()) return stop()
      const w = list[word]
      if (mode === 'type') {
        pos++
        setPh(w.slice(0, pos))
        if (pos >= w.length) {
          mode = 'hold'
          schedule(1600)
        } else schedule(70)
      } else if (mode === 'hold') {
        mode = 'erase'
        schedule(30)
      } else {
        pos--
        setPh(w.slice(0, pos))
        if (pos <= 0) {
          mode = 'type'
          word = (word + 1) % list.length
          schedule(350)
        } else schedule(30)
      }
    }
    const kick = () => {
      if (!timer && canRun()) schedule(400)
    }

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      if (visible) kick()
    })
    io.observe(el)
    const onInput = () => (el.value === '' ? kick() : stop())
    el.addEventListener('focus', stop)
    el.addEventListener('blur', kick)
    el.addEventListener('input', onInput)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
      setPh(null)
      el.removeEventListener('focus', stop)
      el.removeEventListener('blur', kick)
      el.removeEventListener('input', onInput)
    }
  }, [key])

  return <input ref={ref} placeholder={ph ?? placeholder} {...rest} />
}
