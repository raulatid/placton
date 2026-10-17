import { NextResponse, type NextRequest } from 'next/server'

// Reparto por dominio en producción:
// - placton.tech: la web pública (portada, precios, preguntas, contacto, legales).
// - app.placton.tech: la aplicación (alta, acceso, onboarding, panel, administración).
// - www.placton.tech: redirige a placton.tech.
// Las rutas /api/* funcionan en los dos (webhook de Stripe, vuelta de Google, logos).
// En local o en el dominio de Railway no se redirige nada.

const SITE = 'placton.tech'
const APP = 'app.placton.tech'
const APP_PATHS = ['/dashboard', '/onboarding', '/login', '/signup', '/forgot-password', '/reset-password', '/invite', '/admin']

const isAppPath = (p: string) => APP_PATHS.some((a) => p === a || p.startsWith(`${a}/`))

export function proxy(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '')
  const { pathname, search } = req.nextUrl
  const to = (h: string, path = pathname) => NextResponse.redirect(`https://${h}${path}${search}`, 308)

  if (host === `www.${SITE}`) return to(SITE)
  if (host === SITE && isAppPath(pathname)) return to(APP)
  if (host === APP && !isAppPath(pathname)) {
    // La raíz de la app lleva al panel (que manda al acceso si no hay sesión);
    // cualquier página de la web pública vuelve a placton.tech.
    if (pathname === '/') return to(APP, '/dashboard')
    return to(SITE)
  }
  return NextResponse.next()
}

export const config = {
  // Ni la API ni los archivos estáticos pasan por aquí.
  matcher: ['/((?!api/|_next/|favicon.ico|icon.svg|apple-icon.png|landing/|platforms/|placton-logo.svg|robots.txt|sitemap.xml).*)'],
}
