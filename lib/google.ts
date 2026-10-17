import 'server-only'
import { siteUrl } from './email'

// Acceso con Google (OAuth 2.0, flujo de código). Solo se enseña el botón si
// están GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET. La URI de retorno que hay que
// dar de alta en Google Cloud es {PLACTON_URL}/api/auth/google/callback.

export function googleReady(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function googleRedirectUri(): string {
  return `${siteUrl()}/api/auth/google/callback`
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function googleProfile(code: string): Promise<{ sub: string; email: string; given_name?: string; family_name?: string; email_verified?: boolean } | null> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) return null
  const { access_token } = (await tokenRes.json()) as { access_token?: string }
  if (!access_token) return null
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } })
  if (!infoRes.ok) return null
  return (await infoRes.json()) as { sub: string; email: string; given_name?: string; family_name?: string; email_verified?: boolean }
}
