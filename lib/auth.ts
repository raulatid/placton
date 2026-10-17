import 'server-only'
import { cookieDomain } from './email'
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { nowIso, one, run } from './db'
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
