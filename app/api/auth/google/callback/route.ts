import { NextResponse, type NextRequest } from 'next/server'
import { startSession } from '@/lib/auth'
import { appUrl, cookieDomain } from '@/lib/email'
import { googleProfile } from '@/lib/google'
import * as repo from '@/lib/repo'

export async function GET(req: NextRequest) {
  // Siempre a la app con su dirección real (dentro del contenedor req.url es localhost:8080).
  const fail = () => NextResponse.redirect(`${appUrl()}/login?error=google`)
  const raw = req.cookies.get('placton_oauth')?.value
  let saved: { state?: string; invite?: string } = {}
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
    user = repo.createUser({
      email: profile.email,
      firstName: profile.given_name ?? '',
      lastName: profile.family_name ?? '',
      passwordHash: null,
      googleId: profile.sub,
    })
    isNew = true
  } else if (!user.googleId) {
    repo.updateUser(user.id, { googleId: profile.sub })
  }
  await startSession(user.id)

  const dest = saved.invite ? `/invite/${encodeURIComponent(saved.invite)}` : isNew ? '/onboarding' : '/dashboard'
  const res = NextResponse.redirect(`${appUrl()}${dest}`)
  res.cookies.set('placton_oauth', '', { path: '/', maxAge: 0, domain: cookieDomain() })
  return res
}
