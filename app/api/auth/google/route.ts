import { NextResponse, type NextRequest } from 'next/server'
import { randomToken } from '@/lib/auth'
import { googleAuthUrl, googleReady } from '@/lib/google'

export async function GET(req: NextRequest) {
  if (!googleReady()) return NextResponse.redirect(new URL('/login', req.url))
  const state = randomToken(16)
  const invite = req.nextUrl.searchParams.get('invite') ?? ''
  const res = NextResponse.redirect(googleAuthUrl(state))
  res.cookies.set('placton_oauth', JSON.stringify({ state, invite }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  })
  return res
}
