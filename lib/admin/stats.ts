import 'server-only'
import { addDays, all, one, today } from '../db'
import { agencyQuote, isPaidPlan, monthlyEquivalent, planName, type PaidPlanId } from '../plans'
import * as repo from '../repo'
import type { Workspace } from '../types'
import type { OpenRouterData, StripeData, SubRow } from './external'

// Cifras del panel de administración. Cada número sale de un dato medido: la
// base de datos propia (visitas sin cookies, altas, espacios, mediciones y su
// coste por respuesta), Stripe (suscripciones, cobros y comisiones reales) y
// OpenRouter (gasto real de la clave). Lo estimado se dice en la página.

/* ───────────── Periodo ───────────── */

export const RANGES = {
  '7d': { days: 7, label: '7 días' },
  '30d': { days: 30, label: '30 días' },
  '90d': { days: 90, label: '90 días' },
  '12m': { days: 365, label: '12 meses' },
} as const
export type RangeId = keyof typeof RANGES

export interface Period {
  id: RangeId
  days: number
  from: string
  to: string
  prevFrom: string
  prevTo: string
  /** Inicio y fin en segundos (para Stripe). */
  fromSec: number
  toSec: number
  prevFromSec: number
}

const sec = (day: string, end = false) => Math.floor(new Date(`${day}T${end ? '23:59:59' : '00:00:00'}+01:00`).getTime() / 1000)

export function period(raw: string | undefined): Period {
  const id: RangeId = raw && raw in RANGES ? (raw as RangeId) : '30d'
  const days = RANGES[id].days
  const to = today()
  const from = addDays(to, -(days - 1))
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(days - 1))
  return { id, days, from, to, prevFrom, prevTo, fromSec: sec(from), toSec: sec(to, true), prevFromSec: sec(prevFrom) }
}

/* ───────────── Hora de Madrid ───────────── */

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Día (YYYY-MM-DD), hora (0-23) y día de la semana (0 = lunes) en Madrid. */
export function madrid(at: string | number): { day: string; hour: number; dow: number } {
  const d = typeof at === 'number' ? new Date(at * 1000) : new Date(at)
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, dow: DOW[parts.weekday] ?? 0 }
}

const monthKey = (day: string) => day.slice(0, 7)
const inRange = (day: string, from: string, to: string) => day >= from && day <= to

/** Días del periodo, o semanas (lunes) si es largo, para las gráficas. */
export function buckets(p: Period): { key: string; from: string; to: string; label: string }[] {
  const out: { key: string; from: string; to: string; label: string }[] = []
  const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  if (p.days <= 90) {
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) out.push({ key: d, from: d, to: d, label: short(d) })
    return out
  }
  let start = p.from
  const dow = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7
  start = addDays(start, -dow)
  for (let d = start; d <= p.to; d = addDays(d, 7)) out.push({ key: d, from: d < p.from ? p.from : d, to: addDays(d, 6) > p.to ? p.to : addDays(d, 6), label: short(d) })
  return out
}

/** Los últimos 12 meses naturales (el actual incluido). */
export function lastMonths(n = 12): { key: string; label: string; from: string; to: string }[] {
  const now = today()
  const out: { key: string; label: string; from: string; to: string }[] = []
  let y = Number(now.slice(0, 4))
  let m = Number(now.slice(5, 7))
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    out.unshift({
      key,
      label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      from: `${key}-01`,
      to: `${key}-${String(last).padStart(2, '0')}`,
    })
    m--
    if (m === 0) {
      m = 12
      y--
    }
  }
  return out
}

/* ───────────── Clientes y su cuota ───────────── */

/** Espacios que pagan ellos mismos (no los clientes de una agencia). */
function payerSpaces(spaces: Workspace[]): Workspace[] {
  return spaces.filter((w) => w.plan !== 'trial' && (!w.billingOwnerId || w.billingOwnerId === w.id) && (w.status === 'active' || w.status === 'past_due'))
}

/** Cuota mensual de un espacio según su plan (si Stripe no está disponible). */
export function localMonthly(w: Workspace): number {
  if (w.plan === 'trial') return 0
  if (w.plan === 'agencia') return agencyQuote(w.seats, w.promptPool, w.billingInterval).perMonth
  return monthlyEquivalent(w.plan as Exclude<PaidPlanId, 'agencia'>, w.billingInterval)
}

