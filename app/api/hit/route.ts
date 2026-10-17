import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { nowIso, run, today } from '@/lib/db'

// Analítica propia y sin cookies: una fila por página vista de la web pública.
// El visitante se cuenta con una huella diaria (IP + navegador + día + secreto),
// que no permite saber quién es ni seguirle de un día a otro.

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|httpx|axios/i

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') ?? ''
    if (BOT.test(ua)) return new NextResponse(null, { status: 204 })
    const body = (await req.json()) as { path?: string; ref?: string; utm?: string; lang?: string }
    const path = String(body.path ?? '/').slice(0, 200)
    if (!path.startsWith('/')) return new NextResponse(null, { status: 204 })
    let refHost = ''
    try {
      refHost = body.ref ? new URL(body.ref).hostname.replace(/^www\./, '') : ''
    } catch {}
    if (refHost.endsWith('placton.tech')) refHost = ''
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    const day = today()
    const visitor = createHash('sha256').update(`${process.env.CRON_SECRET ?? 'placton'}:${ip}:${ua}:${day}`).digest('hex').slice(0, 24)
    const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'movil' : 'ordenador'
    run('INSERT INTO page_views (day, path, refHost, utmSource, visitor, lang, device, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      day,
      path,
      refHost.slice(0, 100),
      String(body.utm ?? '').slice(0, 60),
      visitor,
      String(body.lang ?? '').slice(0, 5),
      device,
      nowIso(),
    ])
  } catch {}
  return new NextResponse(null, { status: 204 })
}
