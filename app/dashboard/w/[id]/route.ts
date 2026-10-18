import { NextResponse, type NextRequest } from 'next/server'
import { currentUser } from '@/lib/auth'
import { appUrl } from '@/lib/email'
import * as repo from '@/lib/repo'

export const dynamic = 'force-dynamic'

// Enlace a un espacio concreto (el del resumen semanal por correo): lo deja como
// espacio activo y lleva al panel. Con una agencia y varios clientes, cada correo
// abre el suyo. Sin sesión, pasa por el acceso y vuelve aquí.

/** Destinos permitidos: lista cerrada, nunca una ruta que venga en el enlace. */
const DEST = new Map([
  ['insights', '/dashboard/insights'],
  ['settings', '/dashboard/settings'],
])

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const wsId = /^\d{1,9}$/.test(id) ? Number(id) : 0
  const to = req.nextUrl.searchParams.get('to') ?? ''
  const dest = DEST.get(to)
  const user = await currentUser()
  if (!user) {
    const back = `/dashboard/w/${wsId}${dest ? `?to=${to}` : ''}`
    return NextResponse.redirect(`${appUrl()}/login?next=${encodeURIComponent(back)}`)
  }
  if (wsId && repo.roleIn(wsId, user.id)) repo.updateUser(user.id, { currentWorkspaceId: wsId })
  return NextResponse.redirect(`${appUrl()}${dest ?? '/dashboard'}`)
}
