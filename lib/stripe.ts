import 'server-only'
import Stripe from 'stripe'
import { nowIso, one, run } from './db'
import { AGENCY_CLIENT_MONTHLY, AGENCY_PROMPT_TIERS, CURRENCY, PLANS, YEARLY_DISCOUNT, agencyQuote, clampClients, clampPrompts, isPaidPlan, monthlyEquivalent, priceFor, type Interval, type PaidPlanId } from './plans'
import { reportError } from './monitor'
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
  // Precio por tramos (graduated): cada tramo a su precio, sin saltos al cambiar de tramo.
  const lk = `placton_agencia_prompts_grad_${interval}_${CURRENCY}`
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
    tiers_mode: 'graduated',
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

/**
 * Datos del emisor en todas las facturas (Reglamento de facturación, RD 1619/2012):
 * razón social, NIF y domicilio, y la mención para clientes de fuera de España.
 * El IVA lo calcula Stripe Tax según el país y el NIF-IVA del cliente.
 */
const INVOICE_SETTINGS: Stripe.CustomerCreateParams.InvoiceSettings = {
  custom_fields: [
    { name: 'Emisor / Issuer', value: 'SELSPY AGENCY S. COOP.' },
    { name: 'NIF / Tax ID', value: 'F75988824' },
  ],
  footer:
    'SELSPY AGENCY S. COOP. · NIF F75988824 · Paseo la Fuente, 9, 4.º A, 30007 Murcia (España) · contact@placton.tech\n' +
    'Empresas de otros países de la UE con NIF-IVA: inversión del sujeto pasivo. Clientes de fuera de la UE: operación no sujeta al IVA español (art. 69 Ley 37/1992).\n' +
    'EU business customers with a VAT number: reverse charge. Customers outside the EU: not subject to Spanish VAT (art. 69 Law 37/1992).',
}

/** Stripe Tax calcula el IVA (se apaga con PLACTON_STRIPE_TAX=0). */
const autoTax = () => process.env.PLACTON_STRIPE_TAX !== '0'

async function ensureCustomer(ws: Workspace, user: User): Promise<string> {
  if (ws.stripeCustomerId) {
    // Clientes creados antes: se les ponen los datos fiscales del emisor.
    await stripe().customers.update(ws.stripeCustomerId, { invoice_settings: INVOICE_SETTINGS }).catch(() => null)
    return ws.stripeCustomerId
  }
  const customer = await stripe().customers.create({
    email: user.email,
    name: ws.brandName || ws.name,
    preferred_locales: ['en', 'es'],
    invoice_settings: INVOICE_SETTINGS,
    metadata: { workspaceId: String(ws.id) },
  })
  repo.updateWorkspace(ws.id, { stripeCustomerId: customer.id })
  return customer.id
}

/** NIF de la empresa en las facturas siguientes de una suscripción (identificador fiscal de la cuenta). */
async function attachAccountTaxId(subId: string) {
  const id = process.env.STRIPE_ACCOUNT_TAX_ID
  if (!id) return
  await stripe()
    .subscriptions.update(subId, { invoice_settings: { account_tax_ids: [id] } })
    .catch((err) => console.error('[placton] NIF en la suscripción', err))
}

/** Facturas de un espacio, para descargarlas desde Suscripción. */
export async function listInvoices(ws: Workspace): Promise<{ id: string; number: string; date: number; total: number; currency: string; status: string; pdf: string | null; url: string | null }[]> {
  if (!stripeReady() || !ws.stripeCustomerId) return []
  try {
    const list = await stripe().invoices.list({ customer: ws.stripeCustomerId, limit: 24 })
    return list.data
      .filter((i) => i.status !== 'draft')
      .map((i) => ({
        id: i.id ?? '',
        number: i.number ?? '',
        date: i.status_transitions?.finalized_at ?? i.created,
        total: i.total / 100,
        currency: i.currency,
        status: i.status ?? '',
        pdf: i.invoice_pdf ?? null,
        url: i.hosted_invoice_url ?? null,
      }))
  } catch (err) {
    console.error('[placton] facturas', err)
    return []
  }
}

export type CheckoutResult = { url: string } | { changed: true } | { error: string }

/** Cuota mensual equivalente de un plan, para saber si un cambio es subida o bajada. */
function monthlyFor(plan: PaidPlanId, interval: Interval, clients: number, prompts: number): number {
  if (plan === 'agencia') return agencyQuote(clients, prompts, interval).perMonth
  return monthlyEquivalent(plan, interval)
}

