'use server'

import { clientIp, isDisposableEmail, recordSignup, signupAllowed } from '@/lib/abuse'
import { redirect } from 'next/navigation'
import {
  consumePasswordReset,
  createPasswordReset,
  currentUser,
  endAllSessions,
  endSession,
  hashPassword,
  passwordProblem,
  safeNext,
  sendVerificationEmail,
  startSession,
  verifyPassword,
} from '@/lib/auth'
import { appUrl, sendEmail } from '@/lib/email'
import { getT } from '@/lib/i18n'
import * as repo from '@/lib/repo'

export interface FormState {
  error?: string
  ok?: string
  link?: string
  fields?: Record<string, string>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? '').trim()
}

// Freno sencillo a la fuerza bruta: intentos por IP en memoria.
const attempts = new Map<string, { n: number; until: number }>()
async function throttled(scope: string): Promise<boolean> {
  const ip = await clientIp()
  const k = `${scope}:${ip}`
  const now = Date.now()
  const a = attempts.get(k)
  if (a && a.until > now && a.n >= 10) return true
  attempts.set(k, a && a.until > now ? { n: a.n + 1, until: a.until } : { n: 1, until: now + 10 * 60_000 })
  return false
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const { lang, t } = await getT()
  const firstName = str(fd, 'firstName')
  const lastName = str(fd, 'lastName')
  const email = str(fd, 'email').toLowerCase()
  const password = String(fd.get('password') ?? '')
  const invite = str(fd, 'invite')
  const web = str(fd, 'web_prefill')
  const fields = { firstName, lastName, email }

  if (str(fd, 'website')) return { error: t('We could not create the account.', 'No se ha podido crear la cuenta.'), fields }
  if (await throttled('signup')) return { error: t('Too many attempts. Try again in a few minutes.', 'Demasiados intentos. Prueba de nuevo en unos minutos.'), fields }
  if (!firstName) return { error: t('Please enter your first name.', 'Escribe tu nombre.'), fields }
  if (!EMAIL_RE.test(email)) return { error: t('That email does not look valid.', 'Ese correo no parece válido.'), fields }
  if (isDisposableEmail(email))
    return {
      error: t(
        'Temporary email addresses are not accepted. Use your work or personal email.',
        'No admitimos correos temporales. Usa tu correo de trabajo o personal.',
      ),
      fields,
    }
  const pwProblem = passwordProblem(password)
  if (pwProblem) return { error: t('Your password needs at least 8 characters.', pwProblem), fields }
  if (repo.userByEmail(email)) return { error: t('There is already an account with that email. Log in instead.', 'Ya hay una cuenta con ese correo. Entra con ella.'), fields }
  const ip = await clientIp()
  if (!signupAllowed(ip)) return { error: t('Too many new accounts from this connection today. Try again tomorrow or contact us.', 'Demasiadas cuentas nuevas desde esta conexión hoy. Prueba mañana o escríbenos.'), fields }

  // Se apunta antes de esperar al cifrado: varias altas a la vez no se cuelan del límite.
  recordSignup(ip)
  const user = repo.createUser({ email, firstName, lastName, passwordHash: await hashPassword(password) })
  await startSession(user.id)
  // Una invitación enviada a este mismo correo ya demuestra que es suyo. Si no, se
  // manda el correo de confirmación (hace de bienvenida): sin confirmarlo no arranca
  // la primera medición.
  const inv = invite ? repo.inviteByToken(invite) : null
  if (inv && !inv.acceptedAt && inv.email.trim().toLowerCase() === user.email) {
    repo.markEmailVerified(user.id)
    void sendEmail({
      to: user.email,
      subject: t('Your Placton account is ready', 'Tu cuenta de Placton está lista'),
      kind: 'welcome',
      title: t(`Hi ${user.firstName}`, `Hola, ${user.firstName}`),
      body: t(
        'Your account is ready. Finish setting up your workspace and in a few minutes you will see what AI says about your brand.',
        'Ya tienes tu cuenta. Termina el alta de tu espacio y en unos minutos verás qué dicen las IA de tu marca.',
      ),
      cta: { label: t('Open Placton', 'Ir a Placton'), url: `${appUrl()}/dashboard` },
      lang,
    })
  } else {
    void sendVerificationEmail(user, lang, { invite: Boolean(invite) })
  }
  if (invite) redirect(`/invite/${encodeURIComponent(invite)}`)
  redirect(web ? `/onboarding?web=${encodeURIComponent(web)}` : '/onboarding')
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getT()
  const email = str(fd, 'email').toLowerCase()
  const password = String(fd.get('password') ?? '')
  const invite = str(fd, 'invite')
  if (await throttled('login')) return { error: t('Too many attempts. Try again in a few minutes.', 'Demasiados intentos. Prueba de nuevo en unos minutos.'), fields: { email } }
  const user = repo.userByEmail(email)
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return {
      error:
        user && !user.passwordHash
          ? t('This account signs in with Google.', 'Esta cuenta entra con Google.')
          : t('Incorrect email or password.', 'Correo o contraseña incorrectos.'),
      fields: { email },
    }
  }
  await startSession(user.id)
  if (invite) redirect(`/invite/${encodeURIComponent(invite)}`)
  redirect(safeNext(str(fd, 'next')) ?? '/dashboard')
}

