import 'server-only'
import { appUrl, cookieDomain, sendEmail } from './email'
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { nowIso, one, run } from './db'
import { makeT, type Lang } from './i18n-shared'
import * as repo from './repo'
import type { Role, User, Workspace } from './types'

// Sesiones propias: un token aleatorio en una cookie httpOnly y su hash en la
// base. Si alguien lee la base, no puede suplantar a nadie con lo que hay dentro.

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export const SESSION_COOKIE = 'placton_sesion'
const SESSION_DAYS = 30

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const [algo, saltB64, hashB64] = stored.split('$')
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'La contraseña necesita al menos 8 caracteres.'
  if (password.length > 200) return 'La contraseña es demasiado larga.'
  return null
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function startSession(userId: number) {
  const token = randomToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  run('INSERT INTO sessions (id, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)', [hashToken(token), userId, expires.toISOString(), nowIso()])
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
    domain: cookieDomain(),
  })
}

export async function endSession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) run('DELETE FROM sessions WHERE id = ?', [hashToken(token)])
  store.set(SESSION_COOKIE, '', { path: '/', maxAge: 0, domain: cookieDomain() })
}

export function endAllSessions(userId: number) {
  run('DELETE FROM sessions WHERE userId = ?', [userId])
}

/** Cierra las demás sesiones de la persona y conserva la de este navegador. */
export async function endOtherSessions(userId: number) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  run('DELETE FROM sessions WHERE userId = ? AND id <> ?', [userId, token ? hashToken(token) : ''])
}

export const currentUser = cache(async (): Promise<User | null> => {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const row = one<{ userId: number; expiresAt: string }>('SELECT userId, expiresAt FROM sessions WHERE id = ?', [hashToken(token)])
  if (!row || new Date(row.expiresAt).getTime() < Date.now()) return null
  return repo.userById(row.userId)
})

/**
 * Adónde volver tras entrar: solo rutas propias del panel o de administración
 * (nunca otra web, para que el enlace de acceso no sirva para redirigir fuera).
 */
export function safeNext(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return /^\/(admin|dashboard)(\/[\w\-/]*)?(\?[\w=&%.-]*)?$/.test(s) ? s : null
}

export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser()
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  return user
}

export interface Ctx {
  user: User
  workspace: Workspace
  role: Role
}

/**
 * Usuario + espacio activo. Sin espacio o sin alta terminada, manda al alta.
 * Con `allowLocked` deja pasar aunque la prueba haya caducado (ajustes, planes).
 */
export const requireCtx = cache(async (opts?: { allowUnonboarded?: boolean }): Promise<Ctx> => {
  const user = await requireUser()
  let ws: Workspace | null = null
  let role: Role | null = null
  if (user.currentWorkspaceId) {
    role = repo.roleIn(user.currentWorkspaceId, user.id)
    if (role) ws = repo.workspaceById(user.currentWorkspaceId)
  }
  if (!ws || !role) {
    const first = repo.workspacesOf(user.id)[0]
    if (first) {
      repo.updateUser(user.id, { currentWorkspaceId: first.id })
      ws = first
      role = first.role
    }
  }
  if (!ws || !role) redirect('/onboarding')
  if (!ws.onboarded && !opts?.allowUnonboarded) {
    // Un espacio a medias no bloquea el panel si la persona ya tiene otro terminado.
    const done = repo.workspacesOf(user.id).find((w) => w.onboarded)
    if (!done) redirect('/onboarding')
    repo.updateUser(user.id, { currentWorkspaceId: done.id })
    return { user, workspace: done, role: done.role }
  }
  return { user, workspace: ws, role }
})

export function canManage(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

/** ¿Es administrador? Su correo está en la lista y lo ha verificado entrando con Google. */
export function isAdmin(user: { email: string; googleId?: string | null }): boolean {
  return Boolean(user.googleId) && isAdminEmail(user.email)
}

export function isAdminEmail(email: string): boolean {
  const list = (process.env.PLACTON_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(email.toLowerCase())
}

/* ───────────── Recuperar contraseña ───────────── */

export function createPasswordReset(userId: number): string {
  const token = randomToken()
  run('INSERT INTO password_resets (token, userId, expiresAt) VALUES (?, ?, ?)', [
    hashToken(token),
    userId,
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  ])
  return token
}

export function consumePasswordReset(token: string): number | null {
  const row = one<{ userId: number; expiresAt: string; usedAt: string | null }>('SELECT userId, expiresAt, usedAt FROM password_resets WHERE token = ?', [
    hashToken(token),
  ])
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) return null
  run('UPDATE password_resets SET usedAt = ? WHERE token = ?', [nowIso(), hashToken(token)])
  return row.userId
}

export function peekPasswordReset(token: string): boolean {
  const row = one<{ expiresAt: string; usedAt: string | null }>('SELECT expiresAt, usedAt FROM password_resets WHERE token = ?', [hashToken(token)])
  return Boolean(row && !row.usedAt && new Date(row.expiresAt).getTime() > Date.now())
}

/* ───────────── Confirmar el correo ───────────── */

// Quien se registra con contraseña confirma su correo antes de la primera medición
// (cada una cuesta dinero en API). Google ya lo da por confirmado. El enlace lleva
// una firma HMAC de la persona, su correo y la caducidad: no se guarda nada en la
// base y deja de valer si cambia el correo.

const VERIFY_HOURS = 48

function verifySecret(): string {
  return process.env.PLACTON_EMAIL_SECRET || process.env.CRON_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'placton-local')
}

