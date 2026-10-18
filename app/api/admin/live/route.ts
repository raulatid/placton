import { NextResponse } from 'next/server'
import { currentUser, isAdmin } from '@/lib/auth'
import { all, one } from '@/lib/db'
import { snapshot } from '@/lib/live'

export const dynamic = 'force-dynamic'

// Datos de «En vivo» para el panel de administración (se piden cada 5 segundos).
export async function GET() {
  const user = await currentUser()
  if (!user || !isAdmin(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { now, series } = snapshot()
  const since = new Date(Date.now() - 30 * 60_000).toISOString()
  const last30 = {
    visitors: one<{ n: number }>('SELECT COUNT(DISTINCT visitor) AS n FROM page_views WHERE createdAt >= ?', [since])?.n ?? 0,
    views: one<{ n: number }>('SELECT COUNT(*) AS n FROM page_views WHERE createdAt >= ?', [since])?.n ?? 0,
    pages: all<{ path: string; n: number }>('SELECT path, COUNT(*) AS n FROM page_views WHERE createdAt >= ? GROUP BY path ORDER BY n DESC LIMIT 5', [since]),
    signups: one<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE createdAt >= ?', [since])?.n ?? 0,
  }
  const t = Date.now()
  return NextResponse.json({
    at: t,
    now: now.map((e) => ({ kind: e.kind, path: e.path, ref: e.ref, utm: e.utm, lang: e.lang, device: e.device, seconds: Math.round((t - e.firstSeen) / 1000), pages: e.pages, email: e.email, workspace: e.workspace })),
    series,
    last30,
  })
}
