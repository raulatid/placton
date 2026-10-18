import 'server-only'
import { createHmac } from 'node:crypto'
import { all, jsonList, jsonOr, nowIso, one, run, tx } from '../db'
import { appUrl, sendEmail, siteUrl } from '../email'
import { reportError } from '../monitor'
import { findSent, getHeaders, GmailError, listReceived, sendRaw, threadMessages, type Box } from './gmail'
import { buildMessage, htmlBody, newMessageId } from './mime'

// Motor de la campaña de captación por correo.
//
// Los textos llegan ya redactados por contacto (scripts de placton-outreach →
// /api/admin/outreach/import): aquí solo se decide QUIÉN, CUÁNDO y DESDE DÓNDE.
// - Cada buzón tiene un tope diario que sube por semanas (calentamiento) y deja
//   un hueco al azar entre envíos, como una persona.
// - Solo se escribe en horario laboral del destinatario (su zona horaria).
// - Los seguimientos van en el mismo hilo y desde el mismo buzón; tienen
//   prioridad sobre los contactos nuevos.
// - Cada pocos minutos se leen los buzones: una respuesta para la secuencia,
//   un rebote o una baja excluyen la dirección para siempre, y si los rebotes
//   de un buzón pasan del umbral, el buzón se para solo.
// - Quien se registra en Placton (por su dominio) sale de la campaña y cuenta
//   en el embudo; si paga, también.

export interface Step {
  /** Asunto: el primero siempre; en los siguientes, sin asunto = respuesta en el mismo hilo. */
  subject?: string | null
  body: string
  /** Días de espera desde el correo anterior (el primero, 0). */
  wait?: number
}

export interface Contact {
  id: number
  email: string
  domain: string
  company: string
  audience: string
  segment: string
  hook: string
  country: string
  tz: string
  priority: number
  steps: string
  status: string
  step: number
  mailbox: string | null
  threadId: string | null
  messageIds: string
  subject: string | null
  nextAt: string | null
  lastSentAt: string | null
  repliedAt: string | null
  signedUpAt: string | null
  paidAt: string | null
  workspaceId: number | null
  importedAt: string
  /** Envío en curso desde esta hora: si el proceso se corta, se mira en Gmail si salió. */
  pendingAt: string | null
  /** Fallos seguidos del paso actual. */
  attempts: number
}

export interface Mailbox {
  email: string
  name: string
  refreshToken: string
  warmupFrom: string
  paused: number
  pausedReason: string | null
  nextSendAt: string | null
  lastPollAt: string | null
  lastError: string | null
  createdAt: string
  /** Última vez que se reanudó o reconectó: la salud se mide desde aquí. */
  resumedAt: string | null
}

// ── Ajustes (editables desde el panel) ──

export interface Settings {
  running: boolean
  /** Envíos al día por buzón según la semana de calentamiento; la última cifra se mantiene. */
  ramp: number[]
  /** Días de envío en la zona del destinatario (1 = lunes … 7 = domingo). */
  days: number[]
  fromHour: number
  toHour: number
  /** Minutos al azar entre dos envíos del mismo buzón. */
  gapMin: number
  gapMax: number
  /** Rebotes (7 días) por encima de esto paran el buzón; el doble en total para la campaña. */
  maxBounce: number
  /** Cabecera de baja en un clic. */
  listUnsubscribe: boolean
  /** Pie legal que se añade a cada correo (pequeño y gris en la versión HTML). */
  footer: string
  /** Última vez que se puso en marcha: la salud global se mide desde aquí. */
  startedAt?: string
}

// Arranque decidido el 18-10-2026 para info@vertigomkt.es (buzón con historial: 40 al
// día para Vértigo en agosto sin problemas): 30, 40 y 50 al día; de 7 a 12 del destinatario.
export const DEFAULT_SETTINGS: Settings = {
  running: false,
  ramp: [30, 40, 50],
  days: [1, 2, 3, 4, 5],
  fromHour: 7,
  toHour: 12,
  gapMin: 4,
  gapMax: 9,
  maxBounce: 0.04,
  // La baja en un clic por https pondría placton.tech en la cabecera de cada correo frío
  // (dominio recién creado): la baja por correo (mailto) va siempre.
  listUnsubscribe: false,
  footer: 'Placton (SELSPY AGENCY S. COOP.), Paseo la Fuente 9, 30007 Murcia, Spain. A sales email to the address on your website. Reply "no" to opt out.',
}

export function settings(): Settings {
  const row = one<{ value: string }>("SELECT value FROM outreach_settings WHERE key = 'settings'")
  return { ...DEFAULT_SETTINGS, ...jsonOr<Partial<Settings>>(row?.value, {}) }
}

export function saveSettings(patch: Partial<Settings>) {
  const prev = settings()
  const next = { ...prev, ...patch }
  if (patch.running && !prev.running) next.startedAt = nowIso()
  run("INSERT INTO outreach_settings (key, value) VALUES ('settings', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [JSON.stringify(next)])
  return next
}

// ── Utilidades ──

const DAY_MS = 86_400_000
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString()

const fmtCache = new Map<string, Intl.DateTimeFormat>()
/** Día de la semana (1-7, lunes = 1), hora decimal y mes-día en una zona horaria. */
export function localTime(tz: string, d = new Date()): { wd: number; hour: number; md: string } {
  let f = fmtCache.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit', hourCycle: 'h23' })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit', hourCycle: 'h23' })
    }
    fmtCache.set(tz, f)
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1
  return { wd, hour: Number(p.hour) + Number(p.minute) / 60, md: `${p.month}-${p.day}` }
}

// Fiestas en las que nadie lee el correo de trabajo (mes-día).
const QUIET = new Set(['12-24', '12-25', '12-26', '12-31', '01-01', '01-02'])

export function inWindow(tz: string, s: Settings, d = new Date()): boolean {
  const t = localTime(tz, d)
  return s.days.includes(t.wd) && t.hour >= s.fromHour && t.hour < s.toHour && !QUIET.has(t.md)
}