const LIVE_STATUSES: Stripe.Subscription.Status[] = ['active', 'past_due', 'trialing', 'unpaid']

/**
 * La suscripción viva del espacio, aunque la base de datos aún no la conozca
 * (webhook retrasado, dos pestañas, botón atrás): así nunca se abre un segundo
 * Checkout que acabaría en dos suscripciones cobrando a la vez.
 */
async function liveSubscription(ws: Workspace): Promise<Stripe.Subscription | null> {
  const s = stripe()
  if (ws.stripeSubscriptionId) {
    const sub = await s.subscriptions.retrieve(ws.stripeSubscriptionId).catch(() => null)
    if (sub && LIVE_STATUSES.includes(sub.status)) return sub
  }
  if (ws.stripeCustomerId) {
    const list = await s.subscriptions.list({ customer: ws.stripeCustomerId, status: 'all', limit: 20 })
    const sub = list.data.find((x) => LIVE_STATUSES.includes(x.status) && (!x.metadata?.workspaceId || Number(x.metadata.workspaceId) === ws.id))
    if (sub) return sub
  }
  return null
}

/** Mensaje claro cuando Stripe no puede cobrar un cambio (tarjeta rechazada, etc.). */
function chargeError(err: unknown): { error: string } {
  console.error('[placton] cambio de plan', err)
  const e = err as { type?: string; code?: string }
  if (e?.type === 'StripeCardError' || e?.code === 'card_declined' || e?.code === 'payment_intent_payment_attempt_failed')
    return { error: 'No se ha podido cobrar la diferencia. Revisa tu tarjeta en «Facturas y método de pago» y vuelve a intentarlo.' }
  return { error: 'No se ha podido cambiar el plan ahora mismo. Inténtalo de nuevo en unos minutos o escríbenos.' }
}

/**
 * Contratar o cambiar de plan. Sin suscripción viva abre el Checkout de Stripe;
 * con suscripción viva cambia el precio sin pasar otra vez por caja. Las subidas
 * se cobran al momento (prorrateadas) y solo se aplican si el cobro sale bien;
 * las bajadas dejan el saldo a favor en la próxima factura.
 */
export async function checkout(ws: Workspace, user: User, plan: PaidPlanId, interval: Interval, origin: string, clients = 1, prompts = 0): Promise<CheckoutResult> {
  if (!stripeReady()) return { error: 'Los pagos no están configurados todavía.' }
  const price = await ensurePrice(plan, interval)
  const s = stripe()
  const agency = plan === 'agencia'
  const quantity = agency ? clampClients(clients) : 1
  const promptQty = agency ? clampPrompts(prompts) : 0
  const promptPrice = agency ? await ensureAgencyPromptPrice(interval) : null
  const clientCount = repo.agencyClients(ws.id).length
  if (agency && quantity < clientCount) {
    return { error: 'Tienes más clientes creados que los que eliges. Borra alguno o elige más.' }
  }
  if (agency && promptQty < repo.agencyPromptsUsed(ws.id)) {
    return { error: 'Tus clientes ya tienen más prompts activos que esa bolsa. Pausa algunos o elige más.' }
  }
  // Una agencia con clientes no puede pasarse a un plan normal: se quedarían sin plan.
  if (!agency && ws.plan === 'agencia' && clientCount > 1) {
    return { error: 'Tienes marcas cliente en tu plan Agencia. Bórralas antes de cambiar a otro plan.' }
  }

  const sub = await liveSubscription(ws)
  if (sub) {
    const main = sub.items.data.find((i) => !isPromptItem(i)) ?? sub.items.data[0]
    const promptItem = sub.items.data.find(isPromptItem)
    const items: Stripe.SubscriptionUpdateParams.Item[] = [{ id: main.id, price, quantity }]
    if (agency && promptPrice) items.push(promptItem ? { id: promptItem.id, price: promptPrice, quantity: promptQty } : { price: promptPrice, quantity: promptQty })
    else if (promptItem) items.push({ id: promptItem.id, deleted: true })
    const before = isPaidPlan(ws.plan) ? monthlyFor(ws.plan, ws.billingInterval, ws.seats, ws.promptPool) : 0
    const upgrade = monthlyFor(plan, interval, quantity, promptQty) > before + 0.005 || (interval === 'year' && ws.billingInterval === 'month')
    try {
      const updated = await s.subscriptions.update(sub.id, {
        items,
        proration_behavior: upgrade ? 'always_invoice' : 'create_prorations',
        ...(upgrade ? { payment_behavior: 'error_if_incomplete' as const } : {}),
        cancel_at_period_end: false,
        automatic_tax: { enabled: autoTax() },
        metadata: { workspaceId: String(ws.id), plan, interval },
      })
      syncSubscription(updated)
      return { changed: true }
    } catch (err) {
      return chargeError(err)
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
    automatic_tax: { enabled: autoTax() },
    // Una sesión olvidada en otra pestaña caduca pronto.
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    locale: 'auto',
    subscription_data: { metadata: { workspaceId: String(ws.id), plan, interval } },
    metadata: { workspaceId: String(ws.id), plan, interval, clients: String(quantity), prompts: String(promptQty) },
    success_url: `${origin}/dashboard/settings/billing?pago={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/plans?cancelado=1`,
  })
  if (!session.url) return { error: 'Stripe no devolvió la página de pago.' }
  return { url: session.url }
}

