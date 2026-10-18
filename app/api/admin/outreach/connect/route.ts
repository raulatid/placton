import { NextResponse, type NextRequest } from 'next/server'
import { currentUser, isAdmin, randomToken } from '@/lib/auth'
import { appUrl, cookieDomain } from '@/lib/email'
import { OUTREACH_COOKIE } from '@/lib/outreach/connect'
import { outreachAuthUrl, outreachGoogleReady } from '@/lib/outreach/gmail'

// «Conectar buzón» del panel de la campaña: lleva al permiso de Google del buzón de envío.
export async function GET(req: NextRequest) {
  const user = await currentUser()
  if (!user || !isAdmin(user)) return NextResponse.redirect(`${appUrl()}/admin`)
  if (!outreachGoogleReady()) return NextResponse.redirect(`${appUrl()}/admin/outreach?error=${encodeURIComponent('Falta el cliente de Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).')}`)
  const state = randomToken(16)
  const name = (req.nextUrl.searchParams.get('name') ?? '').slice(0, 60)
  const res = NextResponse.redirect(outreachAuthUrl(state, req.nextUrl.searchParams.get('hint') ?? undefined))
  res.cookies.set(OUTREACH_COOKIE, JSON.stringify({ state, name }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    domain: cookieDomain(),
  })
  return res
}
