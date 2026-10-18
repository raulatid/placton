'use client'

import { useEffect, useState } from 'react'
import type { SuggestedPrompt } from '@/lib/ai'

// Piezas comunes del alta («la bitácora»): tipos, ayudas de texto y el retardo
// del logo en vivo. La lógica del alta sigue en components/Onboarding.tsx.

export type Step = 'web' | 'competitors' | 'prompts' | 'setup' | 'sin-prueba'

export interface Competitor {
  name: string
  domain: string
}

/** Prompt del alta; `custom` es una marca local que nunca viaja al servidor. */
export type LocalPrompt = SuggestedPrompt & { custom?: boolean }

/** Posición del paso en la línea (0 a 3). «Sin prueba» ocupa el sitio del 4. */
export const STEP_INDEX: Record<Step, number> = { web: 0, competitors: 1, prompts: 2, setup: 3, 'sin-prueba': 3 }

export function nameFromInput(raw: string): Competitor | null {
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

/** Lo escrito como dominio limpio (sin https:// ni www.), o null si no lo parece. */
export function domainOf(raw: string): Competitor | null {
  const c = nameFromInput(raw)
  return c && c.domain ? c : null
}

/** Dominio para los titulares: «https://www.asana.com/es» → «asana.com». */
export function cleanDomain(raw: string): string {
  return (
    raw
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/[/?#].*$/, '')
      .toLowerCase() || raw.trim()
  )
}

/**
 * Valor que solo cambia tras `ms` sin cambios. Sirve para no pedir el logo real
 * a /api/logo con cada tecla: mientras se escribe se ve la inicial.
 */
export function useSettled<T>(value: T, ms = 650): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(value, settled)) return
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, settled, ms])
  return settled
}

export function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Estilo con variables CSS (--i, --d…). */
export function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

export const ENGINE_IDS = ['chatgpt', 'claude', 'google', 'perplexity', 'grok'] as const
export const ENGINE_NAMES: Record<string, string> = { chatgpt: 'ChatGPT', claude: 'Claude', google: 'Google AI', perplexity: 'Perplexity', grok: 'Grok' }
