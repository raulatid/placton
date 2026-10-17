import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { all, nowIso, one, run } from './db'
import type { Workspace } from './types'

// Freno a quien encadena pruebas gratis (cada una cuesta dinero en API):
// - como mucho 3 cuentas nuevas por conexión (IP) cada 24 horas;
// - una sola prueba por web: si otra cuenta ya probó ese dominio, la nueva
//   empieza sin prueba y tiene que elegir un plan.
// La IP no se guarda: solo su huella con un secreto, para poder contar.

const MAX_SIGNUPS_PER_IP_DAY = 3

/** IP real: la última entrada de X-Forwarded-For la pone el proxy de Railway; las anteriores las puede inventar quien llama. */
export function ipFrom(h: Headers): string {
  const chain = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return chain[chain.length - 1] || h.get('x-real-ip') || 'local'
}

export async function clientIp(): Promise<string> {
  return ipFrom(await headers())
}

export function ipHash(ip: string): string {
  return createHash('sha256').update(`${process.env.CRON_SECRET ?? 'placton'}:${ip}`).digest('hex').slice(0, 32)
}

export function signupAllowed(ip: string): boolean {
  if (ip === 'local') return true
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const n = one<{ n: number }>('SELECT COUNT(*) AS n FROM signup_log WHERE ipHash = ? AND createdAt > ?', [ipHash(ip), since])?.n ?? 0
  return n < MAX_SIGNUPS_PER_IP_DAY
}

export function recordSignup(ip: string) {
  run('INSERT INTO signup_log (ipHash, createdAt) VALUES (?, ?)', [ipHash(ip), nowIso()])
}

/** Dominio comparable: sin «www.», «m.» ni punto final. */
export function trialDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/\.$/, '').replace(/^(www|m)\./, '')
}

/** Apunta una prueba gratis como usada, para siempre (aunque luego se borre el espacio o la cuenta). */
export function recordTrial(ws: Workspace) {
  run('INSERT OR IGNORE INTO trial_log (workspaceId, userId, domain, createdAt) VALUES (?, ?, ?, ?)', [ws.id, ws.createdBy, trialDomain(ws.domain), nowIso()])
}

/** ¿Otra prueba (de cualquier cuenta, aunque ya no exista) usó esta web? */
export function domainTrialUsed(domain: string, exceptWorkspaceId: number): boolean {
  const d = trialDomain(domain)
  return Boolean(d && one('SELECT 1 AS x FROM trial_log WHERE domain = ? AND workspaceId <> ? LIMIT 1', [d, exceptWorkspaceId]))
}

/**
 * Por qué un espacio no estrena prueba gratis: «persona» si quien lo crea ya
 * usó una prueba, «web» si otra cuenta ya probó ese dominio. Cuenta también lo
 * borrado (registro permanente). Las cuentas de administración siempre la tienen.
 */
export function trialBlockReason(ws: Workspace): 'persona' | 'web' | null {
  if (ws.createdBy) {
    const creator = one<{ email: string; googleId: string | null }>('SELECT email, googleId FROM users WHERE id = ?', [ws.createdBy])
    const admins = (process.env.PLACTON_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (creator?.googleId && admins.includes(creator.email.toLowerCase())) return null
    if (one('SELECT 1 AS x FROM trial_log WHERE userId = ? AND workspaceId <> ? LIMIT 1', [ws.createdBy, ws.id])) return 'persona'
    if (
      all<{ id: number }>(
        "SELECT w.id FROM workspaces w JOIN members m ON m.workspaceId = w.id AND m.userId = ? AND m.role = 'owner' WHERE w.id <> ? AND w.onboarded = 1 AND w.billingOwnerId IS NULL LIMIT 1",
        [ws.createdBy, ws.id],
      ).length
    )
      return 'persona'
  }
  if (ws.domain && domainTrialUsed(ws.domain, ws.id)) return 'web'
  if (ws.domain && all<{ id: number }>('SELECT id FROM workspaces WHERE domain = ? AND id <> ? AND onboarded = 1 LIMIT 1', [ws.domain, ws.id]).length) return 'web'
  return null
}

export function trialAlreadyUsed(ws: Workspace): boolean {
  return trialBlockReason(ws) !== null
}
