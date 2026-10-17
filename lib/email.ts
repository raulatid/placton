import 'server-only'
import { nowIso, run } from './db'

// Correo transaccional por Resend. Sin clave o sin remitente configurado no se
// envía nada: se apunta en email_log y el enlace se enseña en pantalla, para
// que el flujo (invitaciones, recuperar contraseña) funcione igual en local.

const FROM = () => process.env.PLACTON_EMAIL_FROM || ''

export function emailReady(): boolean {
  return Boolean(process.env.RESEND_API_KEY && FROM())
}

/** Dirección de la aplicación (alta, acceso, panel): https://app.placton.tech en producción. */
export function appUrl(): string {
  return (process.env.PLACTON_APP_URL || process.env.PLACTON_URL || 'http://localhost:3490').replace(/\/$/, '')
}

/** Dirección de la web pública: https://placton.tech en producción. */
export function siteUrl(): string {
  return (process.env.PLACTON_URL || 'http://localhost:3490').replace(/\/$/, '')
}

/**
 * Dominio de las cookies de sesión, idioma y Google (p. ej. «.placton.tech»), para
 * que valgan a la vez en placton.tech y en app.placton.tech. En local, ninguno.
 */
export function cookieDomain(): string | undefined {
  return process.env.PLACTON_COOKIE_DOMAIN || undefined
}

function layout(title: string, body: string, cta?: { label: string; url: string }, lang: 'en' | 'es' = 'en'): string {
  return `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f4f7f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c1b1f">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:28px">placton</div>
    <div style="background:#fff;border:1px solid #e3e9e7;border-radius:16px;padding:32px">
      <h1 style="font-size:20px;line-height:1.3;margin:0 0 14px">${title}</h1>
      <div style="font-size:15px;line-height:1.6;color:#33464b">${body}</div>
      ${
        cta
          ? `<a href="${cta.url}" style="display:inline-block;margin-top:22px;background:#0b3b3c;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${cta.label}</a>`
          : ''
      }
    </div>
    <p style="font-size:12px;color:#6b7c80;margin-top:20px">${lang === 'es' ? 'Placton · Visibilidad de tu marca en las respuestas de IA' : 'Placton · Your brand in AI answers'}</p>
  </div></body></html>`
}

export async function sendEmail(input: { to: string; subject: string; kind: string; title: string; body: string; cta?: { label: string; url: string }; lang?: 'en' | 'es' }): Promise<boolean> {
  const html = layout(input.title, input.body, input.cta, input.lang ?? 'en')
  if (!emailReady()) {
    run('INSERT INTO email_log (toEmail, subject, kind, sent, error, createdAt) VALUES (?, ?, ?, 0, ?, ?)', [
      input.to,
      input.subject,
      input.kind,
      'Correo sin configurar',
      nowIso(),
    ])
    console.log(`[placton] correo sin enviar (${input.kind}) a ${input.to}: ${input.cta?.url ?? input.subject}`)
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [input.to], subject: input.subject, html }),
    })
    const ok = res.ok
    run('INSERT INTO email_log (toEmail, subject, kind, sent, error, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
      input.to,
      input.subject,
      input.kind,
      ok ? 1 : 0,
      ok ? null : (await res.text()).slice(0, 300),
      nowIso(),
    ])
    return ok
  } catch (err) {
    run('INSERT INTO email_log (toEmail, subject, kind, sent, error, createdAt) VALUES (?, ?, ?, 0, ?, ?)', [
      input.to,
      input.subject,
      input.kind,
      (err as Error).message.slice(0, 300),
      nowIso(),
    ])
    return false
  }
}
