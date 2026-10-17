import { NextResponse, type NextRequest } from 'next/server'
import { runDaily } from '@/lib/tracking'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

// Disparador externo de la medición diaria (p. ej. un cron de Railway).
// Protegido con CRON_SECRET: Authorization: Bearer <secreto>.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  // No esperamos a que terminen todas: la medición sigue en segundo plano.
  const started = runDaily()
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20_000))
  const result = await Promise.race([started, timeout])
  return NextResponse.json(result ?? { status: 'en marcha' })
}
