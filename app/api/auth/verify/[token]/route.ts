import { NextResponse, type NextRequest } from 'next/server'
import { authNoticePage, currentUser, readEmailVerifyToken } from '@/lib/auth'
import { appUrl } from '@/lib/email'
import { LANG_COOKIE, makeT } from '@/lib/i18n-shared'
import * as repo from '@/lib/repo'

export const dynamic = 'force-dynamic'

// Enlace del correo de confirmación. Marca el correo como confirmado y, si quien lo
// abre tiene la sesión de esa cuenta, lo lleva al alta (que recupera lo que eligió y
// sigue sola) o al panel. Desde otro dispositivo o sin sesión, una página le dice que
// vuelva a la pestaña del alta: allí se nota en unos segundos y continúa.
// Abrirlo dos veces (o que lo abra antes el antivirus del correo) no hace daño.

type Ctx = { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const lang = req.cookies.get(LANG_COOKIE)?.value === 'es' ? 'es' : 'en'
  const t = makeT(lang)
  const r = readEmailVerifyToken((await ctx.params).token)
  // Un enlace caducado de alguien que ya confirmó por otro lado sigue llevando a su sitio.
  if (r.status === 'invalid' || (r.status === 'expired' && !r.user.emailVerifiedAt && !r.user.googleId)) {
    return authNoticePage(
      lang,
      r.status === 'expired' ? t('This link has expired', 'Este enlace ha caducado') : t('This link is not valid', 'Este enlace no es válido'),
      r.status === 'expired'
        ? t(
            'Confirmation links last 48 hours. Open Placton and press "Resend the email" to get a new one.',
            'Los enlaces de confirmación duran 48 horas. Entra en Placton y pulsa «Reenviar el correo» para recibir otro.',
          )
        : t('Open Placton and press "Resend the email" to get a new link.', 'Entra en Placton y pulsa «Reenviar el correo» para recibir otro enlace.'),
      { label: t('Open Placton', 'Abrir Placton'), url: `${appUrl()}/onboarding` },
    )
  }
  repo.markEmailVerified(r.user.id)

  const me = await currentUser()
  if (me?.id === r.user.id) {
    const finished = repo.workspacesOf(me.id).some((w) => w.onboarded)
    const dest = repo.onboardingDraftOf(me) || !finished ? '/onboarding' : '/dashboard'
    return NextResponse.redirect(`${appUrl()}${dest}`, { headers: { 'Referrer-Policy': 'no-referrer' } })
  }
  return authNoticePage(
    lang,
    t('Email confirmed', 'Correo confirmado'),
    t(
      'Thanks. Go back to the Placton tab where you were setting up your workspace: it will continue on its own in a few seconds.',
      'Gracias. Vuelve a la pestaña de Placton donde estabas configurando tu espacio: seguirá sola en unos segundos.',
    ),
    { label: t('Open Placton', 'Abrir Placton'), url: `${appUrl()}/dashboard` },
  )
}
