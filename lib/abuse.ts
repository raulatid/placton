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

export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local'
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

/** ¿Otro espacio (de cualquier cuenta) ya usó la prueba gratis con esta web? */
export function trialAlreadyUsed(ws: Workspace): boolean {
  // Una prueba por persona: quien ya tiene otro espacio suyo terminado no estrena prueba.
  if (
    ws.createdBy &&
    all<{ id: number }>(
      "SELECT w.id FROM workspaces w JOIN members m ON m.workspaceId = w.id AND m.userId = ? AND m.role = 'owner' WHERE w.id <> ? AND w.onboarded = 1 AND w.billingOwnerId IS NULL LIMIT 1",
      [ws.createdBy, ws.id],
    ).length
  )
    return true
  if (!ws.domain) return false
  return Boolean(
    all<{ id: number }>("SELECT id FROM workspaces WHERE domain = ? AND id <> ? AND onboarded = 1 LIMIT 1", [ws.domain, ws.id]).length,
  )
}
