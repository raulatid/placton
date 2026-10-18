import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { appUrl } from '../email'
import { googleRedirectUri } from '../google'

// Buzones de la campaña por la API de Gmail (HTTPS). Railway, en el plan Hobby,
// corta el SMTP saliente; la API va por el puerto 443 y además deja leer las
// respuestas y los rebotes del mismo buzón.
//
// Cada buzón se conecta una vez con OAuth (botón «Conectar buzón» del panel).
// Por defecto se usa el mismo cliente de Google que el acceso de Placton
// (GOOGLE_CLIENT_ID/SECRET, proyecto «placton», con la API de Gmail activada) y su
// misma URI de retorno, que ya está dada de alta: la vuelta de Google se reparte
// en /api/auth/google/callback según la cookie. Si algún día se crea un cliente
// propio (OUTREACH_GOOGLE_CLIENT_ID/SECRET), vuelve a /api/admin/outreach/callback.

const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly']
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const own = () => Boolean(process.env.OUTREACH_GOOGLE_CLIENT_ID && process.env.OUTREACH_GOOGLE_CLIENT_SECRET)
const clientId = () => (own() ? process.env.OUTREACH_GOOGLE_CLIENT_ID : process.env.GOOGLE_CLIENT_ID) ?? ''
const clientSecret = () => (own() ? process.env.OUTREACH_GOOGLE_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET) ?? ''

export function outreachGoogleReady(): boolean {
  return Boolean(clientId() && clientSecret())
}

export function outreachRedirectUri(): string {
  return own() ? `${appUrl()}/api/admin/outreach/callback` : googleRedirectUri()
}

