import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { ipFrom } from '@/lib/abuse'
import { currentUser } from '@/lib/auth'
import { today } from '@/lib/db'
import { beat, leave } from '@/lib/live'
import * as repo from '@/lib/repo'

export const dynamic = 'force-dynamic'

// Latido de «en vivo» (cada 20 s con la pestaña visible). Sin cookies propias: el
// visitante de la web se reconoce con la misma huella diaria que la analítica; en la
// aplicación, por su sesión. No se guarda nada en la base de datos.

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|httpx|axios/i

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') ?? ''
    if (BOT.test(ua)) return new NextResponse(null, { status: 204 })
    const body = (await req.json().catch(() => ({}))) as { path?: string; ref?: string; utm?: string; lang?: string; app?: boolean; leave?: boolean }
    const path = String(body.path ?? '/').slice(0, 200)
    if (!path.startsWith('/')) return new NextResponse(null, { status: 204 })
    const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'movil' : 'ordenador'
    let key = ''
    let email: string | undefined
    let workspace: string | undefined
    if (body.app) {
      const user = await currentUser()
      if (!user) return new NextResponse(null, { status: 204 })
      key = `u:${user.id}`
      email = user.email
      workspace = user.currentWorkspaceId ? (repo.workspaceById(user.currentWorkspaceId)?.name ?? '') : ''
    } else {
      key = createHash('sha256').update(`${process.env.CRON_SECRET ?? 'placton'}:${ipFrom(req.headers)}:${ua}:${today()}`).digest('hex').slice(0, 24)
    }
    if (body.leave) {
      leave(key)
      return new NextResponse(null, { status: 204 })
    }
    let ref = ''
    try {
      ref = body.ref ? new URL(body.ref).hostname.replace(/^www\./, '') : ''
    } catch {}
    if (ref.endsWith('placton.tech')) ref = ''
    beat({ key, kind: body.app ? 'app' : 'web', path, ref: ref.slice(0, 100), utm: String(body.utm ?? '').slice(0, 60), lang: String(body.lang ?? '').slice(0, 5), device, email, workspace })
  } catch {}
  return new NextResponse(null, { status: 204 })
}