const ACTIVE = new Set(['active', 'past_due'])

function activeAt(s: SubRow, atSec: number): boolean {
  if (s.status === 'incomplete' || s.status === 'incomplete_expired') return false
  return s.created <= atSec && (s.endedAt === null || s.endedAt > atSec)
}

/* ───────────── Informe ───────────── */

export interface Kpi {
  value: number | null
  prev?: number | null
}

export interface Report {
  p: Period
  live: { stripe: boolean; openrouter: boolean }
  // Ingresos
  mrr: number
  arr: number
  customers: number
  arpa: number
  revenue: Kpi
  invoices: number
  avgTicket: number | null
  refunds: number
  fees: Kpi
  pastDue: { n: number; mrr: number }
  scheduledCancel: { n: number; mrr: number }
  churn: { logo: number | null; revenue: number | null; monthlyLogo: number | null; lost: number; lostMrr: number; base: number }
  mrrMonths: { label: string; mrr: number; added: number; lost: number; customers: number }[]
  planMix: { plan: string; interval: string; n: number; mrr: number }[]
  // Captación
  visitors: Kpi
  pageviews: Kpi
  signups: Kpi
  signupRate: Kpi
  funnel: { label: string; n: number; hint: string }[]
  trialToPaid: { rate: number | null; paid: number; trials: number }
  traffic: { label: string; visitors: number; signups: number; paid: number }[]
  heatVisits: number[][]
  heatSignups: number[][]
  pages: { label: string; n: number }[]
  sources: { label: string; n: number }[]
  countries: { label: string; n: number }[]
  devices: { label: string; n: number }[]
  cohorts: { label: string; signups: number; activated: number; measured: number; paid: number }[]
  retention: { label: string; start: number; cells: (number | null)[] }[]
  // Costes y márgenes
  apiCost: Kpi
  apiCostPaid: number
  apiCostTrial: number
  hosting: number
  profit: number
  margin: number | null
  runRate: { revenue: number; api: number; fees: number; hosting: number; profit: number; margin: number | null }
  ltv: number | null
  ltvCapped: boolean
  cac: number | null
  payback: number | null
  newCustomers: number
  costDays: { label: string; engines: Record<string, number> }[]
  engines: { id: string; answers: number; cost: number; perAnswer: number; errors: number; latency: number }[]
  monthsPnl: { label: string; revenue: number; api: number; fees: number; profit: number }[]
  realVsEstimate: { label: string; real: number | null; estimate: number }[]
  realDaily: { label: string; real: number }[]
  planEconomics: { plan: string; customers: number; mrr: number; apiPerCustomer: number; margin: number | null }[]
  // Uso
  usage: { activeSpaces: number; prompts: number; answers: number; runsOk: number; runsError: number; mentions: number; ideas: number; audits: number; members: number }
  customersTable: CustomerRow[]
}

export interface CustomerRow {
  id: number
  name: string
  domain: string
  owner: string
  plan: string
  interval: string
  status: string
  monthly: number
  api30: number
  margin: number | null
  prompts: number
  promptLimit: number
  lastDay: string | null
  createdAt: string
  trialLeft: number | null
  agencyClient: boolean
}

function count(sql: string, params: (string | number)[] = []): number {
  return one<{ n: number }>(sql, params)?.n ?? 0
}

function sumCost(from: string, to: string, extra = '', params: (string | number)[] = []): number {
  return one<{ c: number }>(`SELECT COALESCE(SUM(costUsd), 0) AS c FROM answers WHERE day BETWEEN ? AND ? ${extra}`, [from, to, ...params])?.c ?? 0
}

const REGION = new Intl.DisplayNames(['es'], { type: 'region' })
const LANG = new Intl.DisplayNames(['es'], { type: 'language' })