export function outreachAuthUrl(state: string, hint?: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: outreachRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Siempre el consentimiento: es lo que hace que Google entregue el permiso duradero.
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  })
  if (hint) params.set('login_hint', hint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/** Canjea el código de vuelta por el permiso duradero y dice de qué buzón es. */
export async function exchangeCode(code: string): Promise<{ email: string; refreshToken: string } | { error: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: outreachRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error_description?: string }
  if (!res.ok || !data.access_token) return { error: data.error_description || `Google respondió ${res.status}` }
  if (!data.refresh_token) return { error: 'Google no ha dado permiso duradero. Quita el acceso de la app en la cuenta y vuelve a conectar.' }
  const granted = (data.scope ?? '').split(' ')
  if (!SCOPES.every((s) => granted.includes(s))) return { error: 'Faltan permisos: marca las dos casillas (enviar y leer correo) al conectar.' }
  const profile = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${data.access_token}` } })
  const p = (await profile.json().catch(() => ({}))) as { emailAddress?: string }
  if (!p.emailAddress) return { error: 'No se pudo leer el buzón conectado.' }
  return { email: p.emailAddress.toLowerCase(), refreshToken: data.refresh_token }
}

// ── Permisos guardados cifrados (AES-256-GCM) ──
// La clave sale de OUTREACH_SECRET (o de CRON_SECRET): sin ella, la base de
// datos sola no sirve para mandar correo desde los buzones.

function key(): Buffer {
  const secret = process.env.OUTREACH_SECRET || process.env.CRON_SECRET
  if (!secret) throw new Error('Falta OUTREACH_SECRET o CRON_SECRET para cifrar los permisos de los buzones')
  return createHash('sha256').update(`placton-outreach:${secret}`).digest()
}

export function seal(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.')
}

export function unseal(sealed: string): string {
  const [iv, tag, enc] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', key(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

// ── Llamadas a Gmail ──

export class GmailError extends Error {
  constructor(
    message: string,
    public status: number,
    /** El permiso ya no vale (revocado o caducado): hay que volver a conectar. */
    public auth = false,
  ) {
    super(message)
  }
}

const tokens = new Map<string, { token: string; until: number }>()

async function accessToken(email: string, sealedRefresh: string): Promise<string> {
  const hit = tokens.get(email)
  if (hit && hit.until > Date.now() + 60_000) return hit.token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: unseal(sealedRefresh),
      grant_type: 'refresh_token',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    // Cualquier rechazo del permiso (400/401) es del buzón, nunca de un contacto.
    throw new GmailError(data.error_description || data.error || `token ${res.status}`, res.status, res.status === 400 || res.status === 401 || data.error === 'invalid_grant')
  }
  tokens.set(email, { token: data.access_token, until: Date.now() + (data.expires_in ?? 3600) * 1000 })
  return data.access_token
}

export interface Box {
  email: string
  refreshToken: string
}

async function call<T>(box: Box, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(box.email, box.refreshToken)
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    if (res.status === 401) tokens.delete(box.email)
    throw new GmailError(body.error?.message || `Gmail ${res.status}`, res.status, res.status === 401)
  }
  return (await res.json()) as T
}

/** Envía un mensaje ya montado (RFC 5322). Con threadId va en el mismo hilo. */
export async function sendRaw(box: Box, raw: string, threadId?: string | null): Promise<{ id: string; threadId: string }> {
  return call(box, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: Buffer.from(raw, 'utf8').toString('base64url'), ...(threadId ? { threadId } : {}) }) })
}

export interface GmailHeaders {
  id: string
  threadId: string
  snippet: string
  labelIds: string[]
  internalDate: string
  headers: Record<string, string>
}

const WANTED = ['From', 'To', 'Subject', 'Message-ID', 'In-Reply-To', 'References', 'Auto-Submitted', 'X-Autoreply', 'X-Autorespond', 'Precedence', 'X-Failed-Recipients', 'Content-Type']

/** Cabeceras y comienzo del texto de un mensaje (sin descargar el cuerpo entero). */
export async function getHeaders(box: Box, id: string): Promise<GmailHeaders> {
  const q = new URLSearchParams({ format: 'metadata' })
  for (const h of WANTED) q.append('metadataHeaders', h)
  const m = await call<{ id: string; threadId: string; snippet?: string; labelIds?: string[]; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }>(box, `/messages/${id}?${q}`)
  const headers: Record<string, string> = {}
  for (const h of m.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value
  return { id: m.id, threadId: m.threadId, snippet: m.snippet ?? '', labelIds: m.labelIds ?? [], internalDate: m.internalDate ?? '0', headers }
}

/**
 * Mensajes recibidos (no enviados por el buzón) desde una fecha, los más nuevos primero.
 * También los de Spam y Papelera: una respuesta o una baja que cae ahí cuenta igual.
 */
export async function listReceived(box: Box, sinceSec: number, max = 3000): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = []
  let pageToken: string | undefined
  do {
    const q = new URLSearchParams({ q: `-in:sent -in:drafts -in:chats after:${sinceSec}`, maxResults: '500', includeSpamTrash: 'true' })
    if (pageToken) q.set('pageToken', pageToken)
    const page = await call<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(box, `/messages?${q}`)
    out.push(...(page.messages ?? []))
    pageToken = page.nextPageToken
  } while (pageToken && out.length < max)
  return out
}

/** Comprueba que el permiso del buzón sigue valiendo. */
export async function profile(box: Box): Promise<{ emailAddress: string; messagesTotal: number }> {
  return call(box, '/profile')
}

/** Mensajes de un hilo (id, etiquetas y fecha), para comprobar si ha llegado algo antes de un seguimiento. */
export async function threadMessages(box: Box, threadId: string): Promise<{ id: string; labelIds: string[]; internalDate: string }[]> {
  const t = await call<{ messages?: { id: string; labelIds?: string[]; internalDate?: string }[] }>(box, `/threads/${threadId}?format=minimal`)
  return (t.messages ?? []).map((m) => ({ id: m.id, labelIds: m.labelIds ?? [], internalDate: m.internalDate ?? '0' }))
}

/** ¿Salió ya un correo a esta dirección desde una fecha? (para no repetir un envío que quedó en duda) */
export async function findSent(box: Box, to: string, sinceSec: number): Promise<{ id: string; threadId: string; subject: string; messageId: string } | null> {
  const q = new URLSearchParams({ q: `in:sent to:${to} after:${sinceSec}`, maxResults: '5', includeSpamTrash: 'true' })
  const page = await call<{ messages?: { id: string; threadId: string }[] }>(box, `/messages?${q}`)
  const hit = page.messages?.[0]
  if (!hit) return null
  const h = await getHeaders(box, hit.id)
  return { id: hit.id, threadId: hit.threadId, subject: h.headers.subject ?? '', messageId: h.headers['message-id'] ?? '' }
}
