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

/** Todo lo que entra en un correo es texto: nunca HTML de nadie (nombres de espacio, mensajes…). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export type EmailTone = 'bad' | 'warn' | 'good' | 'neutral'

/**
 * Bloques opcionales del cuerpo. Todo lo que llevan es texto y se escapa: nunca
 * HTML de fuera (citas de la IA, nombres de marcas, prompts…).
 */
export type EmailBlock =
  /** Aviso destacado: fondo neutro con un punto de color (nunca color sobre su mismo color). */
  | { type: 'alert'; tone: EmailTone; title: string; text?: string }
  /** Cifras en fila: una tabla de hasta tres columnas. */
  | { type: 'stats'; heading?: string; items: { label: string; value: string; sub?: string }[] }
  /** Tabla sencilla: la primera columna a la izquierda y el resto a la derecha. */
  | { type: 'rows'; heading?: string; head?: string[]; rows: { cells: string[]; strong?: boolean; note?: string }[] }
  /** Párrafo con título y nota en gris, opcionales. */
  | { type: 'item'; heading?: string; title?: string; text: string; note?: string; tone?: EmailTone }

export interface EmailInput {
  to: string
  subject: string
  kind: string
  title: string
  body: string
  cta?: { label: string; url: string }
  /** Enlace secundario junto al botón. */
  link?: { label: string; url: string }
  blocks?: EmailBlock[]
  /** Pie propio debajo de la tarjeta: por qué le llega y cómo cambiarlo. */
  footer?: { text: string; links?: { label: string; url: string }[] }
  /** Cabeceras extra para Resend (p. ej. List-Unsubscribe). */
  headers?: Record<string, string>
  /** Versión en texto plano; si falta, se genera a partir de lo demás. */
  text?: string
  lang?: 'en' | 'es'
}

const C = { ink: '#0c1b1f', ink2: '#33464b', mute: '#6b7c80', line: '#e3e9e7', soft: '#eef2f1', bg: '#f4f7f6', brand: '#0b3b3c' }
const DOT: Record<EmailTone, string> = { bad: '#c2410c', warn: '#d97706', good: '#00a38c', neutral: '#9aa8ab' }

