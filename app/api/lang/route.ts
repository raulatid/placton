import { NextResponse, type NextRequest } from 'next/server'
import { isLang, LANG_COOKIE } from '@/lib/i18n-shared'

export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get('l')
  const raw = req.nextUrl.searchParams.get('next') || '/'
  // Solo rutas internas: nada de redirigir a otros dominios.
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  const res = NextResponse.redirect(new URL(next, req.url))
  if (isLang(l)) res.cookies.set(LANG_COOKIE, l, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return res
}
