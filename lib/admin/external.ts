import 'server-only'
import type Stripe from 'stripe'
import { stripe, stripeReady } from '../stripe'

// Datos en vivo para el panel de administración: Stripe (suscripciones, cobros y
// comisiones reales), OpenRouter (gasto real de esta clave y saldo de la cuenta)
// y DataForSEO (saldo). Todo de solo lectura, con caché de 5 minutos y sin
// romper la página si un servicio no responde (entonces devuelve null).

const TTL = 5 * 60_000
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, fresh: boolean, fn: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value as T
  try {
    const value = await fn()
    cache.set(key, { at: Date.now(), value })
    return value
  } catch (err) {
    console.error(`[admin] ${key}:`, err instanceof Error ? err.message : err)
    return hit ? (hit.value as T) : null
  }
}

export function lastFetched(key: 'stripe' | 'openrouter' | 'dataforseo'): number | null {
  return cache.get(key)?.at ?? null
}

/* ───────────── Stripe ───────────── */

export interface SubRow {
  id: string
  status: Stripe.Subscription.Status
  workspaceId: number | null
  plan: string
  interval: 'month' | 'year'
  /** Importe mensual equivalente en dólares (los anuales, entre 12). */
  monthly: number
  created: number
  /** Cuándo terminó de verdad (baja efectiva), en segundos. */
  endedAt: number | null
  canceledAt: number | null
  cancelAtPeriodEnd: boolean
}

export interface InvoiceRow {
  id: string
  created: number
  amount: number
  currency: string
  subscription: string | null
}

export interface StripeData {
  subs: SubRow[]
  invoices: InvoiceRow[]
  /** Comisiones de Stripe en dólares por día (YYYY-MM-DD, hora de Madrid). */
  feesByDay: Record<string, number>
  refunds: { created: number; amount: number }[]
  balance: { available: number; pending: number; currency: string }
}

/** Importe de un precio por escalones (volumen o graduado) para una cantidad. */
function tieredAmount(price: Stripe.Price, qty: number): number {
  const tiers = price.tiers ?? []
  if (!tiers.length) return 0
  if (price.tiers_mode === 'volume') {
    const t = tiers.find((x) => x.up_to === null || qty <= x.up_to) ?? tiers[tiers.length - 1]
    return (t.unit_amount ?? 0) * qty + (t.flat_amount ?? 0)
  }
  let left = qty
  let prev = 0
  let sum = 0
  for (const t of tiers) {
    const cap = t.up_to === null ? Infinity : t.up_to
    const n = Math.max(0, Math.min(left, cap - prev))
    if (n > 0) sum += (t.unit_amount ?? 0) * n + (t.flat_amount ?? 0)
    left -= n
    prev = cap
    if (left <= 0) break
  }
  return sum
}

const madridDay = (sec: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(sec * 1000))

