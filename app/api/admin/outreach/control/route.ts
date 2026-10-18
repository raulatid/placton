import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { all, nowIso, one, run } from '@/lib/db'
import { capFor, saveSettings, sentLast24h, settings, type Mailbox } from '@/lib/outreach/engine'

export const dynamic = 'force-dynamic'

// Mando interno de la campaña (solo con CRON_SECRET): estado, poner en marcha o parar,
// reanudar un buzón y fijar el inicio de su calentamiento. Lo mismo que el panel, por API.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const got = req.headers.get('authorization') ?? ''
  const want = `Bearer ${secret}`
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const body = raw && typeof raw === 'object' ? raw : {}
  // Todo se valida antes de cambiar nada.
  const running = typeof body.running === 'boolean' ? body.running : undefined
  const resume = typeof body.resume === 'string' ? body.resume : undefined
  const w = body.warmupFrom as { email?: unknown; date?: unknown } | undefined
  const warm = w && typeof w.email === 'string' && typeof w.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? { email: w.email, date: w.date } : undefined
  if (running !== undefined) saveSettings({ running })
  if (resume) run('UPDATE outreach_mailboxes SET paused = 0, pausedReason = NULL, nextSendAt = NULL, resumedAt = ? WHERE email = ?', [nowIso(), resume])
  if (warm) run('UPDATE outreach_mailboxes SET warmupFrom = ? WHERE email = ?', [`${warm.date}T00:00:00.000Z`, warm.email])
  const s = settings()
  return NextResponse.json({
    running: s.running,
    mailboxes: all<Mailbox>('SELECT * FROM outreach_mailboxes').map((m) => ({ email: m.email, name: m.name, paused: Boolean(m.paused), pausedReason: m.pausedReason, cap: capFor(m, s), sent24: sentLast24h(m.email), lastPollAt: m.lastPollAt, lastError: m.lastError })),
    contacts: Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outreach_contacts GROUP BY status').map((r) => [r.status, r.n])),
    sent: one<{ n: number }>('SELECT COUNT(*) AS n FROM outreach_messages WHERE error IS NULL')?.n ?? 0,
    events: Object.fromEntries(all<{ kind: string; n: number }>('SELECT kind, COUNT(*) AS n FROM outreach_events GROUP BY kind').map((r) => [r.kind, r.n])),
  })
}
