import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { all, one } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Consulta interna de soporte: estado de una cuenta por su correo (si existe,
// cómo entra, sus espacios y sus últimos correos). Solo con CRON_SECRET y por
// POST, para que el correo no viaje en la dirección.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const got = req.headers.get('authorization') ?? ''
  const want = `Bearer ${secret}`
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { email, recent } = (await req.json().catch(() => ({}))) as { email?: string; recent?: boolean }
  if (recent) {
    const users = all<{ id: number; email: string; createdAt: string }>('SELECT id, email, createdAt FROM users ORDER BY id DESC LIMIT 5')
    return NextResponse.json(
      users.map((u) => ({
        ...u,
        spaces: all<{ id: number; name: string; domain: string; onboarded: number; plan: string; trialEndsAt: string | null; createdAt: string; runs: number }>(
          "SELECT w.id, w.name, w.domain, w.onboarded, w.plan, w.trialEndsAt, w.createdAt, (SELECT COUNT(*) FROM runs r WHERE r.workspaceId = w.id) AS runs FROM members m JOIN workspaces w ON w.id = m.workspaceId WHERE m.userId = ? AND m.role = 'owner'",
          [u.id],
        ),
      })),
    )
  }
  const e = String(email ?? '').trim().toLowerCase()
  const user = one<{ id: number; createdAt: string; passwordHash: string | null; googleId: string | null; currentWorkspaceId: number | null }>(
    'SELECT id, createdAt, passwordHash, googleId, currentWorkspaceId FROM users WHERE lower(email) = ?',
    [e],
  )
  const emails = all<{ subject: string; kind: string; sent: number; error: string | null; createdAt: string }>(
    'SELECT subject, kind, sent, error, createdAt FROM email_log WHERE lower(toEmail) = ? ORDER BY id DESC LIMIT 10',
    [e],
  )
  const mailHealth = all<{ sent: number; error: string | null; n: number }>('SELECT sent, error, COUNT(*) AS n FROM email_log GROUP BY sent, error ORDER BY n DESC LIMIT 5')
  if (!user) return NextResponse.json({ exists: false, users: one<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0, emails, mailHealth })
  const spaces = all<{ id: number; name: string; role: string; onboarded: number; plan: string; createdAt: string }>(
    'SELECT w.id, w.name, m.role, w.onboarded, w.plan, w.createdAt FROM members m JOIN workspaces w ON w.id = m.workspaceId WHERE m.userId = ?',
    [user.id],
  )
  const sessions = one<{ n: number; last: string | null }>('SELECT COUNT(*) AS n, MAX(createdAt) AS last FROM sessions WHERE userId = ?', [user.id])
  return NextResponse.json({
    exists: true,
    createdAt: user.createdAt,
    google: Boolean(user.googleId),
    password: Boolean(user.passwordHash),
    spaces,
    sessions,
    emails,
    mailHealth,
  })
}