async function loadStripe(): Promise<StripeData> {
  const s = stripe()
  const since = Math.floor(Date.now() / 1000) - 400 * 86_400

  const tierCache = new Map<string, Stripe.Price>()
  const subs: SubRow[] = []
  for await (const sub of s.subscriptions.list({ status: 'all', limit: 100 })) {
    let cents = 0
    let interval: 'month' | 'year' = 'month'
    for (const item of sub.items.data) {
      let price = item.price
      const qty = item.quantity ?? 1
      if (price.recurring?.interval === 'year') interval = 'year'
      if (price.billing_scheme === 'tiered') {
        if (!tierCache.has(price.id)) tierCache.set(price.id, await s.prices.retrieve(price.id, { expand: ['tiers'] }))
        price = tierCache.get(price.id)!
        cents += tieredAmount(price, qty)
      } else {
        cents += (price.unit_amount ?? 0) * qty
      }
    }
    const months = interval === 'year' ? 12 : 1
    subs.push({
      id: sub.id,
      status: sub.status,
      workspaceId: Number(sub.metadata?.workspaceId) || null,
      plan: sub.metadata?.plan || 'otro',
      interval,
      monthly: cents / 100 / months,
      created: sub.start_date || sub.created,
      endedAt: sub.ended_at ?? null,
      canceledAt: sub.canceled_at ?? null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    })
    if (subs.length >= 2000) break
  }

  const invoices: InvoiceRow[] = []
  for await (const inv of s.invoices.list({ status: 'paid', created: { gte: since }, limit: 100 })) {
    if (!inv.amount_paid) continue
    const parent = (inv as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent
    const subRef = parent?.subscription_details?.subscription ?? (inv as unknown as { subscription?: string | { id: string } | null }).subscription ?? null
    invoices.push({
      id: inv.id ?? '',
      created: inv.status_transitions?.paid_at ?? inv.created,
      amount: inv.amount_paid / 100,
      currency: inv.currency,
      subscription: typeof subRef === 'string' ? subRef : (subRef?.id ?? null),
    })
    if (invoices.length >= 5000) break
  }

  // Comisiones reales. La cuenta liquida en euros: las de cada cobro se pasan a
  // dólares con el cambio que aplicó Stripe a ese cobro; las sueltas (Billing,
  // etc.), con el cambio medio del periodo.
  const feesEur: { day: string; eur: number; rate: number | null }[] = []
  const rates: number[] = []
  for await (const bt of s.balanceTransactions.list({ created: { gte: since }, limit: 100 })) {
    const day = madridDay(bt.created)
    const native = bt.currency.toLowerCase()
    const toUsd = native === 'usd' ? 1 : bt.exchange_rate ? 1 / bt.exchange_rate : null
    if (bt.exchange_rate) rates.push(1 / bt.exchange_rate)
    if (bt.fee) feesEur.push({ day, eur: bt.fee / 100, rate: toUsd })
    if (bt.type === 'stripe_fee' || bt.type === 'tax_fee') feesEur.push({ day, eur: -bt.amount / 100, rate: native === 'usd' ? 1 : null })
    if (feesEur.length >= 10_000) break
  }
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : Number(process.env.PLACTON_EUR_USD || 1.08)
  const feesByDay: Record<string, number> = {}
  for (const f of feesEur) feesByDay[f.day] = (feesByDay[f.day] ?? 0) + f.eur * (f.rate ?? avgRate)

  const refunds: { created: number; amount: number }[] = []
  for await (const r of s.refunds.list({ created: { gte: since }, limit: 100 })) {
    if (r.status === 'succeeded') refunds.push({ created: r.created, amount: r.amount / 100 })
    if (refunds.length >= 2000) break
  }

  const bal = await s.balance.retrieve()
  const sum = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0) / 100
  return {
    subs,
    invoices,
    feesByDay,
    refunds,
    balance: { available: sum(bal.available), pending: sum(bal.pending), currency: bal.available[0]?.currency ?? 'eur' },
  }
}

export function stripeData(fresh = false): Promise<StripeData | null> {
  if (!stripeReady()) return Promise.resolve(null)
  return cached('stripe', fresh, loadStripe)
}

/* ───────────── OpenRouter ───────────── */

export interface OpenRouterData {
  /** Gasto de la clave de Placton, en dólares. */
  today: number
  week: number
  month: number
  total: number
  /** Saldo de la cuenta (compartida con otros proyectos). */
  credits: number
  used: number
}

async function orGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://openrouter.ai/api/v1/${path}`, {
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`OpenRouter ${path} ${res.status}`)
  return ((await res.json()) as { data: T }).data
}

export function openRouterData(fresh = false): Promise<OpenRouterData | null> {
  if (!process.env.OPENROUTER_API_KEY) return Promise.resolve(null)
  return cached('openrouter', fresh, async () => {
    const [key, credits] = await Promise.all([
      orGet<{ usage: number; usage_daily: number; usage_weekly: number; usage_monthly: number }>('key'),
      orGet<{ total_credits: number; total_usage: number }>('credits'),
    ])
    return {
      today: key.usage_daily ?? 0,
      week: key.usage_weekly ?? 0,
      month: key.usage_monthly ?? 0,
      total: key.usage ?? 0,
      credits: credits.total_credits ?? 0,
      used: credits.total_usage ?? 0,
    }
  })
}

/* ───────────── DataForSEO ───────────── */

export function dataForSeoBalance(fresh = false): Promise<{ balance: number; deposited: number } | null> {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) return Promise.resolve(null)
  return cached('dataforseo', fresh, async () => {
    const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      headers: { authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`DataForSEO ${res.status}`)
    const json = (await res.json()) as { tasks?: { result?: { money?: { balance?: number; total?: number } }[] }[] }
    const money = json.tasks?.[0]?.result?.[0]?.money
    if (!money) throw new Error('DataForSEO sin datos')
    return { balance: money.balance ?? 0, deposited: money.total ?? 0 }
  })
}
