import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { currentUser, isAdmin } from '../auth'
import { nowIso, one, run } from '../db'
import { appUrl, cookieDomain } from '../email'
import { exchangeCode, seal } from './gmail'

export const OUTREACH_COOKIE = 'placton_outreach_oauth'

/** ¿Esta vuelta de Google es la de «Conectar buzón»? (la cookie guarda el mismo state). */
export function isOutreachReturn(req: NextRequest): boolean {
  try {
    const saved = JSON.parse(req.cookies.get(OUTREACH_COOKIE)?.value ?? '{}') as { state?: string }
    return Boolean(saved.state && saved.state === req.nextUrl.searchParams.get('state'))
  } catch {
    return false
  }
}

/**
 * Vuelta de Google tras conectar un buzón de envío: se guarda el permiso cifrado.
 * Un buzón nuevo empieza su calentamiento hoy; uno que se reconecta lo conserva.
 */
export async function finishConnect(req: NextRequest): Promise<NextResponse> {
  const back = (q: Record<string, string>) => {
    const res = NextResponse.redirect(`${appUrl()}/admin/outreach?${new URLSearchParams(q)}`)
    res.cookies.set(OUTREACH_COOKIE, '', { path: '/', maxAge: 0, domain: cookieDomain() })
    return res
  }
  const user = await currentUser()
  if (!user || !isAdmin(user)) return NextResponse.redirect(`${appUrl()}/admin`)
  let saved: { state?: string; name?: string } = {}
  try {
    saved = JSON.parse(req.cookies.get(OUTREACH_COOKIE)?.value ?? '{}')
  } catch {
    return back({ error: 'La conexión ha caducado. Vuelve a intentarlo.' })
  }
  const code = req.nextUrl.searchParams.get('code')
  if (!code || !saved.state || saved.state !== req.nextUrl.searchParams.get('state')) {
    return back({ error: req.nextUrl.searchParams.get('error') === 'access_denied' ? 'Has cancelado el permiso.' : 'La conexión ha caducado. Vuelve a intentarlo.' })
  }
  const got = await exchangeCode(code)
  if ('error' in got) return back({ error: got.error })
  // Solo los dominios de envío permitidos: nunca placton.tech (su correo de la aplicación)
  // ni una cuenta personal elegida por error.
  const domain = got.email.split('@')[1] ?? ''
  const allowed = (process.env.OUTREACH_ALLOWED_DOMAINS || 'vertigomkt.es').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
  if (!allowed.includes(domain)) return back({ error: `${got.email} no es un buzón de envío permitido (${allowed.join(', ')}). Elige el buzón de la campaña.` })
  const exists = one<{ name: string; pausedReason: string | null }>('SELECT name, pausedReason FROM outreach_mailboxes WHERE email = ?', [got.email])
  const name = saved.name?.trim() || exists?.name || 'Raúl Díaz (Placton)'
  if (exists) {
    // Reconectar solo quita la pausa que puso el permiso caducado; las demás las quita una persona.
    const wasAuth = (exists.pausedReason ?? '').startsWith('El permiso de Google')
    run(
      `UPDATE outreach_mailboxes SET refreshToken = ?, name = ?, lastError = NULL, nextSendAt = ?${wasAuth ? ', paused = 0, pausedReason = NULL, resumedAt = ?' : ''} WHERE email = ?`,
      wasAuth ? [seal(got.refreshToken), name, new Date(Date.now() + 15 * 60_000).toISOString(), nowIso(), got.email] : [seal(got.refreshToken), name, new Date(Date.now() + 15 * 60_000).toISOString(), got.email],
    )
  } else {
    // Un buzón nuevo empieza parado: se reanuda a mano cuando esté todo listo.
    run("INSERT INTO outreach_mailboxes (email, name, refreshToken, warmupFrom, paused, pausedReason, createdAt) VALUES (?, ?, ?, ?, 1, 'Recién conectado: pulsa Reanudar cuando quieras que empiece', ?)", [got.email, name, seal(got.refreshToken), nowIso(), nowIso()])
  }
  return back({ ok: `Buzón ${got.email} conectado.` })
}
