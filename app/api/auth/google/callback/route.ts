import { NextResponse, type NextRequest } from 'next/server'
import { ipFrom, isDisposableEmail, recordSignup, signupAllowed } from '@/lib/abuse'
import { authNoticePage, endAllSessions, safeNext, startSession } from '@/lib/auth'
import { appUrl, cookieDomain } from '@/lib/email'
import { googleProfile } from '@/lib/google'
import { LANG_COOKIE, makeT } from '@/lib/i18n-shared'
import { finishConnect, isOutreachReturn } from '@/lib/outreach/connect'
import * as repo from '@/lib/repo'

export async function GET(req: NextRequest) {
  // «Conectar buzón» de la campaña usa este mismo cliente y esta misma vuelta.
  if (isOutreachReturn(req)) return finishConnect(req)
  // Siempre a la app con su dirección real (dentro del contenedor req.url es localhost:8080).
  const fail = () => NextResponse.redirect(`${appUrl()}/login?error=google`)
  const raw = req.cookies.get('placton_oauth')?.value
  let saved: { state?: string; invite?: string; next?: string } = {}
  try {
    saved = raw ? JSON.parse(raw) : {}
  } catch {
    return fail()
  }
  const code = req.nextUrl.searchParams.get('code')
  if (!code || !saved.state || saved.state !== req.nextUrl.searchParams.get('state')) return fail()

  const profile = await googleProfile(code)
  if (!profile?.email || profile.email_verified === false) return fail()

  let user = repo.userByGoogleId(profile.sub) ?? repo.userByEmail(profile.email)
  let isNew = false
  if (!user) {
    // Una cuenta de Google puede crearse con cualquier correo, también uno desechable.
    if (isDisposableEmail(profile.email)) {
      const lang = req.cookies.get(LANG_COOKIE)?.value === 'es' ? 'es' : 'en'
      const t = makeT(lang)
      // La cookie de Google caduca sola a los 10 minutos.
      return authNoticePage(
        lang,
        t('Temporary email addresses are not accepted', 'No admitimos correos temporales'),
        t(
          'This Google account uses a temporary email address. Sign up with your work or personal email instead.',
          'Esta cuenta de Google usa un correo temporal. Regístrate con tu correo de trabajo o personal.',
        ),
        { label: t('Back to sign up', 'Volver al registro'), url: `${appUrl()}/signup` },
      )
    }
    const ip = ipFrom(req.headers)
    if (!signupAllowed(ip)) return NextResponse.redirect(`${appUrl()}/login?error=limit`)
    recordSignup(ip)
    user = repo.createUser({
      email: profile.email,
      firstName: profile.given_name ?? '',
      lastName: profile.family_name ?? '',
      passwordHash: null,
      googleId: profile.sub,
    })
    isNew = true
  } else if (!user.googleId) {
    // El correo nunca se verificó al registrarse con contraseña: si fue otra persona quien
    // creó la cuenta con este correo, pierde el acceso. Google confirma que el correo es de quien entra.
    repo.updateUser(user.id, { googleId: profile.sub, passwordHash: null })
    endAllSessions(user.id)
  }
  // Google confirma el correo: ya puede lanzar su primera medición.
  if (!user.emailVerifiedAt) repo.markEmailVerified(user.id)
  await startSession(user.id)

  const dest = saved.invite ? `/invite/${encodeURIComponent(saved.invite)}` : isNew ? '/onboarding' : (safeNext(saved.next) ?? '/dashboard')
  const res = NextResponse.redirect(`${appUrl()}${dest}`)
  res.cookies.set('placton_oauth', '', { path: '/', maxAge: 0, domain: cookieDomain() })
  return res
}
