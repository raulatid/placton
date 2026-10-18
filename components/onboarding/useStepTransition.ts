'use client'

import { flushSync } from 'react-dom'
import { reduceMotion, type Step } from './shared'

let running = 0

/**
 * Cambio de paso con transición de vista y dirección: avanzar sube el contenido
 * y volver lo baja (CSS en app/onboarding/onboarding.css). Sin soporte o con
 * «reducir movimiento», el cambio es directo. `after` corre con el DOM ya
 * actualizado (foco, scroll y anuncio); `animated` dice si hubo transición.
 */
export function useStepTransition(setStep: (s: Step) => void, after?: (s: Step, animated: boolean) => void) {
  return (next: Step, dir: 'fwd' | 'back') => {
    const reduce = reduceMotion()
    const canAnimate = !reduce && typeof document !== 'undefined' && 'startViewTransition' in document
    const apply = () => {
      flushSync(() => setStep(next))
      after?.(next, canAnimate)
    }
    if (!canAnimate) return apply()
    const html = document.documentElement
    const mine = ++running
    html.dataset.obDir = dir
    try {
      document
        .startViewTransition(apply)
        .finished.catch(() => {})
        .finally(() => {
          // Si ya empezó otra transición, la dirección es suya.
          if (mine === running) delete html.dataset.obDir
        })
    } catch {
      delete html.dataset.obDir
      apply()
    }
  }
}