const safeUrl = (url: string) => (/^https?:\/\//.test(url) ? esc(url) : null)
const para = (s: string) => esc(s).replace(/\n/g, '<br>')
const dot = (tone: EmailTone) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${DOT[tone]};margin-right:8px;vertical-align:middle"></span>`
const heading = (h?: string) =>
  h ? `<div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.mute};margin:28px 0 10px">${esc(h)}</div>` : ''

function blockHtml(b: EmailBlock, first: boolean): string {
  const gap = first ? '20px' : '12px'
  if (b.type === 'alert') {
    return `<div style="margin-top:${gap};background:#f8faf9;border:1px solid ${C.line};border-radius:12px;padding:14px 16px">
      <div style="font-weight:700;font-size:15px;line-height:1.4;color:${C.ink}">${dot(b.tone)}${esc(b.title)}</div>
      ${b.text ? `<div style="font-size:14px;line-height:1.55;color:${C.ink2};margin-top:6px">${para(b.text)}</div>` : ''}
    </div>`
  }
  if (b.type === 'stats') {
    const width = Math.floor(100 / Math.max(1, b.items.length))
    const cells = b.items
      .map(
        (it) => `<td valign="top" style="width:${width}%;padding:12px 10px 0 0;border-top:1px solid ${C.line}">
          <div style="font-size:12px;color:${C.mute}">${esc(it.label)}</div>
          <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;color:${C.ink};margin-top:4px">${esc(it.value)}</div>
          ${it.sub ? `<div style="font-size:12px;line-height:1.4;color:${C.mute};margin-top:4px">${esc(it.sub)}</div>` : ''}
        </td>`,
      )
      .join('')
    return `${heading(b.heading)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse${b.heading ? '' : `;margin-top:${gap}`}"><tr>${cells}</tr></table>`
  }
  if (b.type === 'rows') {
    const align = (i: number) => (i === 0 ? 'left' : 'right')
    const head = b.head?.length
      ? `<tr>${b.head.map((h, i) => `<th align="${align(i)}" style="font-size:12px;font-weight:600;color:${C.mute};padding:0 0 8px${i ? ' 12px' : ''}">${esc(h)}</th>`).join('')}</tr>`
      : ''
    const rows = b.rows
      .map(
        (r) =>
          `<tr>${r.cells
            .map((c, i) => {
              const note = i === 0 && r.note ? `<span style="font-weight:400;font-size:12px;color:${C.mute}"> · ${esc(r.note)}</span>` : ''
              const color = i === 0 || i === 1 ? C.ink : C.mute
              return `<td align="${align(i)}" style="padding:9px 0 9px ${i ? '12px' : '0'};border-top:1px solid ${C.soft};font-size:14px;color:${color};font-weight:${r.strong && i < 2 ? 700 : 400};white-space:${i ? 'nowrap' : 'normal'}">${esc(c)}${note}</td>`
            })
            .join('')}</tr>`,
      )
      .join('')
    return `${heading(b.heading)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse${b.heading ? '' : `;margin-top:${gap}`}">${head}${rows}</table>`
  }
  return `${heading(b.heading)}<div style="${b.heading ? '' : `margin-top:${gap}`}">
    ${b.title ? `<div style="font-weight:700;font-size:15px;line-height:1.4;color:${C.ink}">${b.tone ? dot(b.tone) : ''}${esc(b.title)}</div>` : ''}
    <div style="font-size:14px;line-height:1.55;color:${C.ink2}${b.title ? ';margin-top:4px' : ''}">${para(b.text)}</div>
    ${b.note ? `<div style="font-size:12px;line-height:1.5;color:${C.mute};margin-top:6px">${para(b.note)}</div>` : ''}
  </div>`
}

function layout(input: EmailInput): string {
  const lang = input.lang ?? 'en'
  const ctaUrl = input.cta ? safeUrl(input.cta.url) : null
  const linkUrl = input.link ? safeUrl(input.link.url) : null
  const footLinks = (input.footer?.links ?? [])
    .map((l) => ({ label: esc(l.label), url: safeUrl(l.url) }))
    .filter((l) => l.url)
    .map((l) => `<a href="${l.url}" style="color:${C.mute};text-decoration:underline">${l.label}</a>`)
    .join(' &nbsp;·&nbsp; ')
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${C.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:28px">placton</div>
    <div style="background:#fff;border:1px solid ${C.line};border-radius:16px;padding:32px">
      <h1 style="font-size:20px;line-height:1.3;margin:0 0 14px">${esc(input.title)}</h1>
      <div style="font-size:15px;line-height:1.6;color:${C.ink2}">${para(input.body)}</div>
      ${(input.blocks ?? []).map((b, i) => blockHtml(b, i === 0)).join('\n')}
      ${
        ctaUrl || linkUrl
          ? `<div style="margin-top:26px">${
              ctaUrl
                ? `<a href="${ctaUrl}" style="display:inline-block;background:${C.brand};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${esc(input.cta!.label)}</a>`
                : ''
            }${linkUrl ? `<div style="margin-top:${ctaUrl ? '14px' : '0'}"><a href="${linkUrl}" style="color:${C.brand};font-weight:600;font-size:14px;text-decoration:underline">${esc(input.link!.label)}</a></div>` : ''}</div>`
          : ''
      }
    </div>
    ${input.footer ? `<p style="font-size:12px;line-height:1.6;color:${C.mute};margin:20px 0 0">${para(input.footer.text)}${footLinks ? `<br>${footLinks}` : ''}</p>` : ''}
    <p style="font-size:12px;color:${C.mute};margin-top:${input.footer ? '10px' : '20px'}">${lang === 'es' ? 'Placton · Visibilidad de tu marca en las respuestas de IA' : 'Placton · Your brand in AI answers'}</p>
  </div></body></html>`
}

/** Versión en texto plano del mismo correo (la leen algunos clientes y los filtros de spam). */
function plainText(input: EmailInput): string {
  const out: string[] = [input.title, '', input.body]
  for (const b of input.blocks ?? []) {
    out.push('')
    if ('heading' in b && b.heading) out.push(b.heading.toUpperCase())
    if (b.type === 'alert') out.push(`* ${b.title}`, ...(b.text ? [b.text] : []))
    else if (b.type === 'stats') for (const it of b.items) out.push(`${it.label}: ${it.value}${it.sub ? ` (${it.sub})` : ''}`)
    else if (b.type === 'rows') for (const r of b.rows) out.push(`- ${r.cells.filter(Boolean).join(' | ')}${r.note ? ` (${r.note})` : ''}`)
    else out.push(...(b.title ? [b.title] : []), b.text, ...(b.note ? [b.note] : []))
  }
  if (input.cta || input.link) out.push('')
  if (input.cta) out.push(`${input.cta.label}: ${input.cta.url}`)
  if (input.link) out.push(`${input.link.label}: ${input.link.url}`)
  if (input.footer) {
    out.push('', '--', input.footer.text)
    for (const l of input.footer.links ?? []) out.push(`${l.label}: ${l.url}`)
  }
  return out.join('\n')
}

/** El correo ya montado, sin enviarlo (vista previa y pruebas). */
export function renderEmail(input: EmailInput): { html: string; text: string } {
  return { html: layout(input), text: input.text ?? plainText(input) }
}

export async function sendEmail(input: EmailInput): Promise<boolean> {
  const { html, text } = renderEmail(input)
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
      body: JSON.stringify({ from: FROM(), to: [input.to], subject: input.subject, html, text, ...(input.headers ? { headers: input.headers } : {}) }),
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
