import { type NextRequest } from 'next/server'
import { contactFromToken, unsubscribeContact } from '@/lib/outreach/engine'

export const dynamic = 'force-dynamic'

// Baja de la campaña de correo. POST = baja en un clic (RFC 8058: Gmail y Yahoo
// la mandan desde su botón «Cancelar suscripción») o el botón de esta página.
// GET solo enseña el botón: los antivirus de correo abren los enlaces solos y
// no deben dar a nadie de baja sin querer. En inglés: es para los destinatarios.

function page(title: string, text: string, form?: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#f4f7f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0c1b1f">
<div style="max-width:440px;margin:0 auto;padding:64px 20px">
<div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:24px">placton</div>
<div style="background:#fff;border:1px solid #e3e9e7;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 10px">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#33464b;margin:0">${text}</p>
${form ?? ''}
</div></div></body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

const invalid = () => page('Link not valid', 'This link is not valid. Reply to the email with “unsubscribe” and we won’t write again.')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = contactFromToken(token)
  if (!c) return invalid()
  if (c.status === 'unsubscribed') return page('You’re unsubscribed', `We won’t email ${c.email} again.`)
  return page(
    'Unsubscribe',
    `Stop all emails from Placton to ${c.email}?`,
    `<form method="post" style="margin-top:20px"><button style="background:#0b3b3c;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`,
  )
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const c = contactFromToken(token)
  if (!c) return invalid()
  if (c.status !== 'unsubscribed') unsubscribeContact(c, 'enlace')
  return page('You’re unsubscribed', `We won’t email ${c.email} again. Sorry for the interruption.`)
}