/** Agencia: cambia clientes y bolsa de prompts (las subidas se cobran al momento). */
export async function setAgency(ws: Workspace, clients: number, prompts: number): Promise<{ ok: true } | { error: string }> {
  if (ws.plan !== 'agencia' || !ws.stripeSubscriptionId) return { error: 'Este espacio no tiene un plan Agencia activo.' }
  const quantity = clampClients(clients)
  const promptQty = clampPrompts(prompts)
  if (quantity < repo.agencyClients(ws.id).length) return { error: 'Tienes más clientes creados que ese número. Borra alguno antes.' }
  if (promptQty < repo.agencyPromptsUsed(ws.id)) return { error: 'Tus clientes tienen más prompts activos que esa bolsa. Pausa algunos antes.' }
  const s = stripe()
  const sub = await liveSubscription(ws)
  if (!sub) return { error: 'Tu suscripción Agencia no está activa. Elige el plan de nuevo para reactivarla.' }
  const main = sub.items.data.find((i) => !isPromptItem(i)) ?? sub.items.data[0]
  const promptItem = sub.items.data.find(isPromptItem)
  const promptPrice = await ensureAgencyPromptPrice(ws.billingInterval)
  const upgrade = monthlyFor('agencia', ws.billingInterval, quantity, promptQty) > monthlyFor('agencia', ws.billingInterval, ws.seats, ws.promptPool) + 0.005
  try {
    const updated = await s.subscriptions.update(sub.id, {
      items: [{ id: main.id, quantity }, promptItem ? { id: promptItem.id, quantity: promptQty } : { price: promptPrice, quantity: promptQty }],
      proration_behavior: upgrade ? 'always_invoice' : 'create_prorations',
      ...(upgrade ? { payment_behavior: 'error_if_incomplete' as const } : {}),
      automatic_tax: { enabled: autoTax() },
    })
    syncSubscription(updated)
    return { ok: true }
  } catch (err) {
    return chargeError(err)
  }
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
      // Configuración del portal creada por API (en producción no hay una «por defecto»).
      ...(process.env.STRIPE_PORTAL_CONFIG ? { configuration: process.env.STRIPE_PORTAL_CONFIG } : {}),
    })
    return { url: session.url }
  } catch (err) {
    console.error('[placton] portal', err)
    return { error: 'No se pudo abrir el portal de facturación. Si persiste, escríbenos.' }
  }
}

export async function cancelAtPeriodEnd(ws: Workspace, cancel: boolean): Promise<{ ok: true } | { error: string }> {
  if (!ws.stripeSubscriptionId) return { error: 'No hay suscripción que cancelar.' }
  try {
    const sub = await stripe().subscriptions.update(ws.stripeSubscriptionId, { cancel_at_period_end: cancel })
    syncSubscription(sub)
    return { ok: true }
  } catch (err) {
    console.error('[placton] cancelar al final del periodo', err)
    return { error: 'No se ha podido cambiar la renovación ahora mismo. Inténtalo de nuevo o escríbenos.' }
  }
}

/** Cancela ya una suscripción. true si quedó cancelada (o ya lo estaba); false si Stripe falló. */
export async function cancelImmediately(subscriptionId: string): Promise<boolean> {
  if (!stripeReady()) return true
  try {
    const sub = await stripe().subscriptions.retrieve(subscriptionId)
    if (sub.status === 'canceled' || sub.status === 'incomplete_expired') return true
    await stripe().subscriptions.cancel(subscriptionId)
    return true
  } catch (err) {
    reportError(err, `cancelar suscripción ${subscriptionId}`)
    return false
  }
}

