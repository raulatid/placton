import { NextResponse, type NextRequest } from 'next/server'
import { cookieDomain, siteUrl } from '@/lib/email'
import { isLang, LANG_COOKIE } from '@/lib/i18n-shared'

export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get('l')
  const raw = req.nextUrl.searchParams.get('next') || '/'
  // Solo rutas internas: nada de redirigir a otros dominios.
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  // Vuelve al mismo dominio desde el que se pidió (web o app), nunca a localhost:8080.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const origin = host && !host.startsWith('localhost:8080') ? `${req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}` : siteUrl()
  const res = NextResponse.redirect(`${origin}${next}`)
  if (isLang(l)) res.cookies.set(LANG_COOKIE, l, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', domain: cookieDomain() })
  return res
}