/** Tope del buzón hoy según su semana de calentamiento. */
export function capFor(box: Pick<Mailbox, 'warmupFrom'>, s: Settings): number {
  const days = Math.floor((Date.now() - new Date(box.warmupFrom).getTime()) / DAY_MS)
  if (days < 0) return 0
  return s.ramp[Math.min(Math.floor(days / 7), s.ramp.length - 1)] ?? 0
}

export function sentLast24h(email: string): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM outreach_messages WHERE mailbox = ? AND error IS NULL AND sentAt > ?', [email, isoIn(-DAY_MS)])?.n ?? 0
}

function suppressed(email: string, domain: string): boolean {
  return Boolean(one('SELECT 1 AS x FROM outreach_suppress WHERE value IN (?, ?)', [email.toLowerCase(), `@${domain.toLowerCase()}`]))
}

export function suppress(value: string, reason: string) {
  run('INSERT OR IGNORE INTO outreach_suppress (value, reason, createdAt) VALUES (?, ?, ?)', [value.toLowerCase().trim(), reason, nowIso()])
}

export function unsubToken(id: number): string {
  const secret = process.env.OUTREACH_SECRET || process.env.CRON_SECRET || ''
  const sig = createHmac('sha256', secret).update(`unsub:${id}`).digest('base64url').slice(0, 16)
  return `${id.toString(36)}.${sig}`
}

export function unsubUrl(id: number): string {
  return `${siteUrl()}/api/u/${unsubToken(id)}`
}

/** Comprueba el enlace de baja y devuelve el contacto, o null si no es válido. */
export function contactFromToken(token: string): Contact | null {
  const [idPart] = token.split('.')
  const id = parseInt(idPart ?? '', 36)
  if (!Number.isFinite(id) || id <= 0 || unsubToken(id) !== token) return null
  return one<Contact>('SELECT * FROM outreach_contacts WHERE id = ?', [id])
}

/** Baja pedida por el destinatario: fuera la dirección y el dominio entero. */
export function unsubscribeContact(c: Pick<Contact, 'id' | 'email' | 'domain'>, how: string) {
  tx(() => {
    run("UPDATE outreach_contacts SET status = 'unsubscribed', nextAt = NULL WHERE id = ?", [c.id])
    suppress(c.email, `baja (${how})`)
    suppress(`@${c.domain}`, `baja (${how})`)
    run('INSERT INTO outreach_events (contactId, kind, fromEmail, subject, createdAt) VALUES (?, ?, ?, ?, ?)', [c.id, 'unsubscribe', c.email, how, nowIso()])
  })
}

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'msn.com'])

/** Dominio sin protocolo, «www.» ni ruta. */
export function bareDomain(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#:].*$/, '')
}

// ── Importar contactos ──

export interface ImportRow {
  email: string
  domain: string
  company?: string
  audience: string
  segment?: string
  hook?: string
  country?: string
  tz?: string
  priority?: number
  steps: Step[]
}

export function importContacts(rows: ImportRow[]): { added: number; updated: number; skipped: number; invalid: number } {
  let added = 0
  let updated = 0
  let skipped = 0
  let invalid = 0
  const now = nowIso()
  tx(() => {
    for (const r of rows) {
      const email = String(r.email ?? '').toLowerCase().trim()
      const domain = bareDomain(String(r.domain ?? email.split('@')[1] ?? ''))
      const steps = Array.isArray(r.steps) ? r.steps.filter((s) => s && typeof s.body === 'string' && s.body.trim()) : []
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || !domain || !steps.length || !steps[0].subject || !r.audience) {
        invalid++
        continue
      }
      if (suppressed(email, domain)) {
        skipped++
        continue
      }
      const clean = JSON.stringify(steps.map((s, i) => ({ subject: s.subject ?? null, body: s.body, wait: i === 0 ? 0 : Math.max(1, Number(s.wait) || 3) })))
      const fields = [domain, String(r.company ?? ''), String(r.audience), String(r.segment ?? ''), String(r.hook ?? ''), String(r.country ?? ''), String(r.tz || 'America/New_York'), Number(r.priority) || 0, clean]
      const existing = one<{ id: number; status: string }>('SELECT id, status FROM outreach_contacts WHERE email = ?', [email])
      if (existing) {
        // Solo se reescribe lo que aún no ha empezado: nunca un hilo a medias.
        if (existing.status === 'pending') {
          run('UPDATE outreach_contacts SET domain = ?, company = ?, audience = ?, segment = ?, hook = ?, country = ?, tz = ?, priority = ?, steps = ? WHERE id = ?', [...fields, existing.id])
          updated++
        } else skipped++
        continue
      }
      // Una sola persona por empresa.
      if (one('SELECT 1 AS x FROM outreach_contacts WHERE domain = ?', [domain])) {
        skipped++
        continue
      }
      run('INSERT INTO outreach_contacts (email, domain, company, audience, segment, hook, country, tz, priority, steps, importedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [email, ...fields, now])
      added++
    }
  })
  return { added, updated, skipped, invalid }
}

// ── Envío ──

function boxOf(m: Mailbox): Box {
  return { email: m.email, refreshToken: m.refreshToken }
}

/** Zonas horarias de los contactos pendientes que ahora están en horario laboral. */
function openZones(s: Settings): string[] {
  const zones = all<{ tz: string }>("SELECT DISTINCT tz FROM outreach_contacts WHERE status IN ('pending', 'active')").map((r) => r.tz)
  return zones.filter((tz) => inWindow(tz, s))
}

function nextContactFor(box: Mailbox, zones: string[], skip: number[]): Contact | null {
  if (!zones.length) return null
  const marks = zones.map(() => '?').join(',')
  const not = skip.length ? `AND id NOT IN (${skip.map(() => '?').join(',')})` : ''
  // Primero los seguimientos que ya tocan, de este buzón.
  // Un contacto con un envío en duda (pendingAt) solo lo toca recoverPending.
  const follow = one<Contact>(`SELECT * FROM outreach_contacts WHERE status = 'active' AND mailbox = ? AND nextAt <= ? AND pendingAt IS NULL AND tz IN (${marks}) ${not} ORDER BY nextAt LIMIT 1`, [box.email, nowIso(), ...zones, ...skip])
  if (follow) return follow
  return one<Contact>(`SELECT * FROM outreach_contacts WHERE status = 'pending' AND pendingAt IS NULL AND tz IN (${marks}) ${not} ORDER BY priority DESC, id LIMIT 1`, [...zones, ...skip])
}

