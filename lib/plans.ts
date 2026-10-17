// Planes de Placton. Fuente única de límites y precios: la web pública, el
// panel, Stripe y el motor diario leen de aquí.

import { bi, type Bi, type Lang } from './i18n-shared'

export type PlanId = 'trial' | 'inicial' | 'crecimiento' | 'escala' | 'agencia'
export type PaidPlanId = Exclude<PlanId, 'trial'>
export type Interval = 'month' | 'year'

export interface Plan {
  id: PlanId
  name: string
  /** Nombre en español para el panel en español. */
  nameEs: string
  tagline: Bi
  prompts: number
  /** null = sin límite. */
  members: number | null
  monthly: number
  /** Precio anual total (15 % de descuento sobre 12 meses). */
  yearly: number
  highlight?: boolean
}

export const TRIAL_DAYS = 7
export const YEARLY_DISCOUNT = 0.15

function yearlyFrom(monthly: number): number {
  return Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT))
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial',
    name: 'Free trial',
    nameEs: 'Prueba',
    tagline: bi('7 days with almost everything included', '7 días con casi todo incluido'),
    prompts: 10,
    members: 1,
    monthly: 0,
    yearly: 0,
  },
  inicial: {
    id: 'inicial',
    name: 'Starter',
    nameEs: 'Inicial',
    tagline: bi('For a brand starting to measure its AI presence', 'Para una marca que empieza a medirse'),
    prompts: 20,
    members: 2,
    monthly: 59,
    yearly: yearlyFrom(59),
  },
  crecimiento: {
    id: 'crecimiento',
    name: 'Growth',
    nameEs: 'Crecimiento',
    tagline: bi('For teams competing for every answer', 'Para equipos que compiten en serio'),
    prompts: 75,
    members: 10,
    monthly: 129,
    yearly: yearlyFrom(129),
    highlight: true,
  },
  agencia: {
    id: 'agencia',
    name: 'Agency',
    nameEs: 'Agencia',
    tagline: bi('For agencies tracking several client brands', 'Para agencias que siguen varias marcas cliente'),
    // Los prompts los da la bolsa contratada (ver agencyQuote); esto es solo el mínimo.
    prompts: 50,
    members: null,
    monthly: 15,
    yearly: yearlyFrom(15),
  },
  escala: {
    id: 'escala',
    name: 'Scale',
    nameEs: 'Escala',
    tagline: bi('For agencies and brands with a wide catalogue', 'Para agencias y marcas con mucho catálogo'),
    prompts: 300,
    members: null,
    monthly: 299,
    yearly: yearlyFrom(299),
  },
}

/** Planes de tarjeta (los tres de siempre). La Agencia va aparte, con su selector. */
export const PAID_PLANS: Exclude<PaidPlanId, 'agencia'>[] = ['inicial', 'crecimiento', 'escala']

/* ───────────── Plan Agencia: clientes + bolsa de prompts ─────────────
   La agencia elige cuántas marcas cliente sigue y cuántos prompts quiere medir
   al día EN TOTAL (una bolsa que reparte entre sus clientes como quiera).
   Precio = clientes × cuota por cliente + prompts × precio por prompt, con el
   precio por prompt bajando por tramos de volumen. Todo configurable aquí. */

export const AGENCY_MIN = 3
export const AGENCY_MAX = 100
export const AGENCY_PROMPTS_MIN = 50
export const AGENCY_PROMPTS_MAX = 5000
export const AGENCY_PROMPTS_STEP = 25

/** Cuota mensual por marca cliente (espacio, competidores, informes). */
export const AGENCY_CLIENT_MONTHLY = 15

/** Precio mensual por prompt medido a diario, por tramos de volumen. */
export const AGENCY_PROMPT_TIERS: { upTo: number | null; monthly: number }[] = [
  { upTo: 250, monthly: 1.6 },
  { upTo: 1000, monthly: 1.3 },
  { upTo: null, monthly: 1 },
]

