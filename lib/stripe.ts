import 'server-only'
import Stripe from 'stripe'
import { nowIso, one, run } from './db'
import { AGENCY_CLIENT_MONTHLY, AGENCY_PROMPT_TIERS, CURRENCY, PLANS, YEARLY_DISCOUNT, clampClients, clampPrompts, isPaidPlan, priceFor, type Interval, type PaidPlanId } from './plans'
import * as repo from './repo'
import type { SubStatus, User, Workspace } from './types'

// Pasarela de pago. Los productos y precios se crean solos en Stripe la primera
// vez (con lookup_key estable), así que basta con poner la clave secreta.
// La suscripción es por espacio de trabajo, no por persona.

let client: Stripe | null = null

export function stripeReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Falta STRIPE_SECRET_KEY')
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: 'Placton' } })
  return client
}

export function stripeMode(): 'test' | 'live' | 'off' {
  const k = process.env.STRIPE_SECRET_KEY ?? ''
  if (!k) return 'off'
  return k.startsWith('sk_live') || k.startsWith('rk_live') ? 'live' : 'test'
}

const lookupKey = (plan: PaidPlanId, interval: Interval) => `placton_${plan}_${interval}_${CURRENCY}`

const priceCache = new Map<string, string>()

/** Devuelve el id del precio; si no existe en Stripe, crea producto y precio. */
export async function ensurePrice(plan: PaidPlanId, interval: Interval): Promise<string> {
  // Precios creados a mano en el panel de Stripe (p. ej. STRIPE_PRICE_INICIAL_MONTH):
  // mandan sobre los que la app crea sola con lookup_key.
  const fixed = process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`]
  if (fixed) return fixed
  const lk = lookupKey(plan, interval)
  const cached = priceCache.get(lk)
  if (cached) return cached
  const s = stripe()
  const found = await s.prices.list({ lookup_keys: [lk], active: true, limit: 1 })
  if (found.data[0]) {
    priceCache.set(lk, found.data[0].id)
    return found.data[0].id
  }
  const productId = `placton_${plan}`
  let product: Stripe.Product
  try {
    product = await s.products.retrieve(productId)
  } catch {
    product = await s.products.create({
      id: productId,
      name: `Placton ${PLANS[plan].name}`,
      description: plan === 'agencia' ? 'Per client brand tracked' : `${PLANS[plan].prompts} prompts tracked weekly`,
      metadata: { plan },
    })
  }
  const yearly = (m: number) => Math.round(m * 12 * (1 - YEARLY_DISCOUNT) * 100) / 100
  const price = await s.prices.create({
    product: product.id,
    currency: CURRENCY,
    unit_amount: Math.round((plan === 'agencia' ? (interval === 'year' ? yearly(AGENCY_CLIENT_MONTHLY) : AGENCY_CLIENT_MONTHLY) : priceFor(plan, interval)) * 100),
    recurring: { interval },
    lookup_key: lk,
    tax_behavior: 'exclusive',
    metadata: { plan, interval },
  })
  priceCache.set(lk, price.id)
  return price.id
}

/** Agencia: precio por prompt medido cada semana, con tramos de volumen. */
export async function ensureAgencyPromptPrice(interval: Interval): Promise<string> {
  const lk = `placton_agencia_prompts_${interval}_${CURRENCY}`
  const cached = priceCache.get(lk)
  if (cached) return cached
  const s = stripe()
  const found = await s.prices.list({ lookup_keys: [lk], active: true, limit: 1 })
  if (found.data[0]) {
    priceCache.set(lk, found.data[0].id)
    return found.data[0].id
  }
  const productId = 'placton_agencia_prompts'
  let product: Stripe.Product
  try {
    product = await s.products.retrieve(productId)
  } catch {
    product = await s.products.create({ id: productId, name: 'Placton Agency prompts', description: 'Prompts tracked weekly, shared across client brands', metadata: { plan: 'agencia' } })
  }
  const yearly = (m: number) => Math.round(m * 12 * (1 - YEARLY_DISCOUNT) * 100)
  const price = await s.prices.create({
    product: product.id,
    currency: CURRENCY,
    billing_scheme: 'tiered',
    tiers_mode: 'volume',
    tiers: AGENCY_PROMPT_TIERS.map((t) => ({
      up_to: t.upTo ?? 'inf',
      unit_amount: interval === 'year' ? yearly(t.monthly) : Math.round(t.monthly * 100),
    })),
    recurring: { interval, usage_type: 'licensed' },
    lookup_key: lk,
    tax_behavior: 'exclusive',
    metadata: { plan: 'agencia', part: 'prompts', interval },
  })
  priceCache.set(lk, price.id)
  return price.id
}

const isPromptItem = (item: Stripe.SubscriptionItem) => (item.price?.lookup_key ?? '').startsWith('placton_agencia_prompts_')

async function ensureCustomer(ws: Workspace, user: User): Promise<string> {
  if (ws.stripeCustomerId) return ws.stripeCustomerId
  const customer = await stripe().customers.create({
    email: user.email,
    name: ws.brandName || ws.name,
    preferred_locales: ['en', 'es'],
    metadata: { workspaceId: String(ws.id) },
  })
  repo.updateWorkspace(ws.id, { stripeCustomerId: customer.id })
  return customer.id
}

export type CheckoutResult = { url: string } | { changed: true } | { error: string }

/**
 * Contratar o cambiar de plan. Sin suscripción viva abre el Checkout de Stripe;
 * con suscripción viva cambia el precio con prorrateo, sin pasar otra vez por caja.
 */
export async function checkout(ws: Workspace, user: User, plan: PaidPlanId, interval: Interval, origin: string, clients = 1, prompts = 0): Promise<CheckoutResult> {
  if (!stripeReady()) return { error: 'Los pagos no están configurados todavía.' }
  const price = await ensurePrice(plan, interval)
  const s = stripe()
  const agency = plan === 'agencia'
  const quantity = agency ? clampClients(clients) : 1
  const promptQty = agency ? clampPrompts(prompts) : 0
  const promptPrice = agency ? await ensureAgencyPromptPrice(interval) : null
  if (agency && quantity < repo.agencyClients(ws.id).length) {
    return { error: 'Tienes más clientes creados que los que eliges. Borra alguno o elige más.' }
  }
  if (agency && promptQty < repo.agencyPromptsUsed(ws.id)) {
    return { error: 'Tus clientes ya tienen más prompts activos que esa bolsa. Pausa algunos o elige más.' }
  }

  if (ws.stripeSubscriptionId && (ws.status === 'active' || ws.status === 'past_due')) {
    const sub = await s.subscriptions.retrieve(ws.stripeSubscriptionId)
    if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
      const main = sub.items.data.find((i) => !isPromptItem(i)) ?? sub.items.data[0]
      const promptItem = sub.items.data.find(isPromptItem)
      const items: Stripe.SubscriptionUpdateParams.Item[] = [{ id: main.id, price, quantity }]
      if (agency && promptPrice) items.push(promptItem ? { id: promptItem.id, price: promptPrice, quantity: promptQty } : { price: promptPrice, quantity: promptQty })
      else if (promptItem) items.push({ id: promptItem.id, deleted: true })
      const updated = await s.subscriptions.update(sub.id, {
        items,
        proration_behavior: 'create_prorations',
        cancel_at_period_end: false,
        metadata: { workspaceId: String(ws.id), plan, interval },
      })
      syncSubscription(updated)
      return { changed: true }
    }
  }

  const customer = await ensureCustomer(ws, user)
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: String(ws.id),
    line_items: promptPrice ? [{ price, quantity }, { price: promptPrice, quantity: promptQty }] : [{ price, quantity }],
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { name: 'auto', address: 'auto' },
    locale: 'auto',
    subscription_data: { metadata: { workspaceId: String(ws.id), plan, interval } },
    metadata: { workspaceId: String(ws.id), plan, interval, clients: String(quantity), prompts: String(promptQty) },
    success_url: `${origin}/dashboard/settings/billing?pago={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/plans?cancelado=1`,
  })
  if (!session.url) return { error: 'Stripe no devolvió la página de pago.' }
  return { url: session.url }
}

/** Agencia: cambia clientes y bolsa de prompts (prorrateado en la próxima factura). */
export async function setAgency(ws: Workspace, clients: number, prompts: number): Promise<{ ok: true } | { error: string }> {
  if (ws.plan !== 'agencia' || !ws.stripeSubscriptionId) return { error: 'Este espacio no tiene un plan Agencia activo.' }
  const quantity = clampClients(clients)
  const promptQty = clampPrompts(prompts)
  if (quantity < repo.agencyClients(ws.id).length) return { error: 'Tienes más clientes creados que ese número. Borra alguno antes.' }
  if (promptQty < repo.agencyPromptsUsed(ws.id)) return { error: 'Tus clientes tienen más prompts activos que esa bolsa. Pausa algunos antes.' }
  const s = stripe()
  const sub = await s.subscriptions.retrieve(ws.stripeSubscriptionId)
  const main = sub.items.data.find((i) => !isPromptItem(i)) ?? sub.items.data[0]
  const promptItem = sub.items.data.find(isPromptItem)
  const promptPrice = await ensureAgencyPromptPrice(ws.billingInterval)
  const updated = await s.subscriptions.update(sub.id, {
    items: [{ id: main.id, quantity }, promptItem ? { id: promptItem.id, quantity: promptQty } : { price: promptPrice, quantity: promptQty }],
    proration_behavior: 'create_prorations',
  })
  syncSubscription(updated)
  return { ok: true }
}

/** Portal de cliente de Stripe: tarjeta, facturas y baja. */
export async function portal(ws: Workspace, origin: string): Promise<{ url: string } | { error: string }> {
  if (!stripeReady()) return { error: 'Los pagos no están configurados todavía.' }
  if (!ws.stripeCustomerId) return { error: 'Este espacio todavía no tiene datos de facturación.' }
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: ws.stripeCustomerId,
      return_url: `${origin}/dashboard/settings/billing`,
      locale: 'auto',
    })
    return { url: session.url }
  } catch (err) {
    console.error('[placton] portal', err)
    return { error: 'No se pudo abrir el portal de facturación. Si persiste, escríbenos.' }
  }
}

export async function cancelAtPeriodEnd(ws: Workspace, cancel: boolean): Promise<{ ok: true } | { error: string }> {
  if (!ws.stripeSubscriptionId) return { error: 'No hay suscripción que cancelar.' }
  const sub = await stripe().subscriptions.update(ws.stripeSubscriptionId, { cancel_at_period_end: cancel })
  syncSubscription(sub)
  return { ok: true }
}

export async function cancelImmediately(subscriptionId: string) {
  if (!stripeReady()) return
  try {
    await stripe().subscriptions.cancel(subscriptionId)
  } catch (err) {
    console.error('[placton] cancelar suscripción', subscriptionId, err)
  }
}

function mapStatus(s: Stripe.Subscription.Status): SubStatus | null {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return null // incomplete / paused: no tocamos el estado hasta que se resuelva
  }
}

/** Vuelca una suscripción de Stripe sobre su espacio. Idempotente. */
export function syncSubscription(sub: Stripe.Subscription): Workspace | null {
  const wsId = Number(sub.metadata?.workspaceId)
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const ws = (wsId && repo.workspaceById(wsId)) || repo.workspaceBySubscription(sub.id) || repo.workspaceByCustomer(customerId)
  if (!ws) return null

  // Una suscripción vieja cancelada no debe pisar a la nueva.
  if (ws.stripeSubscriptionId && ws.stripeSubscriptionId !== sub.id && mapStatus(sub.status) === 'canceled') return ws

  const item = sub.items.data.find((i) => !isPromptItem(i)) ?? sub.items.data[0]
  const promptItem = sub.items.data.find(isPromptItem)
  const lk = item?.price?.lookup_key ?? ''
  const fromLookup = lk.match(/^placton_([a-z]+)_(month|year)(?:_[a-z]{3})?$/)
  // Precios fijados por variable de entorno (creados en el panel de Stripe, sin lookup_key)
  const fromEnv = Object.entries(process.env)
    .find(([k, v]) => k.startsWith('STRIPE_PRICE_') && v && v === item?.price?.id)?.[0]
    .split('_')[2]
    ?.toLowerCase()
  const plan = (sub.metadata?.plan && isPaidPlan(sub.metadata.plan) ? sub.metadata.plan : (fromLookup?.[1] ?? fromEnv)) ?? ws.plan
  const interval = (item?.price?.recurring?.interval === 'year' ? 'year' : 'month') as Interval
  const status = mapStatus(sub.status)
  if (!status) return ws

  repo.updateWorkspace(ws.id, {
    plan: isPaidPlan(plan) ? plan : ws.plan,
    billingInterval: interval,
    status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : ws.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    seats: plan === 'agencia' ? Math.max(1, item?.quantity ?? 1) : 1,
    promptPool: plan === 'agencia' ? Math.max(0, promptItem?.quantity ?? 0) : 0,
  })
  return repo.workspaceById(ws.id)
}

/** Al volver del Checkout no esperamos al webhook: leemos la sesión y aplicamos. */
export async function confirmCheckout(sessionId: string, workspaceId: number): Promise<boolean> {
  if (!stripeReady()) return false
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
    if (String(session.client_reference_id) !== String(workspaceId)) return false
    const sub = session.subscription
    if (sub && typeof sub !== 'string') {
      syncSubscription(sub)
      return true
    }
  } catch (err) {
    console.error('[placton] confirmar checkout', err)
  }
  return false
}

export async function handleWebhook(rawBody: string, signature: string | null): Promise<{ ok: boolean; status: number; message: string }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !signature) return { ok: false, status: 400, message: 'Falta la firma' }
  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret)
  } catch {
    return { ok: false, status: 400, message: 'Firma no válida' }
  }

  // Idempotencia: Stripe reintenta; cada evento se procesa una vez.
  if (one('SELECT id FROM billing_events WHERE id = ?', [event.id])) return { ok: true, status: 200, message: 'repetido' }

  let workspaceId: number | null = null
  let amount = 0
  let currency = 'eur'
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.subscription) {
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        const sub = await stripe().subscriptions.retrieve(subId)
        workspaceId = syncSubscription(sub)?.id ?? null
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      workspaceId = syncSubscription(event.data.object)?.id ?? null
      break
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const inv = event.data.object
      const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
      const ws = customerId ? repo.workspaceByCustomer(customerId) : null
      workspaceId = ws?.id ?? null
      amount = event.type === 'invoice.paid' ? inv.amount_paid : 0
      currency = inv.currency
      if (ws && event.type === 'invoice.payment_failed') repo.updateWorkspace(ws.id, { status: 'past_due' })
      break
    }
  }
  run('INSERT OR IGNORE INTO billing_events (id, type, workspaceId, amount, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    event.id,
    event.type,
    workspaceId,
    amount,
    currency,
    nowIso(),
  ])
  return { ok: true, status: 200, message: 'ok' }
}
