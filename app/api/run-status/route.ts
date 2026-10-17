import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import * as repo from '@/lib/repo'
import { activeRun, lastRun } from '@/lib/tracking'

export const dynamic = 'force-dynamic'

/** Estado de la medición del espacio activo, para la barra de progreso. */
export async function GET() {
  const user = await currentUser()
  if (!user?.currentWorkspaceId || !repo.roleIn(user.currentWorkspaceId, user.id)) return NextResponse.json({ active: null }, { status: 401 })
  const active = activeRun(user.currentWorkspaceId)
  const last = lastRun(user.currentWorkspaceId)
  return NextResponse.json({
    active: active ? { id: active.id, done: active.done, total: active.total } : null,
    last: last ? { id: last.id, status: last.status, finishedAt: last.finishedAt, day: last.day } : null,
  })
}
