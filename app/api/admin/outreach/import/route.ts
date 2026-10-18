import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { importContacts, type ImportRow } from '@/lib/outreach/engine'

export const dynamic = 'force-dynamic'

// Carga de contactos de la campaña desde los scripts de placton-outreach, por
// tandas de hasta 2.000. Los textos van SIN pie legal: lo añade el enviador. Solo con CRON_SECRET: Authorization: Bearer <secreto>.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? ''
  const got = req.headers.get('authorization') ?? ''
  const want = `Bearer ${secret}`
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as { contacts?: ImportRow[] } | null
  const rows = Array.isArray(body?.contacts) ? body.contacts : null
  if (!rows) return NextResponse.json({ error: 'Falta contacts[]' }, { status: 400 })
  if (rows.length > 2000) return NextResponse.json({ error: 'Como mucho 2.000 por tanda' }, { status: 413 })
  return NextResponse.json(importContacts(rows))
}
