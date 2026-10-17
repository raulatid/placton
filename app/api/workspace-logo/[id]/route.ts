import { currentUser } from '@/lib/auth'
import * as repo from '@/lib/repo'
import { readWorkspaceLogo } from '@/lib/workspaceLogo'

// Logo subido por un espacio: solo lo ven sus miembros. La dirección lleva la
// versión (?v=), así que se puede guardar en caché sin miedo a enseñar uno viejo.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  const user = await currentUser()
  if (!user || !Number.isInteger(id) || !repo.roleIn(id, user.id)) return new Response('Not found', { status: 404 })
  const png = await readWorkspaceLogo(id)
  if (!png) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(png), {
    headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=31536000, immutable' },
  })
}
