import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { all, nowIso, one, run } from '@/lib/db'
import { capFor, saveSettings, sentLast24h, settings, type Mailbox } from '@/lib/outreach/engine'

export const dynamic = 'force-dynamic'

const round = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Coste de las mediciones en producción: medio por respuesta y por motor, solo
 * respuestas originales (las copias de otro espacio no pagan búsqueda), y medio
 * por prompt y pasada (lo que suman las respuestas originales de un prompt en
 * una misma medición). Los errores y las copias van aparte.
 */
function measurementCosts(days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const engines = all<{ engine: string; n: number; total: number }>(
    'SELECT engine, COUNT(*) AS n, COALESCE(SUM(costUsd), 0) AS total FROM answers WHERE createdAt >= ? AND reusedFrom IS NULL AND error IS NULL GROUP BY engine ORDER BY total DESC',
    [since],
  )
  const answers = engines.reduce((a, e) => a + e.n, 0)
  const total = engines.reduce((a, e) => a + e.total, 0)
  const passes = one<{ n: number; avg: number | null; perPass: number | null }>(
    `SELECT COUNT(*) AS n, AVG(c) AS avg, AVG(k) AS perPass FROM (
       SELECT SUM(costUsd) AS c, COUNT(*) AS k FROM answers WHERE createdAt >= ? AND reusedFrom IS NULL AND error IS NULL GROUP BY runId, promptId)`,
    [since],
  )
  const errors = one<{ n: number; c: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(costUsd), 0) AS c FROM answers WHERE createdAt >= ? AND error IS NOT NULL', [since])
  const reused = one<{ n: number; c: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(costUsd), 0) AS c FROM answers WHERE createdAt >= ? AND reusedFrom IS NOT NULL AND error IS NULL', [since])
  return {
    days,
    since,
    answers,
    perAnswer: answers ? round(total / answers) : 0,
    engines: Object.fromEntries(engines.map((e) => [e.engine, { answers: e.n, perAnswer: round(e.total / e.n), total: round(e.total) }])),
    // Lo que cuesta medir un prompt en una pasada, con las respuestas originales que tuvo.
    perPromptPass: round(passes?.avg ?? 0),
    passes: passes?.n ?? 0,
    answersPerPass: Math.round((passes?.perPass ?? 0) * 100) / 100,
    // Un prompt medido en todos los motores sin compartir nada: suma de las medias por motor.
    perPromptAllEngines: round(engines.reduce((a, e) => a + e.total / e.n, 0)),
    errors: { answers: errors?.n ?? 0, costUsd: round(errors?.c ?? 0) },
    reused: { answers: reused?.n ?? 0, costUsd: round(reused?.c ?? 0) },
    total: round(total + (errors?.c ?? 0) + (reused?.c ?? 0)),
  }
}

// Mando interno de la campaña (solo con CRON_SECRET): estado, poner en marcha o parar,
// reanudar un buzón y fijar el inicio de su calentamiento. Lo mismo que el panel, por API.
// También da el coste de las mediciones (últimos 14 días, o «costsDays» de 1 a 90).
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
  const costsDays = typeof body.costsDays === 'number' && Number.isInteger(body.costsDays) && body.costsDays >= 1 && body.costsDays <= 90 ? body.costsDays : 14
  // Ajustes de ritmo (los mismos del panel), validados: tope semana a semana, hueco entre envíos y horario.
  const st = body.settings as { ramp?: unknown; gapMin?: unknown; gapMax?: unknown; fromHour?: unknown; toHour?: unknown } | undefined
  const patch: Record<string, unknown> = {}
  if (st && Array.isArray(st.ramp) && st.ramp.length && st.ramp.every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 200)) patch.ramp = st.ramp
  if (st && typeof st.gapMin === 'number' && typeof st.gapMax === 'number' && st.gapMin >= 1 && st.gapMax >= st.gapMin) Object.assign(patch, { gapMin: st.gapMin, gapMax: st.gapMax })
  if (st && typeof st.fromHour === 'number' && typeof st.toHour === 'number' && st.fromHour >= 0 && st.toHour <= 24 && st.fromHour < st.toHour) Object.assign(patch, { fromHour: st.fromHour, toHour: st.toHour })
  if (Object.keys(patch).length) saveSettings(patch)
  if (running !== undefined) saveSettings({ running })
  if (resume) run('UPDATE outreach_mailboxes SET paused = 0, pausedReason = NULL, nextSendAt = NULL, resumedAt = ? WHERE email = ?', [nowIso(), resume])
  if (warm) run('UPDATE outreach_mailboxes SET warmupFrom = ? WHERE email = ?', [`${warm.date}T00:00:00.000Z`, warm.email])
  const s = settings()
  return NextResponse.json({
    running: s.running,
    settings: { ramp: s.ramp, gapMin: s.gapMin, gapMax: s.gapMax, fromHour: s.fromHour, toHour: s.toHour, days: s.days },
    mailboxes: all<Mailbox>('SELECT * FROM outreach_mailboxes').map((m) => ({ email: m.email, name: m.name, paused: Boolean(m.paused), pausedReason: m.pausedReason, cap: capFor(m, s), sent24: sentLast24h(m.email), lastPollAt: m.lastPollAt, lastError: m.lastError })),
    contacts: Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outreach_contacts GROUP BY status').map((r) => [r.status, r.n])),
    sent: one<{ n: number }>('SELECT COUNT(*) AS n FROM outreach_messages WHERE error IS NULL')?.n ?? 0,
    events: Object.fromEntries(all<{ kind: string; n: number }>('SELECT kind, COUNT(*) AS n FROM outreach_events GROUP BY kind').map((r) => [r.kind, r.n])),
    // Últimos errores del servidor (los mismos que se avisan por correo), para diagnosticar sin entrar al panel.
    errors: all<{ createdAt: string; path: string; message: string }>('SELECT createdAt, path, substr(message, 1, 600) AS message FROM error_log ORDER BY id DESC LIMIT 15'),
    costs: measurementCosts(costsDays),
  })
}
