import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { all } from '@/lib/db'
import * as repo from '@/lib/repo'
import { activeRun, lastRun } from '@/lib/tracking'

export const dynamic = 'force-dynamic'

/**
 * Estado de la medición del espacio activo, para la barra de progreso y la
 * pantalla «Preparando tu panel»: respuestas por plataforma y las últimas que
 * han llegado (pregunta, marcas nombradas y si sale la tuya).
 */
export async function GET() {
  const user = await currentUser()
  if (!user?.currentWorkspaceId || !repo.roleIn(user.currentWorkspaceId, user.id)) return NextResponse.json({ active: null }, { status: 401 })
  const wsId = user.currentWorkspaceId
  const active = activeRun(wsId)
  const last = lastRun(wsId)
  const runId = active?.id ?? last?.id
  let byEngine: Record<string, number> = {}
  let recent: { id: number; engine: string; prompt: string; brands: number; own: boolean; cites: number }[] = []
  if (runId) {
    const ws = repo.workspaceById(wsId)
    const ownKey = ws ? repo.trackedBrands(ws)[0]?.key : ''
    byEngine = Object.fromEntries(
      all<{ engine: string; n: number }>('SELECT engine, COUNT(*) AS n FROM answers WHERE runId = ? AND error IS NULL GROUP BY engine', [runId]).map((r) => [r.engine, r.n]),
    )
    recent = all<{ id: number; engine: string; prompt: string; brands: number; own: number; cites: number }>(
      `SELECT a.id, a.engine, p.text AS prompt,
              (SELECT COUNT(*) FROM mentions m WHERE m.answerId = a.id AND m.direct = 1) AS brands,
              (SELECT COUNT(*) FROM mentions m WHERE m.answerId = a.id AND m.brandKey = ?) AS own,
              (SELECT COUNT(*) FROM citations c WHERE c.answerId = a.id) AS cites
       FROM answers a JOIN prompts p ON p.id = a.promptId
       WHERE a.runId = ? AND a.error IS NULL ORDER BY a.id DESC LIMIT 5`,
      [ownKey ?? '', runId],
    ).map((r) => ({ ...r, prompt: r.prompt.slice(0, 110), own: r.own > 0 }))
  }
  return NextResponse.json({
    active: active ? { id: active.id, done: active.done, total: active.total } : null,
    last: last ? { id: last.id, status: last.status, finishedAt: last.finishedAt, day: last.day } : null,
    byEngine,
    recent,
  })
}