/** Para compatibilidad con el resto del código (tarjeta Stripe de clientes). */
export const AGENCY_TIERS = [{ upTo: null as number | null, monthly: AGENCY_CLIENT_MONTHLY }]

function periodPrice(monthly: number, interval: Interval): number {
  return interval === 'year' ? Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT) * 100) / 100 : monthly
}

export function agencyPromptMonthly(prompts: number): number {
  return (AGENCY_PROMPT_TIERS.find((t) => t.upTo === null || prompts <= t.upTo) ?? AGENCY_PROMPT_TIERS[AGENCY_PROMPT_TIERS.length - 1]).monthly
}

export function clampClients(n: number): number {
  return Math.min(AGENCY_MAX, Math.max(AGENCY_MIN, Math.round(n) || AGENCY_MIN))
}

export function clampPrompts(n: number): number {
  const v = Math.round((n || AGENCY_PROMPTS_MIN) / AGENCY_PROMPTS_STEP) * AGENCY_PROMPTS_STEP
  return Math.min(AGENCY_PROMPTS_MAX, Math.max(AGENCY_PROMPTS_MIN, v))
}

export interface AgencyQuote {
  clients: number
  prompts: number
  /** Precio por cliente y por prompt en el periodo (mes o año). */
  clientUnit: number
  promptUnit: number
  clientsTotal: number
  promptsTotal: number
  total: number
  /** Total equivalente al mes (para enseñar el anual «a tanto al mes»). */
  perMonth: number
}

export function agencyQuote(clients: number, prompts: number, interval: Interval): AgencyQuote {
  const c = clampClients(clients)
  const p = clampPrompts(prompts)
  const clientUnit = periodPrice(AGENCY_CLIENT_MONTHLY, interval)
  const promptUnit = periodPrice(agencyPromptMonthly(p), interval)
  const clientsTotal = Math.round(clientUnit * c * 100) / 100
  const promptsTotal = Math.round(promptUnit * p * 100) / 100
  const total = Math.round((clientsTotal + promptsTotal) * 100) / 100
  return { clients: c, prompts: p, clientUnit, promptUnit, clientsTotal, promptsTotal, total, perMonth: interval === 'year' ? Math.round((total / 12) * 100) / 100 : total }
}

export function isPaidPlan(id: string): id is PaidPlanId {
  return (PAID_PLANS as string[]).includes(id) || id === 'agencia'
}

export function priceFor(plan: PaidPlanId, interval: Interval): number {
  return interval === 'year' ? PLANS[plan].yearly : PLANS[plan].monthly
}

/** Precio por mes equivalente, para enseñar el anual «a tanto al mes». */
export function monthlyEquivalent(plan: PaidPlanId, interval: Interval): number {
  return interval === 'year' ? Math.round((PLANS[plan].yearly / 12) * 100) / 100 : PLANS[plan].monthly
}

/** Moneda de cobro. Los precios del plan están en dólares (USD). */
export const CURRENCY = 'usd'

export function money(n: number, lang: Lang = 'en'): string {
  const hasDecimals = Math.round(n) !== n
  const num = n.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return lang === 'es' ? `${num} $` : `$${num}`
}

/** @deprecated nombre antiguo; los precios ya son en dólares. Usa `money`. */
export const euros = money

export function planName(id: PlanId, lang: Lang): string {
  return lang === 'es' ? PLANS[id].nameEs : PLANS[id].name
}

export const PLAN_FEATURES: Bi[] = [
  bi('Daily tracking', 'Seguimiento diario'),
  bi('Analytics and personalised insights', 'Analítica e ideas personalizadas'),
  bi('ChatGPT, Claude, Google AI, Perplexity and Grok', 'ChatGPT, Claude, Google AI, Perplexity y Grok'),
  bi('AI-readiness site audits', 'Auditoría de preparación para IA'),
]