export function buildReport(p: Period, ext: { stripe: StripeData | null; openrouter: OpenRouterData | null }): Report {
  const spaces = repo.allWorkspaces()
  const byId = new Map(spaces.map((w) => [w.id, w]))
  const S = ext.stripe
  const hostingMonthly = Number(process.env.PLACTON_HOSTING_USD || 10)

  /* ── Ingresos ── */
  let mrr = 0
  let customers = 0
  let pastDue = { n: 0, mrr: 0 }
  let scheduledCancel = { n: 0, mrr: 0 }
  const planMixMap = new Map<string, { plan: string; interval: string; n: number; mrr: number }>()
  const monthlyBySpace = new Map<number, number>()
  const addMix = (plan: string, interval: string, m: number) => {
    const k = `${plan}:${interval}`
    const cur = planMixMap.get(k) ?? { plan, interval, n: 0, mrr: 0 }
    cur.n++
    cur.mrr += m
    planMixMap.set(k, cur)
  }
  if (S) {
    for (const s of S.subs) {
      if (!ACTIVE.has(s.status)) continue
      mrr += s.monthly
      customers++
      addMix(s.plan, s.interval, s.monthly)
      if (s.workspaceId) monthlyBySpace.set(s.workspaceId, (monthlyBySpace.get(s.workspaceId) ?? 0) + s.monthly)
      if (s.status === 'past_due') pastDue = { n: pastDue.n + 1, mrr: pastDue.mrr + s.monthly }
      if (s.cancelAtPeriodEnd) scheduledCancel = { n: scheduledCancel.n + 1, mrr: scheduledCancel.mrr + s.monthly }
    }
  } else {
    for (const w of payerSpaces(spaces)) {
      const m = localMonthly(w)
      mrr += m
      customers++
      addMix(w.plan, w.billingInterval, m)
      monthlyBySpace.set(w.id, m)
      if (w.status === 'past_due') pastDue = { n: pastDue.n + 1, mrr: pastDue.mrr + m }
      if (w.cancelAtPeriodEnd) scheduledCancel = { n: scheduledCancel.n + 1, mrr: scheduledCancel.mrr + m }
    }
  }
  const arpa = customers ? mrr / customers : 0

  const invIn = (from: number, to: number) => (S ? S.invoices.filter((i) => i.created >= from && i.created <= to) : [])
  const localRevenue = (from: string, to: string) =>
    (one<{ s: number }>("SELECT COALESCE(SUM(amount), 0) AS s FROM billing_events WHERE type = 'invoice.paid' AND createdAt BETWEEN ? AND ?", [`${from}T00:00:00Z`, `${to}T23:59:59Z`])?.s ?? 0) / 100
  const refundsIn = (from: number, to: number) => (S ? S.refunds.filter((r) => r.created >= from && r.created <= to).reduce((a, b) => a + b.amount, 0) : 0)
  const curInv = invIn(p.fromSec, p.toSec)
  const refunds = refundsIn(p.fromSec, p.toSec)
  const revenueNow = S ? curInv.reduce((a, b) => a + b.amount, 0) - refunds : localRevenue(p.from, p.to)
  const revenuePrev = S ? invIn(p.prevFromSec, p.fromSec - 1).reduce((a, b) => a + b.amount, 0) - refundsIn(p.prevFromSec, p.fromSec - 1) : localRevenue(p.prevFrom, p.prevTo)
  const feesIn = (from: string, to: string) => (S ? Object.entries(S.feesByDay).reduce((a, [d, v]) => (inRange(d, from, to) ? a + v : a), 0) : 0)
  // Sin Stripe en vivo, la comisión se estima (≈ 5 % + 0,30 $ por cobro).
  const feesNow = S ? feesIn(p.from, p.to) : revenueNow * 0.05 + 0.3 * customers * (p.days / 30)
  const feesPrev = S ? feesIn(p.prevFrom, p.prevTo) : null

  // Bajas del periodo: suscripciones que terminaron, sobre las activas al empezar.
  let churn: Report['churn'] = { logo: null, revenue: null, monthlyLogo: null, lost: 0, lostMrr: 0, base: 0 }
  if (S) {
    const baseSubs = S.subs.filter((s) => activeAt(s, p.fromSec))
    const lostSubs = S.subs.filter((s) => s.endedAt !== null && s.endedAt >= p.fromSec && s.endedAt <= p.toSec && s.created < p.fromSec)
    const baseMrr = baseSubs.reduce((a, b) => a + b.monthly, 0)
    const lostMrr = lostSubs.reduce((a, b) => a + b.monthly, 0)
    const logo = baseSubs.length ? lostSubs.length / baseSubs.length : null
    churn = {
      logo,
      revenue: baseMrr ? lostMrr / baseMrr : null,
      monthlyLogo: logo === null ? null : 1 - Math.pow(1 - Math.min(logo, 0.999), 30 / p.days),
      lost: lostSubs.length,
      lostMrr,
      base: baseSubs.length,
    }
  }

  const months = lastMonths(12)
  const mrrMonths = months.map((m) => {
    const end = sec(m.to, true)
    const start = sec(m.from)
    if (!S) return { label: m.label, mrr: m.key === monthKey(today()) ? mrr : 0, added: 0, lost: 0, customers: 0 }
    const live = S.subs.filter((s) => activeAt(s, Math.min(end, Math.floor(Date.now() / 1000))))
    return {
      label: m.label,
      mrr: live.reduce((a, b) => a + b.monthly, 0),
      customers: live.length,
      added: S.subs.filter((s) => s.created >= start && s.created <= end && s.status !== 'incomplete_expired').reduce((a, b) => a + b.monthly, 0),
      lost: S.subs.filter((s) => s.endedAt !== null && s.endedAt >= start && s.endedAt <= end).reduce((a, b) => a + b.monthly, 0),
    }
  })

  /* ── Captación ── */
  const visitorsIn = (from: string, to: string) => count('SELECT COUNT(DISTINCT day || visitor) AS n FROM page_views WHERE day BETWEEN ? AND ?', [from, to])
  const viewsIn = (from: string, to: string) => count('SELECT COUNT(*) AS n FROM page_views WHERE day BETWEEN ? AND ?', [from, to])
  const users = all<{ id: number; email: string; createdAt: string }>('SELECT id, email, createdAt FROM users')
  const userDay = new Map(users.map((u) => [u.id, madrid(u.createdAt)]))
  const signupsIn = (from: string, to: string) => users.filter((u) => inRange(userDay.get(u.id)!.day, from, to)).length
  const visitors = { value: visitorsIn(p.from, p.to), prev: visitorsIn(p.prevFrom, p.prevTo) }
  const signups = { value: signupsIn(p.from, p.to), prev: signupsIn(p.prevFrom, p.prevTo) }
  const rate = (a: number | null, b: number | null) => (a !== null && b ? a / b : null)

  // Qué ha hecho cada persona: espacio propio terminado, medido y de pago.
  const owned = all<{ userId: number; workspaceId: number }>("SELECT userId, workspaceId FROM members WHERE role = 'owner'")
  const ownedBy = new Map<number, Workspace[]>()
  for (const o of owned) {
    const w = byId.get(o.workspaceId)
    if (w) ownedBy.set(o.userId, [...(ownedBy.get(o.userId) ?? []), w])
  }
  const measured = new Set(all<{ workspaceId: number }>('SELECT DISTINCT workspaceId FROM answers').map((r) => r.workspaceId))
  const isPaid = (w: Workspace) => w.plan !== 'trial' && !w.billingOwnerId
  const everPaid = new Set(S ? S.subs.filter((s) => s.status !== 'incomplete' && s.status !== 'incomplete_expired').map((s) => s.workspaceId).filter((x): x is number => x !== null) : [])
  const userState = (uid: number) => {
    const ws = ownedBy.get(uid) ?? []
    return {
      activated: ws.some((w) => w.onboarded),
      measured: ws.some((w) => measured.has(w.id)),
      paid: ws.some((w) => isPaid(w) || everPaid.has(w.id)),
    }
  }
  const cohortUsers = users.filter((u) => inRange(userDay.get(u.id)!.day, p.from, p.to))
  const states = cohortUsers.map((u) => userState(u.id))
  const funnel = [
    { label: 'Visitantes', n: visitors.value, hint: 'Visitantes únicos por día en la web pública' },
    { label: 'Se registran', n: cohortUsers.length, hint: 'Cuentas creadas en el periodo' },
    { label: 'Configuran su espacio', n: states.filter((s) => s.activated).length, hint: 'Terminan el alta con su web, prompts y competidores' },
    { label: 'Primera medición', n: states.filter((s) => s.measured).length, hint: 'Ya tienen respuestas medidas' },
    { label: 'Pagan', n: states.filter((s) => s.paid).length, hint: 'Tienen o han tenido una suscripción' },
  ]

  // Prueba → pago: espacios propios terminados cuya prueba ya acabó (o que ya pagan).
  const ownSpaces = spaces.filter((w) => w.onboarded && !w.billingOwnerId)
  const decided = ownSpaces.filter((w) => isPaid(w) || everPaid.has(w.id) || (w.trialEndsAt && new Date(w.trialEndsAt).getTime() < Date.now()))
  const paidOf = decided.filter((w) => isPaid(w) || everPaid.has(w.id)).length
  const trialToPaid = { rate: decided.length ? paidOf / decided.length : null, paid: paidOf, trials: decided.length }

  const bk = buckets(p)
  const visitsByDay = new Map(all<{ day: string; v: number }>('SELECT day, COUNT(DISTINCT visitor) AS v FROM page_views WHERE day BETWEEN ? AND ? GROUP BY day', [p.from, p.to]).map((r) => [r.day, r.v]))
  const paidStart = S ? S.subs.map((s) => madrid(s.created).day) : spaces.filter(isPaid).map((w) => madrid(w.createdAt).day)
  const traffic = bk.map((b) => {
    let v = 0
    for (let d = b.from; d <= b.to; d = addDays(d, 1)) v += visitsByDay.get(d) ?? 0
    return { label: b.label, visitors: v, signups: users.filter((u) => inRange(userDay.get(u.id)!.day, b.from, b.to)).length, paid: paidStart.filter((d) => inRange(d, b.from, b.to)).length }
  })

  const heat = () => Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  const heatVisits = heat()
  for (const r of all<{ h: string; n: number }>('SELECT substr(createdAt, 1, 13) AS h, COUNT(*) AS n FROM page_views WHERE day BETWEEN ? AND ? GROUP BY h', [addDays(p.from, -1), p.to])) {
    const m = madrid(`${r.h}:30:00Z`)
    if (inRange(m.day, p.from, p.to)) heatVisits[m.dow][m.hour] += r.n
  }
  const heatSignups = heat()
  for (const u of users) {
    const m = userDay.get(u.id)!
    if (inRange(m.day, p.from, p.to)) heatSignups[m.dow][m.hour]++
  }

  const pages = all<{ label: string; n: number }>('SELECT path AS label, COUNT(*) AS n FROM page_views WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY n DESC LIMIT 10', [p.from, p.to])
  const sources = all<{ label: string; n: number }>(
    "SELECT CASE WHEN utmSource <> '' THEN 'utm: ' || utmSource WHEN refHost <> '' THEN refHost ELSE 'Directo o sin referente' END AS label, COUNT(DISTINCT day || visitor) AS n FROM page_views WHERE day BETWEEN ? AND ? GROUP BY label ORDER BY n DESC LIMIT 10",
    [p.from, p.to],
  )
  const langRows = all<{ lang: string; n: number }>('SELECT lang, COUNT(DISTINCT day || visitor) AS n FROM page_views WHERE day BETWEEN ? AND ? GROUP BY lang ORDER BY n DESC', [p.from, p.to])
  const countryMap = new Map<string, number>()
  for (const r of langRows) {
    const [l, region] = r.lang.split('-')
    let label = 'Sin dato'
    try {
      label = region ? (REGION.of(region.toUpperCase()) ?? region) : l ? `${LANG.of(l) ?? l} (sin país)` : 'Sin dato'
    } catch {}
    countryMap.set(label, (countryMap.get(label) ?? 0) + r.n)
  }
  const countries = [...countryMap.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 10)
  const DEVICE: Record<string, string> = { movil: 'Móvil', tablet: 'Tableta', ordenador: 'Ordenador', '': 'Sin dato' }
  const devices = all<{ device: string; n: number }>('SELECT device, COUNT(DISTINCT day || visitor) AS n FROM page_views WHERE day BETWEEN ? AND ? GROUP BY device ORDER BY n DESC', [p.from, p.to]).map((r) => ({
    label: DEVICE[r.device] ?? r.device,
    n: r.n,
  }))

  // Cohortes por mes de alta: cuántos llegan a cada paso.
  const cohorts = months
    .map((m) => {
      const us = users.filter((u) => inRange(userDay.get(u.id)!.day, m.from, m.to))
      const st = us.map((u) => userState(u.id))
      return { label: m.label, signups: us.length, activated: st.filter((s) => s.activated).length, measured: st.filter((s) => s.measured).length, paid: st.filter((s) => s.paid).length }
    })
    .filter((c, i, arr) => c.signups > 0 || i === arr.length - 1)

  // Retención de clientes de pago por mes de inicio: % que sigue pagando N meses después.
  const nowSec = Math.floor(Date.now() / 1000)
  const retention = S
    ? months
        .map((m, mi) => {
          const start = S.subs.filter((s) => s.status !== 'incomplete_expired' && s.status !== 'incomplete' && madrid(s.created).day.slice(0, 7) === m.key)
          const cells: (number | null)[] = []
          for (let k = 0; k < 12; k++) {
            const idx = mi + k
            if (idx >= months.length) {
              cells.push(null)
              continue
            }
            const at = Math.min(sec(months[idx].to, true), nowSec)
            cells.push(start.length ? start.filter((s) => activeAt(s, at)).length / start.length : null)
          }
          return { label: m.label, start: start.length, cells }
        })
        .filter((r) => r.start > 0)
    : []

  /* ── Costes ── */
  const paidIds = new Set(spaces.filter((w) => w.plan !== 'trial' || w.billingOwnerId).map((w) => w.id))
  const apiNow = sumCost(p.from, p.to)
  const apiPrev = sumCost(p.prevFrom, p.prevTo)
  const costRows = all<{ workspaceId: number; c: number }>('SELECT workspaceId, SUM(costUsd) AS c FROM answers WHERE day BETWEEN ? AND ? GROUP BY workspaceId', [p.from, p.to])
  const apiCostPaid = costRows.filter((r) => paidIds.has(r.workspaceId)).reduce((a, b) => a + b.c, 0)
  const apiCostTrial = apiNow - apiCostPaid
  const hosting = (hostingMonthly * p.days) / 30
  const profit = revenueNow - apiNow - feesNow - hosting
  const margin = revenueNow > 0 ? profit / revenueNow : null

  const d30 = addDays(today(), -29)
  const cost30 = all<{ workspaceId: number; c: number }>('SELECT workspaceId, SUM(costUsd) AS c FROM answers WHERE day BETWEEN ? AND ? GROUP BY workspaceId', [d30, today()])
  const cost30By = new Map(cost30.map((r) => [r.workspaceId, r.c]))
  const api30Paid = cost30.filter((r) => paidIds.has(r.workspaceId)).reduce((a, b) => a + b.c, 0)
  const fees30 = S ? feesIn(d30, today()) : mrr * 0.05 + customers * 0.3
  // Las cuotas anuales se cobran de golpe: para el mes en curso se usa la cuota
  // mensual equivalente, y la comisión real de 30 días se prorratea igual.
  const runRateFees = S && revenueNow > 0 ? Math.min(fees30, mrr * 0.08 + customers * 0.4) : mrr * 0.05 + customers * 0.3
  const runProfit = mrr - api30Paid - runRateFees - hostingMonthly
  const runRate = { revenue: mrr, api: api30Paid, fees: runRateFees, hosting: hostingMonthly, profit: runProfit, margin: mrr > 0 ? runProfit / mrr : null }

  // Valor de vida: cuota media × margen ÷ bajas mensuales (tope de 36 meses sin bajas).
  const unitMargin = runRate.margin ?? null
  const monthlyChurn = churn.monthlyLogo
  const ltvCapped = !monthlyChurn || monthlyChurn < 1 / 36
  const ltv = arpa && unitMargin !== null ? (arpa * unitMargin) / (ltvCapped ? 1 / 36 : monthlyChurn!) : null
  const newCustomers = S ? S.subs.filter((s) => s.created >= p.fromSec && s.created <= p.toSec && s.status !== 'incomplete_expired' && s.status !== 'incomplete').length : 0
  // Coste de captar un cliente: lo que costaron las pruebas gratis del periodo (más adelante, también anuncios).
  const ads = Number(process.env.PLACTON_ADS_USD_MONTH || 0) * (p.days / 30)
  const cac = newCustomers ? (apiCostTrial + ads) / newCustomers : null
  const payback = cac !== null && arpa && unitMargin ? cac / (arpa * unitMargin) : null

  const engineDay = all<{ day: string; engine: string; c: number }>('SELECT day, engine, SUM(costUsd) AS c FROM answers WHERE day BETWEEN ? AND ? GROUP BY day, engine', [p.from, p.to])
  const costDays = bk.map((b) => {
    const engines: Record<string, number> = {}
    for (const r of engineDay) if (inRange(r.day, b.from, b.to)) engines[r.engine] = (engines[r.engine] ?? 0) + r.c
    return { label: b.label, engines }
  })
  const engines = all<{ id: string; answers: number; cost: number; errors: number; latency: number }>(
    'SELECT engine AS id, COUNT(*) AS answers, COALESCE(SUM(costUsd), 0) AS cost, SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors, AVG(latencyMs) AS latency FROM answers WHERE day BETWEEN ? AND ? GROUP BY engine ORDER BY cost DESC',
    [p.from, p.to],
  ).map((e) => ({ ...e, perAnswer: e.answers ? e.cost / e.answers : 0 }))

  const monthsPnl = months.map((m) => {
    const revenue = S ? S.invoices.filter((i) => madrid(i.created).day.slice(0, 7) === m.key).reduce((a, b) => a + b.amount, 0) : localRevenue(m.from, m.to)
    const api = sumCost(m.from, m.to)
    const fees = S ? feesIn(m.from, m.to) : revenue * 0.05
    return { label: m.label, revenue, api, fees, profit: revenue - api - fees - hostingMonthly }
  })

  // Gasto real de OpenRouter (esta clave) frente a lo que estimamos por respuesta.
  const OR_ENGINES = "AND engine <> 'google'"
  const now = new Date()
  const utcDay = now.toISOString().slice(0, 10)
  const utcMonday = (() => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d.toISOString().slice(0, 10)
  })()
  const utcMonth = `${utcDay.slice(0, 7)}-01`
  const OR = ext.openrouter
  const realVsEstimate = [
    { label: 'Hoy (UTC)', real: OR?.today ?? null, estimate: sumCost(utcDay, utcDay, OR_ENGINES) },
    { label: 'Esta semana', real: OR?.week ?? null, estimate: sumCost(utcMonday, utcDay, OR_ENGINES) },
    { label: 'Este mes', real: OR?.month ?? null, estimate: sumCost(utcMonth, utcDay, OR_ENGINES) },
  ]
  const snaps = all<{ day: string; value: number }>("SELECT day, value FROM cost_snapshots WHERE source = 'openrouter' AND day BETWEEN ? AND ? ORDER BY day", [addDays(p.from, -1), p.to])
  const realDaily: { label: string; real: number }[] = []
  for (let i = 1; i < snaps.length; i++) {
    if (snaps[i].day !== addDays(snaps[i - 1].day, 1)) continue
    realDaily.push({ label: new Date(`${snaps[i].day}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }), real: Math.max(0, snaps[i].value - snaps[i - 1].value) })
  }

  const planEconomics = [...planMixMap.values()]
    .reduce<{ plan: string; customers: number; mrr: number; api: number }[]>((acc, m) => {
      const cur = acc.find((x) => x.plan === m.plan) ?? (acc.push({ plan: m.plan, customers: 0, mrr: 0, api: 0 }), acc[acc.length - 1])
      cur.customers += m.n
      cur.mrr += m.mrr
      return acc
    }, [])
    .map((x) => {
      const payers = payerSpaces(spaces).filter((w) => w.plan === x.plan)
      // En la agencia, el coste incluye el de todos sus clientes.
      const api = payers.reduce((a, w) => a + (cost30By.get(w.id) ?? 0) + (w.plan === 'agencia' ? repo.agencyClients(w.id).reduce((s, c) => s + (cost30By.get(c.id) ?? 0), 0) : 0), 0)
      const feesShare = x.mrr * 0.05 + x.customers * 0.3
      return { plan: x.plan, customers: x.customers, mrr: x.mrr, apiPerCustomer: x.customers ? api / x.customers : 0, margin: x.mrr ? (x.mrr - api - feesShare) / x.mrr : null }
    })
    .sort((a, b) => b.mrr - a.mrr)

  /* ── Uso ── */
  const usage = {
    activeSpaces: count('SELECT COUNT(DISTINCT workspaceId) AS n FROM runs WHERE day >= ?', [addDays(today(), -8)]),
    prompts: count('SELECT COUNT(*) AS n FROM prompts WHERE active = 1'),
    answers: count('SELECT COUNT(*) AS n FROM answers WHERE day BETWEEN ? AND ?', [p.from, p.to]),
    runsOk: count("SELECT COUNT(*) AS n FROM runs WHERE day BETWEEN ? AND ? AND status = 'ok'", [p.from, p.to]),
    runsError: count("SELECT COUNT(*) AS n FROM runs WHERE day BETWEEN ? AND ? AND status = 'error'", [p.from, p.to]),
    mentions: count('SELECT COUNT(*) AS n FROM mentions WHERE day BETWEEN ? AND ?', [p.from, p.to]),
    ideas: count('SELECT COUNT(*) AS n FROM insights WHERE createdAt >= ?', [`${p.from}T00:00:00Z`]),
    audits: count('SELECT COUNT(*) AS n FROM audits WHERE createdAt >= ?', [`${p.from}T00:00:00Z`]),
    members: count("SELECT COUNT(*) AS n FROM members WHERE role <> 'owner'"),
  }

  /* ── Clientes ── */
  const ownerEmail = new Map(all<{ workspaceId: number; email: string }>("SELECT m.workspaceId, u.email FROM members m JOIN users u ON u.id = m.userId WHERE m.role = 'owner'").map((r) => [r.workspaceId, r.email]))
  const promptCount = new Map(all<{ workspaceId: number; n: number }>('SELECT workspaceId, COUNT(*) AS n FROM prompts WHERE active = 1 GROUP BY workspaceId').map((r) => [r.workspaceId, r.n]))
  const customersTable: CustomerRow[] = spaces
    .filter((w) => w.onboarded)
    .map((w) => {
      const monthly = monthlyBySpace.get(w.id) ?? (S ? 0 : localMonthly(w))
      const api30 = cost30By.get(w.id) ?? 0
      const trial = w.plan === 'trial'
      return {
        id: w.id,
        name: w.name,
        domain: w.domain,
        owner: ownerEmail.get(w.id) ?? '',
        plan: w.plan,
        interval: w.billingInterval,
        status: trial ? (repo.accessOf(w).ok ? 'prueba' : 'prueba terminada') : w.status,
        monthly,
        api30,
        margin: monthly > 0 ? (monthly - api30 - (monthly * 0.05 + 0.3)) / monthly : null,
        prompts: promptCount.get(w.id) ?? 0,
        promptLimit: repo.promptLimit(w),
        lastDay: w.lastTrackedDay,
        createdAt: w.createdAt,
        trialLeft: trial ? repo.trialDaysLeft(w) : null,
        agencyClient: Boolean(w.billingOwnerId && w.billingOwnerId !== w.id),
      }
    })
    .sort((a, b) => b.monthly - a.monthly || b.createdAt.localeCompare(a.createdAt))

  const signupRateNow = rate(signups.value, visitors.value)
  const signupRatePrev = rate(signups.prev, visitors.prev)

  return {
    p,
    live: { stripe: Boolean(S), openrouter: Boolean(OR) },
    mrr,
    arr: mrr * 12,
    customers,
    arpa,
    revenue: { value: revenueNow, prev: revenuePrev },
    invoices: curInv.length,
    avgTicket: curInv.length ? curInv.reduce((a, b) => a + b.amount, 0) / curInv.length : null,
    refunds,
    fees: { value: feesNow, prev: feesPrev },
    pastDue,
    scheduledCancel,
    churn,
    mrrMonths,
    planMix: [...planMixMap.values()].sort((a, b) => b.mrr - a.mrr),
    visitors,
    pageviews: { value: viewsIn(p.from, p.to), prev: viewsIn(p.prevFrom, p.prevTo) },
    signups,
    signupRate: { value: signupRateNow, prev: signupRatePrev },
    funnel,
    trialToPaid,
    traffic,
    heatVisits,
    heatSignups,
    pages,
    sources,
    countries,
    devices,
    cohorts,
    retention,
    apiCost: { value: apiNow, prev: apiPrev },
    apiCostPaid,
    apiCostTrial,
    hosting,
    profit,
    margin,
    runRate,
    ltv,
    ltvCapped,
    cac,
    payback,
    newCustomers,
    costDays,
    engines,
    monthsPnl,
    realVsEstimate,
    realDaily,
    planEconomics,
    usage,
    customersTable,
  }
}

/** Nombre del plan para el panel (en español). */
export function planLabel(plan: string): string {
  if (plan === 'trial') return 'Prueba'
  return isPaidPlan(plan) ? planName(plan, 'es') : plan
}
