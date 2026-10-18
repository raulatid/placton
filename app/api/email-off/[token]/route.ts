import { type NextRequest } from 'next/server'
import { digestOn, readDigestOffToken, turnOffDigest } from '@/lib/digest'
import { appUrl } from '@/lib/email'
import * as repo from '@/lib/repo'

export const dynamic = 'force-dynamic'

// Baja del resumen semanal por correo, sin sesión: el enlace lleva una firma
// HMAC de la persona y el espacio. POST = baja en un clic (RFC 8058: Gmail y
// Yahoo la mandan desde su botón) o el botón de esta página. GET solo enseña el
// botón: los antivirus de correo abren los enlaces solos y no deben dar a nadie
// de baja sin querer. Solo afecta a esa persona en ese espacio.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function page(lang: 'en' | 'es', title: string, text: string, extra = ''): Response {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f7f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c1b1f">
<div style="max-width:440px;margin:0 auto;padding:64px 20px">
<div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:24px">placton</div>
<div style="background:#fff;border:1px solid #e3e9e7;border-radius:16px;padding:28px">
<h1 style="font-size:20px;line-height:1.3;margin:0 0 10px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#33464b;margin:0">${esc(text)}</p>
${extra}
</div></div></body></html>`
  // Sin referer: el enlace a Ajustes no debe llevarse el token a ningún sitio.
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}

const button = (label: string) =>
  `<form method="post" style="margin-top:20px"><button style="background:#0b3b3c;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer">${esc(label)}</button></form>`

const settingsLink = (wsId: number, label: string) =>
  `<p style="margin:18px 0 0"><a href="${esc(`${appUrl()}/dashboard/w/${wsId}?to=settings`)}" style="color:#0b3b3c;font-weight:600;font-size:14px">${esc(label)}</a></p>`

type Ctx = { params: Promise<{ token: string }> }

/** Persona y espacio del enlace, si la firma vale y los dos siguen existiendo. */
async function resolve(ctx: Ctx) {
  const ref = readDigestOffToken((await ctx.params).token)
  if (!ref) return null
  const user = repo.userById(ref.userId)
  const ws = repo.workspaceById(ref.workspaceId)
  if (!user || !ws) return null
  return { user, ws, lang: (ws.language === 'es' ? 'es' : 'en') as 'en' | 'es' }
}

// Sin firma válida no se sabe de qué espacio es: el aviso va en los dos idiomas.
const invalid = () =>
  page(
    'en',
    'Link not valid · Enlace no válido',
    'This link is not valid. You can turn the email summary off in your workspace settings.',
    '<p lang="es" style="font-size:15px;line-height:1.6;color:#33464b;margin:12px 0 0">Este enlace no es válido. Puedes desactivar el resumen por correo en los ajustes de tu espacio.</p>',
  )

export async function GET(_req: NextRequest, ctx: Ctx) {
  const r = await resolve(ctx)
  if (!r) return invalid()
  const { user, ws, lang } = r
  const es = lang === 'es'
  const role = repo.roleIn(ws.id, user.id)
  if (!role || !digestOn(user.id, ws.id, role)) {
    return page(
      lang,
      es ? 'Ya estás de baja' : 'You are unsubscribed',
      es ? `${user.email} ya no recibe el resumen semanal de ${ws.name}.` : `${user.email} no longer receives the weekly summary for ${ws.name}.`,
      role ? settingsLink(ws.id, es ? 'Volver a activarlo en Ajustes' : 'Turn it back on in Settings') : '',
    )
  }
  return page(
    lang,
    es ? 'Darte de baja del resumen semanal' : 'Unsubscribe from the weekly summary',
    es
      ? `¿Dejamos de enviar a ${user.email} el resumen semanal y las alertas de ${ws.name}? Solo te afecta a ti: el resto del equipo lo seguirá recibiendo.`
      : `Stop sending the weekly summary and alerts for ${ws.name} to ${user.email}? This only affects you: the rest of the team keeps receiving it.`,
    button(es ? 'Darme de baja' : 'Unsubscribe'),
  )
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const r = await resolve(ctx)
  if (!r) return invalid()
  const { user, ws, lang } = r
  const es = lang === 'es'
  turnOffDigest(user.id, ws.id)
  const member = Boolean(repo.roleIn(ws.id, user.id))
  return page(
    lang,
    es ? 'Hecho, ya estás de baja' : "Done, you're unsubscribed",
    es ? `No enviaremos más el resumen semanal de ${ws.name} a ${user.email}.` : `We won't send the weekly summary for ${ws.name} to ${user.email} anymore.`,
    member ? settingsLink(ws.id, es ? 'Volver a activarlo en Ajustes' : 'Turn it back on in Settings') : '',
  )
}
