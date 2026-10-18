import { type NextRequest } from 'next/server'
import { finishConnect } from '@/lib/outreach/connect'

// Vuelta de Google con un cliente OAuth propio de la campaña (OUTREACH_GOOGLE_CLIENT_ID).
// Con el cliente de Placton, la vuelta llega a /api/auth/google/callback y se reparte allí.
export async function GET(req: NextRequest) {
  return finishConnect(req)
}