function mapStatus(s: Stripe.Subscription.Status): SubStatus | null {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    // Stripe dejó de reintentar: sin acceso hasta que se pague.
    case 'unpaid':
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
  // Manda el precio que se cobra de verdad; los metadatos solo si el precio no lo dice.
  const fromPrice = [fromEnv, fromLookup?.[1], item?.price?.metadata?.plan].find((x): x is string => Boolean(x && isPaidPlan(x)))
  const plan = fromPrice ?? (sub.metadata?.plan && isPaidPlan(sub.metadata.plan) ? sub.metadata.plan : ws.plan)
  const interval = (item?.price?.recurring?.interval === 'year' ? 'year' : 'month') as Interval
  const status = mapStatus(sub.status)
  if (!status) return ws

  // Dos suscripciones vivas para el mismo espacio: se avisa para devolver la sobrante.
  if (ws.stripeSubscriptionId && ws.stripeSubscriptionId !== sub.id && status === 'active' && (ws.status === 'active' || ws.status === 'past_due')) {
    reportError(new Error(`Dos suscripciones vivas en el espacio ${ws.id}: ${ws.stripeSubscriptionId} y ${sub.id}`), 'stripe')
  }

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
    pastDueSince: status === 'past_due' ? (ws.status === 'past_due' && ws.pastDueSince ? ws.pastDueSince : new Date().toISOString()) : null,
  })
  return repo.workspaceById(ws.id)
}

/** Al volver del Checkout no esperamos al webhook: leemos la sesión y aplicamos. */
export async function confirmCheckout(sessionId: string, workspaceId: number): Promise<boolean> {
  if (!stripeReady()) return false
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
    if (String(session.client_reference_id) !== String(workspaceId)) return false
    // Pagos que tardan días (transferencias): el acceso llega con la factura pagada (webhook).
    if (session.payment_status === 'unpaid') return false
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
      if (session.subscription && session.payment_status !== 'unpaid') {
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        const sub = await stripe().subscriptions.retrieve(subId)
        workspaceId = syncSubscription(sub)?.id ?? null
        await attachAccountTaxId(subId)
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Se lee el estado actual: Stripe puede entregar los eventos desordenados o con días de retraso.
      const fresh = await stripe().subscriptions.retrieve(event.data.object.id).catch(() => event.data.object)
      workspaceId = syncSubscription(fresh)?.id ?? null
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
      // El estado sale de la suscripción, no del evento de la factura (que puede llegar después de la baja).
      const subRef = inv.parent?.subscription_details?.subscription
      const subId = typeof subRef === 'string' ? subRef : subRef?.id
      if (subId) {
        const sub = await stripe().subscriptions.retrieve(subId).catch(() => null)
        if (sub) syncSubscription(sub)
      }
      if (event.type === 'invoice.paid' && inv.amount_paid > 0 && ws) await mailInvoice(inv, ws)
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

/** Factura por correo al cobrarla: número, importe y enlace al PDF de Stripe. */
async function mailInvoice(inv: Stripe.Invoice, ws: Workspace) {
  const to = inv.customer_email
  if (!to || !inv.invoice_pdf) return
  const es = (ws?.language ?? 'es') === 'es'
  const total = (inv.amount_paid / 100).toLocaleString(es ? 'es-ES' : 'en-US', { style: 'currency', currency: inv.currency.toUpperCase() })
  const { sendEmail, appUrl } = await import('./email')
  await sendEmail({
    to,
    subject: es ? `Tu factura de Placton${inv.number ? ` nº ${inv.number}` : ''}` : `Your Placton invoice${inv.number ? ` ${inv.number}` : ''}`,
    kind: 'factura',
    title: es ? 'Gracias por tu pago' : 'Thanks for your payment',
    body: es
      ? `Hemos cobrado ${total} de tu suscripción a Placton${ws ? ` (${ws.name})` : ''}. Aquí tienes la factura${inv.number ? ` nº ${inv.number}` : ''}.\n\nTambién están todas en Ajustes, Suscripción, en ${appUrl()}/dashboard/settings/billing.`
      : `We've charged ${total} for your Placton subscription${ws ? ` (${ws.name})` : ''}. Here is your invoice${inv.number ? ` ${inv.number}` : ''}.\n\nYou can also find all of them under Settings, Billing, at ${appUrl()}/dashboard/settings/billing.`,
    cta: { label: es ? 'Descargar la factura (PDF)' : 'Download the invoice (PDF)', url: inv.invoice_pdf },
    lang: es ? 'es' : 'en',
  }).catch((err) => console.error('[placton] correo de factura', err))
}