export async function logoutAction() {
  await endSession()
  redirect('/login')
}

export async function forgotAction(_: FormState, fd: FormData): Promise<FormState> {
  const { lang, t } = await getT()
  const email = str(fd, 'email').toLowerCase()
  if (await throttled('forgot')) return { error: t('Too many attempts. Try again in a few minutes.', 'Demasiados intentos. Prueba de nuevo en unos minutos.') }
  if (!EMAIL_RE.test(email)) return { error: t('That email does not look valid.', 'Ese correo no parece válido.'), fields: { email } }
  const user = repo.userByEmail(email)
  const generic = t(
    'If there is an account with that email, we have sent you a link to choose a new password. It expires in one hour.',
    'Si hay una cuenta con ese correo, te hemos enviado un enlace para elegir una contraseña nueva. Caduca en una hora.',
  )
  if (!user) return { ok: generic }
  const token = createPasswordReset(user.id)
  const url = `${appUrl()}/reset-password/${token}`
  const sent = await sendEmail({
    to: user.email,
    subject: t('Reset your Placton password', 'Cambia tu contraseña de Placton'),
    kind: 'reset',
    title: t('Choose a new password', 'Elige una contraseña nueva'),
    body: t(
      'Someone (probably you) asked to change the password of your account. If it was not you, just ignore this email.',
      'Alguien (seguramente tú) ha pedido cambiar la contraseña de tu cuenta. Si no has sido tú, ignora este correo.',
    ),
    cta: { label: t('Change password', 'Cambiar contraseña'), url },
    lang,
  })
  // En local, sin correo configurado, enseñamos el enlace para poder seguir.
  if (!sent && process.env.NODE_ENV !== 'production') return { ok: generic, link: url }
  return { ok: generic }
}

export async function resetAction(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getT()
  const token = str(fd, 'token')
  const password = String(fd.get('password') ?? '')
  if (passwordProblem(password)) return { error: t('Your password needs at least 8 characters.', 'La contraseña necesita al menos 8 caracteres.') }
  const userId = consumePasswordReset(token)
  if (!userId) return { error: t('This link has expired or was already used. Request a new one.', 'El enlace ha caducado o ya se usó. Pide otro.') }
  repo.updateUser(userId, { passwordHash: await hashPassword(password) })
  // El enlace llegó a su correo: eso ya lo confirma.
  repo.markEmailVerified(userId)
  endAllSessions(userId)
  await startSession(userId)
  redirect('/dashboard')
}

export async function acceptInviteAction(fd: FormData) {
  const token = str(fd, 'token')
  const user = await currentUser()
  if (!user) redirect(`/login?invite=${encodeURIComponent(token)}`)
  const invite = repo.inviteByToken(token)
  if (!invite || invite.acceptedAt) redirect('/dashboard')
  const ws = repo.workspaceById(invite.workspaceId)
  if (!ws) redirect('/dashboard')
  const limit = repo.memberLimit(ws)
  if (limit !== null && repo.membersOf(ws.id).length >= limit && !repo.roleIn(ws.id, user.id)) {
    redirect(`/invite/${encodeURIComponent(token)}?full=1`)
  }
  repo.acceptInvite(invite, user.id)
  redirect('/dashboard')
}
