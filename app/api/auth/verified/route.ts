import { NextResponse } from 'next/server'
import { currentUser, isEmailVerified } from '@/lib/auth'
import * as repo from '@/lib/repo'

export const dynamic = 'force-dynamic'

// La pantalla del alta pregunta aquí cada pocos segundos si la persona ya confirmó
// su correo, para seguir sola. Devuelve también su correo y el borrador del alta:
// así solo recupera lo elegido si es de esta misma cuenta y de este mismo espacio.
// `finished`: el alta ya está terminada (otra pestaña la acabó mientras esta cargaba),
// con el mismo criterio con el que la página del alta manda al panel.

export async function GET() {
  const user = await currentUser()
  const headers = { 'Cache-Control': 'no-store' }
  if (!user) return NextResponse.json({ verified: false }, { status: 401, headers })
  const draft = repo.onboardingDraftOf(user)
  const finished = !draft && repo.workspacesOf(user.id).some((w) => w.onboarded)
  return NextResponse.json({ verified: isEmailVerified(user), email: user.email, draft: draft?.id ?? null, finished }, { headers })
}