/** Dominios que ya son usuarios o espacios de Placton: no se les escribe en frío. */
function isCustomerDomain(domain: string): boolean {
  if (one("SELECT 1 AS x FROM users WHERE lower(email) LIKE ? LIMIT 1", [`%@${domain}`])) return true
  return Boolean(one("SELECT 1 AS x FROM workspaces WHERE lower(domain) IN (?, ?) LIMIT 1", [domain, `www.${domain}`]))
}

function fill(text: string, box: Mailbox, c: Contact, test = false): string {
  const name = box.name || 'Raúl'
  return text
    .replaceAll('{{sender_name}}', name)
    .replaceAll('{{sender_first}}', name.split(' ')[0])
    .replaceAll('{{unsubscribe_url}}', test ? `${siteUrl()}/api/u/ejemplo` : unsubUrl(c.id))
    .replaceAll('{{site}}', siteUrl().replace(/^https?:\/\//, ''))
}

/** Asunto del paso actual y si abre hilo nuevo. */
function stepInfo(c: Contact, step: Step | undefined, test = false) {
  const newThread = c.step === 0 || Boolean(step?.subject) || !c.threadId || test
  const subject = step?.subject || `Re: ${c.subject ?? ''}`.trim()
  return { newThread, subject }
}

/** Deja constancia de un envío que Gmail ya aceptó y programa el siguiente paso. */
function recordSent(box: Mailbox, c: Contact, steps: Step[], subject: string, sent: { id: string; threadId: string }, newThread: boolean, messageId: string) {
  const refs = jsonList(c.messageIds)
  const now = nowIso()
  const next = steps[c.step + 1]
  // Siguiente paso: los días de espera más unas horas al azar.
  const nextAt = next ? isoIn((next.wait ?? 3) * DAY_MS + rand(0, 4) * 3_600_000) : null
  tx(() => {
    run('INSERT INTO outreach_messages (contactId, mailbox, step, subject, gmailId, sentAt) VALUES (?, ?, ?, ?, ?, ?)', [c.id, box.email, c.step, subject, sent.id, now])
    // Si mientras tanto respondió, se dio de baja o se registró, su estado se respeta.
    const fin = "status IN ('replied', 'signed_up', 'unsubscribed', 'bounced', 'failed')"
    run(
      `UPDATE outreach_contacts SET status = CASE WHEN ${fin} THEN status ELSE ? END, step = step + 1, mailbox = ?, threadId = ?, messageIds = ?, subject = COALESCE(subject, ?),
         nextAt = CASE WHEN ${fin} THEN NULL ELSE ? END, lastSentAt = ?, pendingAt = NULL, attempts = 0 WHERE id = ?`,
      [next ? 'active' : 'done', box.email, newThread ? sent.threadId : c.threadId, JSON.stringify((newThread ? [messageId] : [...refs, messageId]).filter(Boolean)), subject, nextAt, now, c.id],
    )
  })
}

/** Gmail pone su propio Message-ID: se cambia el nuestro por el real para encadenar bien el hilo. */
async function fixMessageId(box: Mailbox, contactId: number, gmailId: string, ourId: string) {
  try {
    const real = (await getHeaders(boxOf(box), gmailId)).headers['message-id']
    if (!real || real === ourId) return
    const row = one<{ messageIds: string }>('SELECT messageIds FROM outreach_contacts WHERE id = ?', [contactId])
    const ids = jsonList(row?.messageIds).map((x) => (x === ourId ? real : x))
    run('UPDATE outreach_contacts SET messageIds = ? WHERE id = ?', [JSON.stringify(ids), contactId])
  } catch {
    // nos quedamos con el nuestro
  }
}

/** Error de red o del servidor de Google: el correo pudo salir aunque no llegara la respuesta. */
const ambiguous = (e: GmailError) => !e.status || e.status >= 500

/** Buzones con mensajes recibidos aún sin leer (avalancha): no envían hasta ponerse al día. */
const backlog = new Set<string>()

/** Un envío: el siguiente paso de la secuencia del contacto desde este buzón. */
export async function sendStep(box: Mailbox, c: Contact, s: Settings, opts: { to?: string } = {}): Promise<'sent' | 'skipped' | 'closed' | 'failed'> {
  const steps = jsonOr<Step[]>(c.steps, [])
  const step = steps[c.step]
  const test = Boolean(opts.to)
  if (!step) {
    if (!test) run("UPDATE outreach_contacts SET status = 'done', nextAt = NULL WHERE id = ?", [c.id])
    return 'skipped'
  }
  if (!test) {
    if (suppressed(c.email, c.domain)) {
      run("UPDATE outreach_contacts SET status = 'unsubscribed', nextAt = NULL WHERE id = ?", [c.id])
      return 'skipped'
    }
    if (isCustomerDomain(c.domain)) {
      run("UPDATE outreach_contacts SET status = 'signed_up', signedUpAt = COALESCE(signedUpAt, ?), nextAt = NULL WHERE id = ?", [nowIso(), c.id])
      return 'skipped'
    }
  }
  const refs = jsonList(c.messageIds)
  const { newThread, subject } = stepInfo(c, step, test)
  const messageId = newMessageId(box.email)
  // Los textos importados no llevan pie: se añade aquí, el mismo para todos.
  const text = fill(step.body, box, c, test).trim()
  const footer = fill(s.footer, box, c, test).trim()
  const raw = buildMessage({
    fromName: box.name,
    fromEmail: box.email,
    to: opts.to ?? c.email,
    subject: test ? `[Prueba] ${subject}` : subject,
    body: footer ? `${text}\n\n${footer}` : text,
    html: htmlBody(text, footer),
    messageId,
    references: newThread ? [] : refs,
    // En las pruebas, nada que dé de baja a un contacto real si se pulsa.
    unsubscribeUrl: s.listUnsubscribe && !test ? unsubUrl(c.id) : undefined,
    unsubscribeToken: test ? undefined : unsubToken(c.id),
  })
  // Se apunta ANTES de enviar: si el proceso se corta a mitad, se comprueba en Gmail si salió.
  const startedAt = Date.now()
  if (!test) run('UPDATE outreach_contacts SET pendingAt = ? WHERE id = ?', [new Date(startedAt).toISOString(), c.id])
  try {
    const sent = await sendRaw(boxOf(box), raw, newThread ? null : c.threadId)
    if (test) return 'sent'
    recordSent(box, c, steps, subject, sent, newThread, messageId)
    await fixMessageId(box, c.id, sent.id, messageId)
    return 'sent'
  } catch (err) {
    const e = err as GmailError
    const msg = String(e.message ?? err).slice(0, 300)
    if (test) throw err
    // ¿Salió de verdad? Con un error de red o de Google no se decide ahora: si no aparece ya en
    // Enviados, el envío queda «en duda» y recoverPending lo vuelve a mirar en unos minutos.
    if (ambiguous(e)) {
      const found = await findSent(boxOf(box), c.email, Math.floor(startedAt / 1000) - 120).catch(() => null)
      if (found) {
        recordSent(box, c, steps, subject, found, newThread, found.messageId || messageId)
        return 'sent'
      }
      run('UPDATE outreach_mailboxes SET nextSendAt = ?, lastError = ? WHERE email = ?', [isoIn(10 * 60_000), msg, box.email])
      return 'failed'
    }
    run('UPDATE outreach_contacts SET pendingAt = NULL WHERE id = ?', [c.id])
    run('INSERT INTO outreach_messages (contactId, mailbox, step, subject, error, sentAt) VALUES (?, ?, ?, ?, ?, ?)', [c.id, box.email, c.step, subject, msg, nowIso()])
    if (e.auth) {
      pauseMailbox(box.email, 'El permiso de Google ya no vale: vuelve a conectar el buzón.')
      return 'failed'
    }
    if (e.status === 429 || /rate limit|quota|limit exceeded|sending limit/i.test(msg)) {
      // Límite de Google: el buzón descansa hasta mañana.
      run('UPDATE outreach_mailboxes SET nextSendAt = ?, lastError = ? WHERE email = ?', [isoIn(DAY_MS), msg, box.email])
      return 'failed'
    }
    // Errores propios de ESTE contacto: dirección imposible o hilo borrado. Se cierra y el buzón
    // no sigue en esta vuelta (si el fallo fuera del buzón, no se queman más contactos).
    const recipient = e.status === 400 && /invalid to header|recipient address|invalid (email )?address/i.test(msg)
    const goneThread = e.status === 404 && !newThread
    if (recipient || goneThread) {
      if (recipient) {
        run("UPDATE outreach_contacts SET status = 'bounced', nextAt = NULL WHERE id = ?", [c.id])
        suppress(c.email, 'dirección no válida')
      } else {
        run("UPDATE outreach_contacts SET status = 'failed', nextAt = NULL WHERE id = ?", [c.id])
      }
      stopIfFailing(box, msg)
      return 'closed'
    }
    // Cualquier otro 4xx (403, 400 de cuenta, «Mail service not enabled»…) es del buzón: se para.
    if (e.status && e.status >= 400 && e.status < 500) {
      pauseMailbox(box.email, `Google no deja enviar desde este buzón: ${msg}`)
      return 'failed'
    }
    // Fallo pasajero: el buzón descansa 30 minutos; con 5 fallos seguidos se para y avisa.
    run('UPDATE outreach_mailboxes SET nextSendAt = ?, lastError = ? WHERE email = ?', [isoIn(30 * 60_000), msg, box.email])
    stopIfFailing(box, msg)
    return 'failed'
  }
}

/** 5 envíos seguidos con error desde la última reanudación: el buzón se para y avisa. */
function stopIfFailing(box: Mailbox, msg: string) {
  const last = all<{ error: string | null }>('SELECT error FROM outreach_messages WHERE mailbox = ? AND sentAt > ? ORDER BY id DESC LIMIT 5', [box.email, box.resumedAt ?? ''])
  if (last.length === 5 && last.every((r) => r.error)) pauseMailbox(box.email, `5 envíos seguidos han fallado. Último error: ${msg}`)
}

export function pauseMailbox(email: string, reason: string) {
  run('UPDATE outreach_mailboxes SET paused = 1, pausedReason = ? WHERE email = ?', [reason, email])
  notifyAdmins(`Campaña: buzón ${email} parado`, `${reason}\n\nEl resto de buzones sigue enviando.`)
}

function notifyAdmins(subject: string, body: string) {
  for (const to of (process.env.PLACTON_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    void sendEmail({ to, subject, kind: 'campana', title: subject, body, cta: { label: 'Ver la campaña', url: `${appUrl()}/admin/outreach` }, lang: 'es' })
  }
}

/**
 * Antes de un seguimiento se mira el hilo en Gmail: si hay algo recibido que aún no se ha
 * leído (una respuesta, un rebote, una baja), se lee el buzón primero y no se envía.
 */
async function threadIsQuiet(box: Mailbox, c: Contact): Promise<'quiet' | 'busy' | 'gone'> {
  if (!c.threadId || c.step === 0) return 'quiet'
  let msgs: { id: string; labelIds: string[]; internalDate: string }[]
  try {
    msgs = await threadMessages(boxOf(box), c.threadId)
  } catch (err) {
    // Hilo borrado del buzón: no se puede seguir en él.
    if ((err as GmailError).status === 404) return 'gone'
    throw err
  }
  const since = new Date(c.lastSentAt ?? 0).getTime() - 60_000
  const own = ['SENT', 'DRAFT', 'SCHEDULED', 'CHAT']
  const fresh = msgs.filter((m) => !m.labelIds.some((l) => own.includes(l)) && Number(m.internalDate) > since && !one('SELECT 1 AS x FROM outreach_seen WHERE gmailId = ?', [m.id]))
  return fresh.length ? 'busy' : 'quiet'
}

/** Una vuelta de envío: como mucho un correo por buzón, si le toca. */
export async function sendTick(): Promise<number> {
  const s = settings()
  if (!s.running) return 0
  const zones = openZones(s)
  if (!zones.length) return 0
  const now = Date.now()
  const boxes = all<Mailbox>('SELECT * FROM outreach_mailboxes WHERE paused = 0 AND (nextSendAt IS NULL OR nextSendAt <= ?)', [new Date(now).toISOString()]).sort(() => Math.random() - 0.5)
  let sent = 0
  for (const box of boxes) {
    // Sin una lectura del buzón en los últimos 15 minutos no se envía nada:
    // podría haber respuestas o bajas sin procesar.
    if (!box.lastPollAt || now - new Date(box.lastPollAt).getTime() > 15 * 60_000 || backlog.has(box.email)) continue
    const cap = capFor(box, s)
    if (sentLast24h(box.email) >= cap) continue
    const skip: number[] = []
    // Hasta 5 intentos por si el primero se descarta (baja, ya es cliente, error propio…).
    for (let i = 0; i < 5; i++) {
      const c = nextContactFor(box, zones, skip)
      if (!c) break
      skip.push(c.id)
      if (c.status === 'active') {
        let state = await threadIsQuiet(box, c).catch(() => 'error' as const)
        if (state === 'gone') {
          run("UPDATE outreach_contacts SET status = 'failed', nextAt = NULL WHERE id = ?", [c.id])
          continue
        }
        if (state === 'busy') {
          // Hay algo nuevo en el hilo: se lee el buzón ya; si después sigue igual, se aplaza un día.
          await pollMailbox(box).catch((err) => reportError(err, 'campaña:lectura'))
          const after = one<Contact>('SELECT * FROM outreach_contacts WHERE id = ?', [c.id])
          if (after?.status !== 'active') continue
          state = await threadIsQuiet(box, after).catch(() => 'error' as const)
        }
        if (state !== 'quiet') {
          run("UPDATE outreach_contacts SET nextAt = ? WHERE id = ? AND status = 'active'", [isoIn(DAY_MS), c.id])
          continue
        }
      }
      // El contacto se reserva para este buzón antes de enviar (nadie más lo coge).
      if (c.status === 'pending') {
        const claimed = run("UPDATE outreach_contacts SET status = 'sending', mailbox = ? WHERE id = ? AND status = 'pending'", [box.email, c.id]).changes
        if (!claimed) continue
        c.status = 'sending'
      }
      const result = await sendStep(box, c, s).catch((err) => {
        reportError(err, 'campaña:envío')
        return 'failed' as const
      })
      // Si el primer envío falla sin más, el contacto vuelve a la cola.
      run("UPDATE outreach_contacts SET status = 'pending', mailbox = NULL WHERE id = ? AND status = 'sending' AND pendingAt IS NULL", [c.id])
      if (result === 'skipped') continue
      if (result === 'closed') break
      if (result === 'sent') {
        sent++
        run('UPDATE outreach_mailboxes SET nextSendAt = ?, lastError = NULL WHERE email = ?', [isoIn(rand(s.gapMin, s.gapMax) * 60_000), box.email])
      }
      break
    }
  }
  return sent
}

/**
 * Envíos que quedaron a medias por un reinicio: si Gmail los tiene en Enviados, se dan
 * por enviados (nunca se repite un paso); si no, vuelven a la cola.
 */
async function recoverPending() {
  run("UPDATE outreach_contacts SET status = 'pending', mailbox = NULL WHERE status = 'sending' AND pendingAt IS NULL")
  // Se espera a que Gmail tenga el envío en Enviados (unos minutos) antes de decidir.
  for (const c of all<Contact>('SELECT * FROM outreach_contacts WHERE pendingAt IS NOT NULL AND pendingAt < ?', [isoIn(-5 * 60_000)])) {
    const box = c.mailbox ? one<Mailbox>('SELECT * FROM outreach_mailboxes WHERE email = ?', [c.mailbox]) : null
    if (!box) {
      // El buzón ya no existe: nadie puede comprobarlo; se cierra sin arriesgar un doble envío.
      run("UPDATE outreach_contacts SET pendingAt = NULL, status = CASE WHEN status IN ('sending', 'pending') THEN 'failed' ELSE 'done' END, nextAt = NULL WHERE id = ?", [c.id])
      continue
    }
    let found: Awaited<ReturnType<typeof findSent>> = null
    try {
      found = await findSent(boxOf(box), c.email, Math.floor(new Date(c.pendingAt!).getTime() / 1000) - 120)
    } catch {
      continue // Gmail no responde (o el buzón perdió el permiso): se vuelve a mirar más tarde
    }
    if (found) {
      const steps = jsonOr<Step[]>(c.steps, [])
      const { newThread, subject } = stepInfo(c, steps[c.step])
      recordSent(box, c, steps, found.subject || subject, found, newThread, found.messageId)
    } else {
      // Gmail confirma que no salió: vuelve a la cola.
      run("UPDATE outreach_contacts SET pendingAt = NULL, status = CASE WHEN status = 'sending' THEN 'pending' ELSE status END, mailbox = CASE WHEN status = 'sending' THEN NULL ELSE mailbox END WHERE id = ?", [c.id])
    }
  }
}

// ── Lectura de los buzones: respuestas, rebotes, bajas ──

const AUTO_SUBJECT = /out of (the )?office|automatic reply|auto[- ]?reply|autoreply|away from (the )?office|on vacation|on leave|abwesenheit|absence|réponse automatique|respuesta automática/i
const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (sub)?system|microsoftexchange/i
const BOUNCE_SUBJECT = /delivery status notification|undeliverable|undelivered|returned mail|delivery has failed|failure notice|could not be delivered|delivery failure|mail delivery failed|message blocked/i
// Una respuesta es una baja si TODO lo que escribe es «no», «stop»… o si, siendo corta, pide
// expresamente que no le escribamos. «No problem, let's talk» o «not interested now, call me
// in January» son respuestas: las ve una persona.
const UNSUB_ALONE = /^(no|nope|stop|unsubscribe|remove( me)?|please remove( me)?|take me off( your list)?|not interested|no,? thanks?( you)?|pass)[\s.!,]*$/i
const UNSUB_ANY = /unsubscribe|remove me|remove us|take me off|take us off|stop (e-?mailing|contacting|writing|sending)|do not (e-?mail|contact|write)|don'?t (e-?mail|contact|write)|not interested|no longer interested/i
const INTEREST = /\?|\b(call me|call us|give me a call|phone|send me|send over|pricing|price|cost|later|next (week|month|year|quarter)|january|february|march|april|june|july|august|september|october|november|december|demo|meeting|more info|details|maybe|interested in)\b/i
const TOKEN_IN = /unsubscribe\s+([0-9a-z]+\.[A-Za-z0-9_-]{16})/i

/** Lo que escribió la persona, sin el correo citado que va detrás. */
function ownText(snippet: string): string {
  const t = snippet
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
  const cut = t.search(/\bOn (Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d)[^]*?wrote:|-----Original Message|_{8,}|\bFrom: |\bSent from my |(^|\s)>/i)
  return (cut >= 0 ? t.slice(0, cut) : t).trim()
}

/** 'header' = la baja del cliente de correo; 'typed' = la escribió una persona. */
function unsubKind(subject: string, snippet: string): 'header' | 'typed' | null {
  if (/^\s*unsubscribe\b/i.test(subject)) return 'header'
  const own = ownText(snippet)
  if (UNSUB_ALONE.test(own)) return 'typed'
  const short = own.split(/\s+/).filter(Boolean).length <= 12
  return short && UNSUB_ANY.test(own) && !INTEREST.test(own) ? 'typed' : null
}

function addressOf(header: string): string {
  const m = header.match(/<([^>]+)>/)
  return (m ? m[1] : header).trim().toLowerCase()
}

const EMAILS_IN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
// Remitentes de rebotes que son de la infraestructura del correo, no de la empresa.
const INFRA = /(^|\.)(google\.com|googlemail\.com|outlook\.com|protection\.outlook\.com|onmicrosoft\.com|hotmail\.com|yahoo\.com|amazonses\.com|mimecast\.com|pphosted\.com|barracuda\.com)$/i

/** ¿De qué contacto es este mensaje? */
function contactFor(m: { threadId: string; snippet: string; headers: Record<string, string> }, from: string, subject: string, bounce: boolean, failed: string[]): Contact | null {
  const byThread = one<Contact>('SELECT * FROM outreach_contacts WHERE threadId = ?', [m.threadId])
  if (byThread) return byThread
  // Respuestas y rebotes fuera del hilo: por los Message-ID que cita.
  for (const ref of `${m.headers['in-reply-to'] ?? ''} ${m.headers.references ?? ''}`.match(/<[^>]+>/g) ?? []) {
    const c = one<Contact>('SELECT * FROM outreach_contacts WHERE messageIds LIKE ?', [`%${ref}%`])
    if (c) return c
  }
  if (bounce) {
    // La dirección rebotada: en la cabecera de Gmail o escrita en el aviso.
    const named = [...failed, ...`${subject} ${m.snippet}`.toLowerCase().match(EMAILS_IN) ?? []]
    for (const e of named) {
      const c = one<Contact>("SELECT * FROM outreach_contacts WHERE email = ? AND status != 'pending'", [e])
      if (c) return c
    }
    // Aviso del servidor de la propia empresa (MicrosoftExchange@empresa.com…).
    const d = bareDomain(from.split('@')[1] ?? '')
    if (d && !INFRA.test(d) && !FREE_MAIL.has(d)) return one<Contact>("SELECT * FROM outreach_contacts WHERE domain = ? AND status != 'pending'", [d])
    return null
  }
  if (from) {
    const c = one<Contact>('SELECT * FROM outreach_contacts WHERE email = ?', [from])
    if (c) return c
  }
  const d = from.includes('@') ? bareDomain(from.split('@')[1]) : ''
  return d && !FREE_MAIL.has(d) ? one<Contact>("SELECT * FROM outreach_contacts WHERE domain = ? AND status != 'pending'", [d]) : null
}

export async function pollMailbox(box: Mailbox): Promise<{ replies: number; bounces: number; unsubs: number; auto: number }> {
  const counts = { replies: 0, bounces: 0, unsubs: 0, auto: 0 }
  const since = Math.floor((new Date(box.lastPollAt ?? box.createdAt).getTime() - 2 * 3_600_000) / 1000)
  // Del más antiguo al más nuevo; como mucho 300 por vuelta. Si quedan, la próxima
  // lectura empieza donde se quedó esta (nunca se salta nada).
  const pending = (await listReceived(boxOf(box), since)).reverse().filter((r) => !one('SELECT 1 AS x FROM outreach_seen WHERE gmailId = ?', [r.id]))
  const batch = pending.slice(0, 300)
  let lastDate = 0
  for (const ref of batch) {
    const m = await getHeaders(boxOf(box), ref.id)
    lastDate = Math.max(lastDate, Number(m.internalDate) || 0)
    const h = m.headers
    const from = addressOf(h.from ?? '')
    const subject = h.subject ?? ''
    const failed = (h['x-failed-recipients'] ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
    const bounce = BOUNCE_FROM.test(h.from ?? '') || failed.length > 0 || BOUNCE_SUBJECT.test(subject)
    const delay = bounce && /\(delay\)|delayed|temporar|will (retry|try again)/i.test(`${subject} ${m.snippet}`)
    // Rechazo por spam o reputación (no por buzón inexistente): es la señal más grave.
    const blocked =
      bounce &&
      !delay &&
      /blocked|spam|5\.7\.\d|reputation|blacklist|blocklist|block list|policy reasons|rejected for policy/i.test(`${subject} ${m.snippet}`) &&
      !/address not found|user unknown|does(n'?t| not) exist|no such user|5\.1\.1|mailbox unavailable|invalid recipient/i.test(m.snippet)
    const auto = !bounce && (/auto-(replied|generated)/i.test(h['auto-submitted'] ?? '') || Boolean(h['x-autoreply'] || h['x-autorespond']) || /auto_reply/i.test(h.precedence ?? '') || AUTO_SUBJECT.test(subject))
    // La baja del cliente de correo lleva el identificador del contacto en el asunto.
    const token = subject.match(TOKEN_IN)?.[1]
    const c = (token ? contactFromToken(token) : null) ?? contactFor(m, from, subject, bounce, failed)
    const unsub = !bounce ? (token ? 'header' : unsubKind(subject, m.snippet)) : null

    const event = (kind: string, contactId: number | null) =>
      run('INSERT OR IGNORE INTO outreach_events (contactId, mailbox, kind, fromEmail, subject, snippet, threadId, gmailId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        contactId,
        box.email,
        kind,
        from,
        subject.slice(0, 300),
        m.snippet.slice(0, 500),
        m.threadId,
        m.id,
        new Date(Number(m.internalDate) || Date.now()).toISOString(),
      ])

    tx(() => {
      run('INSERT OR IGNORE INTO outreach_seen (gmailId, createdAt) VALUES (?, ?)', [m.id, nowIso()])
      if (!c) return
      if (bounce) {
        if (delay) return
        if (blocked) {
          event('block', c.id)
          run("UPDATE outreach_contacts SET status = 'bounced', nextAt = NULL WHERE id = ? AND status NOT IN ('replied', 'signed_up')", [c.id])
          return
        }
        event('bounce', c.id)
        counts.bounces++
        run("UPDATE outreach_contacts SET status = 'bounced', nextAt = NULL WHERE id = ? AND status NOT IN ('replied', 'signed_up')", [c.id])
        suppress(c.email, 'rebote')
        return
      }
      // La baja va antes que «fuera de la oficina»: algunos clientes la mandan con cabeceras automáticas.
      if (unsub) {
        event('unsubscribe', c.id)
        counts.unsubs++
        run("UPDATE outreach_contacts SET status = 'unsubscribed', nextAt = NULL WHERE id = ?", [c.id])
        suppress(c.email, `baja (${unsub === 'header' ? 'botón' : 'respuesta'})`)
        suppress(`@${c.domain}`, `baja (${unsub === 'header' ? 'botón' : 'respuesta'})`)
        return
      }
      if (auto) {
        // Fuera de la oficina: la secuencia sigue, con dos días más de margen (nunca antes).
        event('auto_reply', c.id)
        counts.auto++
        const cur = one<{ nextAt: string | null }>('SELECT nextAt FROM outreach_contacts WHERE id = ?', [c.id])?.nextAt
        const base = Math.max(Date.now(), cur ? new Date(cur).getTime() : 0)
        run("UPDATE outreach_contacts SET nextAt = ? WHERE id = ? AND status = 'active'", [new Date(base + 2 * DAY_MS).toISOString(), c.id])
        return
      }
      event('reply', c.id)
      counts.replies++
      run("UPDATE outreach_contacts SET status = CASE WHEN status IN ('signed_up') THEN status ELSE 'replied' END, repliedAt = COALESCE(repliedAt, ?), nextAt = NULL WHERE id = ?", [nowIso(), c.id])
    })

    if (c && !bounce && !auto && unsub !== 'header') {
      const own = ownText(m.snippet) || m.snippet
      notifyAdmins(
        unsub ? `Baja de ${c.company || c.domain}` : `Respuesta de ${c.company || c.domain}`,
        `${from} ${unsub ? 'ha pedido no recibir más correos' : 'ha respondido a la campaña'}:\n\n«${own}»\n\n${unsub ? 'Ya no se le escribirá. Si lo has entendido de otra forma, ' : ''}Contéstale desde el buzón ${box.email}: https://mail.google.com/mail/?authuser=${encodeURIComponent(box.email)}#all/${m.threadId}`,
      )
    }
  }
  // Si quedaron mensajes sin leer, la próxima lectura sigue desde el último leído y,
  // mientras tanto, el buzón no envía (podría haber una baja entre lo pendiente).
  const truncated = pending.length > batch.length
  if (truncated) backlog.add(box.email)
  else backlog.delete(box.email)
  const until = truncated && lastDate ? new Date(lastDate).toISOString() : nowIso()
  run('UPDATE outreach_mailboxes SET lastPollAt = ? WHERE email = ?', [until, box.email])
  return counts
}

/**
 * Salud de los últimos 7 días (o desde que se reanudó): un buzón con demasiados rebotes
 * o rechazos por spam se para; la campaña entera, con el doble de rebotes.
 */
function healthCheck(s: Settings) {
  const week = isoIn(-7 * DAY_MS)
  const rows = all<Mailbox>('SELECT * FROM outreach_mailboxes WHERE paused = 0').map((m) => {
    const since = m.resumedAt && m.resumedAt > week ? m.resumedAt : week
    const count = (sql: string) => one<{ n: number }>(sql, [m.email, since])?.n ?? 0
    return {
      mailbox: m.email,
      sent: count('SELECT COUNT(*) AS n FROM outreach_messages WHERE mailbox = ? AND error IS NULL AND sentAt > ?'),
      // Solo avisos de correos enviados en el periodo (los tardíos de antes de reanudar no cuentan).
      bounces: one<{ n: number }>("SELECT COUNT(*) AS n FROM outreach_events e WHERE e.mailbox = ? AND e.kind = 'bounce' AND EXISTS (SELECT 1 FROM outreach_messages x WHERE x.contactId = e.contactId AND x.error IS NULL AND x.sentAt > ?)", [m.email, since])?.n ?? 0,
      blocks: one<{ n: number }>("SELECT COUNT(*) AS n FROM outreach_events e WHERE e.mailbox = ? AND e.kind = 'block' AND EXISTS (SELECT 1 FROM outreach_messages x WHERE x.contactId = e.contactId AND x.error IS NULL AND x.sentAt > ?)", [m.email, since])?.n ?? 0,
    }
  })
  for (const r of rows) {
    // Bloqueos por spam: con 3 y más del 3 % de lo enviado, el buzón para.
    if (r.blocks >= 3 && r.blocks / Math.max(1, r.sent) > 0.03) {
      pauseMailbox(r.mailbox, `${r.blocks} rechazos por spam en 7 días (de ${r.sent} enviados). Revisa el texto y la lista antes de reanudar.`)
      continue
    }
    if (r.sent >= 20 && r.bounces / r.sent > s.maxBounce) {
      pauseMailbox(r.mailbox, `Rebotes del ${((r.bounces / r.sent) * 100).toFixed(1)} % en 7 días (${r.bounces} de ${r.sent}). Revisa la lista antes de reanudar.`)
    }
  }
  if (!s.running) return
  const since = s.startedAt && s.startedAt > week ? s.startedAt : week
  const sent = one<{ n: number }>('SELECT COUNT(*) AS n FROM outreach_messages WHERE error IS NULL AND sentAt > ?', [since])?.n ?? 0
  const bounces = one<{ n: number }>("SELECT COUNT(*) AS n FROM outreach_events e WHERE e.kind = 'bounce' AND EXISTS (SELECT 1 FROM outreach_messages x WHERE x.contactId = e.contactId AND x.error IS NULL AND x.sentAt > ?)", [since])?.n ?? 0
  if (sent >= 50 && bounces / sent > s.maxBounce * 2) {
    saveSettings({ running: false })
    notifyAdmins('Campaña parada por rebotes', `Rebotes del ${((bounces / sent) * 100).toFixed(1)} % (${bounces} de ${sent}). La campaña se ha parado sola para proteger el dominio.`)
  }
}

// ── Registros y pagos que vienen de la campaña ──

export function attribute() {
  const first = one<{ t: string | null }>('SELECT MIN(importedAt) AS t FROM outreach_contacts')?.t
  if (!first) return
  const now = nowIso()
  const candidatesOf = (domain: string) => {
    const d = bareDomain(domain)
    if (!d || FREE_MAIL.has(d)) return []
    // El dominio exacto o el principal (mail.empresa.com → empresa.com).
    const parts = d.split('.')
    return [...new Set(parts.length > 2 ? [d, parts.slice(-2).join('.'), parts.slice(-3).join('.')] : [d])]
  }
  const match = (domain: string, wsId: number | null) => {
    for (const cand of candidatesOf(domain)) {
      run(
        `UPDATE outreach_contacts SET signedUpAt = COALESCE(signedUpAt, ?), nextAt = CASE WHEN status IN ('pending', 'active') THEN NULL ELSE nextAt END,
           status = CASE WHEN status IN ('active', 'done', 'replied', 'failed') THEN 'signed_up' ELSE status END
         WHERE domain = ? AND signedUpAt IS NULL AND status != 'pending'`,
        [now, cand],
      )
      // El espacio se guarda aparte (aunque el registro ya estuviera apuntado) para contar el pago.
      if (wsId) run("UPDATE outreach_contacts SET workspaceId = ? WHERE domain = ? AND workspaceId IS NULL AND status != 'pending'", [wsId, cand])
      // Quien no había recibido nada todavía simplemente sale de la cola.
      run("UPDATE outreach_contacts SET status = 'skipped' WHERE domain = ? AND status = 'pending'", [cand])
    }
  }
  for (const w of all<{ id: number; domain: string }>("SELECT id, domain FROM workspaces WHERE createdAt >= ? AND domain != ''", [first])) match(w.domain, w.id)
  for (const u of all<{ email: string; ws: number | null }>(
    "SELECT u.email, (SELECT m.workspaceId FROM members m WHERE m.userId = u.id AND m.role = 'owner' ORDER BY m.createdAt LIMIT 1) AS ws FROM users u WHERE u.createdAt >= ?",
    [first],
  ))
    match(u.email.split('@')[1] ?? '', u.ws)
  // Pagos: el espacio del contacto (o su agencia) tiene suscripción.
  run(
    `UPDATE outreach_contacts SET paidAt = ? WHERE paidAt IS NULL AND workspaceId IN (
       SELECT id FROM workspaces WHERE plan != 'trial' AND stripeSubscriptionId IS NOT NULL
       UNION SELECT c.id FROM workspaces c JOIN workspaces o ON o.id = c.billingOwnerId WHERE o.stripeSubscriptionId IS NOT NULL)`,
    [now],
  )
}

// ── Programador ──

let busy = false
let lastAttribution = 0

/** Cada 2 minutos: envíos; cada 10, lectura de cada buzón y salud; cada 30, registros y pagos. */
export async function outreachTick() {
  if (busy) return
  busy = true
  try {
    const anyBox = one('SELECT 1 AS x FROM outreach_mailboxes LIMIT 1')
    if (!anyBox) return
    await recoverPending()
    let polled = false
    for (const box of all<Mailbox>('SELECT * FROM outreach_mailboxes')) {
      if (box.lastPollAt && Date.now() - new Date(box.lastPollAt).getTime() < 10 * 60_000 && !backlog.has(box.email)) continue
      polled = true
      try {
        await pollMailbox(box)
      } catch (err) {
        const e = err as GmailError
        const msg = String(e.message ?? err).slice(0, 300)
        if (e.auth && !box.paused) pauseMailbox(box.email, 'El permiso de Google ya no vale: vuelve a conectar el buzón.')
        else {
          run('UPDATE outreach_mailboxes SET lastError = ? WHERE email = ?', [msg, box.email])
          // Una hora sin poder leerlo: se para (sin leer no se envía) y se avisa.
          const since = box.lastPollAt ?? box.createdAt
          if (!box.paused && Date.now() - new Date(since).getTime() > 60 * 60_000) pauseMailbox(box.email, `No se puede leer el buzón desde hace más de una hora: ${msg}`)
        }
      }
    }
    if (polled) healthCheck(settings())
    if (Date.now() - lastAttribution > 30 * 60_000) {
      lastAttribution = Date.now()
      attribute()
    }
    await sendTick()
  } catch (err) {
    reportError(err, 'campaña')
  } finally {
    busy = false
  }
}