function verifySig(secret: string, userId: number, email: string, exp: number): string {
  return createHmac('sha256', secret).update(`verify:${userId}:${email.trim().toLowerCase()}:${exp}`).digest('base64url').slice(0, 24)
}

/** ¿Tiene el correo confirmado? (Google cuenta como confirmado). */
export function isEmailVerified(user: Pick<User, 'emailVerifiedAt' | 'googleId'>): boolean {
  return Boolean(user.emailVerifiedAt || user.googleId)
}

/** Enlace firmado para confirmar el correo (caduca en 48 h); null sin clave configurada. */
export function emailVerifyUrl(user: Pick<User, 'id' | 'email'>): string | null {
  const secret = verifySecret()
  if (!secret) return null
  const exp = Math.floor(Date.now() / 1000) + VERIFY_HOURS * 3600
  return `${appUrl()}/api/auth/verify/${user.id.toString(36)}.${exp.toString(36)}.${verifySig(secret, user.id, user.email, exp)}`
}

/** Comprueba el enlace: «expired» solo si la firma es buena pero ya pasó su plazo. */
export function readEmailVerifyToken(token: string): { status: 'ok' | 'expired'; user: User } | { status: 'invalid' } {
  const secret = verifySecret()
  const m = /^([0-9a-z]{1,10})\.([0-9a-z]{1,10})\.([\w-]{24})$/.exec(token)
  if (!secret || !m) return { status: 'invalid' }
  const userId = parseInt(m[1], 36)
  const exp = parseInt(m[2], 36)
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(exp)) return { status: 'invalid' }
  const user = repo.userById(userId)
  if (!user) return { status: 'invalid' }
  const expected = Buffer.from(verifySig(secret, userId, user.email, exp))
  const got = Buffer.from(m[3])
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { status: 'invalid' }
  return { status: exp * 1000 < Date.now() ? 'expired' : 'ok', user }
}

/**
 * Envía el correo de confirmación en el idioma de la persona. Sin clave para firmar
 * (no debería pasar en producción) no se bloquea a nadie: se da por confirmado.
 */
export async function sendVerificationEmail(user: Pick<User, 'id' | 'email' | 'firstName'>, lang: Lang, opts?: { invite?: boolean }): Promise<{ sent: boolean; url: string | null }> {
  const url = emailVerifyUrl(user)
  if (!url) {
    console.error('[placton] falta PLACTON_EMAIL_SECRET o CRON_SECRET: el correo se da por confirmado sin enlace')
    repo.markEmailVerified(user.id)
    return { sent: false, url: null }
  }
  const t = makeT(lang)
  const sent = await sendEmail({
    to: user.email,
    subject: t('Confirm your email for Placton', 'Confirma tu correo de Placton'),
    kind: 'verify',
    title: user.firstName ? t(`Hi ${user.firstName}, confirm your email`, `Hola, ${user.firstName}: confirma tu correo`) : t('Confirm your email', 'Confirma tu correo'),
    body: opts?.invite
      ? t(
          'Tap the button to confirm that this address is yours and finish creating your account.\n\nThe link expires in 48 hours. If you did not create a Placton account, just ignore this email.',
          'Pulsa el botón para confirmar que este correo es tuyo y terminar de crear tu cuenta.\n\nEl enlace caduca en 48 horas. Si no has creado una cuenta en Placton, ignora este correo.',
        )
      : t(
          'Tap the button to confirm that this address is yours. As soon as you do, we start measuring what AI says about your brand.\n\nThe link expires in 48 hours. If you did not create a Placton account, just ignore this email.',
          'Pulsa el botón para confirmar que este correo es tuyo. En cuanto lo hagas, empezamos a medir qué dicen las IA de tu marca.\n\nEl enlace caduca en 48 horas. Si no has creado una cuenta en Placton, ignora este correo.',
        ),
    cta: { label: t('Confirm my email', 'Confirmar mi correo'), url },
    lang,
  })
  return { sent, url }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Página mínima para los enlaces que llegan sin pasar por la app (confirmar el correo, avisos de Google). */
export function authNoticePage(lang: Lang, title: string, text: string, link?: { label: string; url: string }): Response {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f7f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c1b1f">
<div style="max-width:440px;margin:0 auto;padding:64px 20px">
<div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:24px">placton</div>
<div style="background:#fff;border:1px solid #e3e9e7;border-radius:16px;padding:28px">
<h1 style="font-size:20px;line-height:1.3;margin:0 0 10px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#33464b;margin:0">${esc(text)}</p>
${link ? `<a href="${esc(link.url)}" style="display:inline-block;margin-top:20px;background:#0b3b3c;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${esc(link.label)}</a>` : ''}
</div></div></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
