import { NextResponse, type NextRequest } from 'next/server'
import { randomToken } from '@/lib/auth'
import { appUrl, cookieDomain } from '@/lib/email'
import { googleAuthUrl, googleReady } from '@/lib/google'

// Las redirecciones van a direcciones absolutas de la app: dentro del contenedor
// req.url vale https://localhost:8080 y llevaría al usuario a una página rota.
export async function GET(req: NextRequest) {
  if (!googleReady()) return NextResponse.redirect(`${appUrl()}/login`)
  const state = randomToken(16)
  const invite = req.nextUrl.searchParams.get('invite') ?? ''
  const res = NextResponse.redirect(googleAuthUrl(state))
  res.cookies.set('placton_oauth', JSON.stringify({ state, invite }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    domain: cookieDomain(),
  })
  return res
}
