import 'server-only'
import { randomBytes } from 'node:crypto'

// Montaje del correo (RFC 5322) como uno escrito a mano en Gmail: texto plano y
// su versión HTML mínima (sin imágenes, sin estilos de plantilla, sin píxel de
// apertura ni enlaces de seguimiento). El HTML solo sirve para que el pie legal
// salga pequeño y en gris, como una firma, en lugar de un bloque de texto.

/** Palabra codificada (RFC 2047) solo si hace falta: los asuntos en ASCII van tal cual. */
function word(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

function address(name: string, email: string): string {
  if (!name) return `<${email}>`
  const n = /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/["\\]/g, '')}"` : word(name)
  return `${n} <${email}>`
}

/** Quoted-printable (RFC 2045): líneas de 76 como mucho, acentos y emojis a salvo. */
export function quotedPrintable(text: string): string {
  const out: string[] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const bytes = Buffer.from(line, 'utf8')
    let enc = ''
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      const last = i === bytes.length - 1
      const plain = (b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last)
      enc += plain ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, '0')}`
    }
    // Cortes blandos («=» al final) sin partir un =XX por la mitad.
    while (enc.length > 76) {
      let cut = 75
      const eq = enc.lastIndexOf('=', cut)
      if (eq > cut - 3) cut = eq
      out.push(`${enc.slice(0, cut)}=`)
      enc = enc.slice(cut)
    }
    out.push(enc)
  }
  return out.join('\r\n')
}

export function newMessageId(fromEmail: string): string {
  const domain = fromEmail.split('@')[1] ?? 'localhost'
  return `<${Date.now().toString(36)}.${randomBytes(9).toString('base64url')}@${domain}>`
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Texto → HTML: saltos de línea y enlaces (direcciones http y placton.tech). */
function linkify(text: string): string {
  return escHtml(text)
    .replace(/(https?:\/\/[^\s<]*[^\s<.,;:!?)]|\bplacton\.tech\b)/g, (m) => `<a href="${m.startsWith('http') ? m : `https://${m}`}">${m}</a>`)
    .replace(/\n/g, '<br>')
}

/** Cuerpo y pie en HTML: el cuerpo tal cual lo pintaría Gmail; el pie, pequeño y gris. */
export function htmlBody(body: string, footer: string): string {
  const foot = footer ? `<div style="margin-top:20px;font-size:11px;line-height:1.45;color:#9aa0a6">${linkify(footer)}</div>` : ''
  return `<div dir="ltr">${linkify(body)}</div>${foot}`
}

export function buildMessage(input: {
  fromName: string
  fromEmail: string
  to: string
  subject: string
  body: string
  /** Versión HTML (multipart/alternative); sin ella, solo texto plano. */
  html?: string
  messageId: string
  /** Mensajes anteriores del hilo (Message-ID), del primero al último. */
  references?: string[]
  unsubscribeUrl?: string
  /** Identificador del contacto en el asunto de la baja por correo (por si escribe desde otra dirección). */
  unsubscribeToken?: string
}): string {
  const refs = (input.references ?? []).filter(Boolean)
  const mailto = `mailto:${input.fromEmail}?subject=${encodeURIComponent(`unsubscribe${input.unsubscribeToken ? ` ${input.unsubscribeToken}` : ''}`)}`
  const headers = [
    `From: ${address(input.fromName, input.fromEmail)}`,
    `To: <${input.to}>`,
    `Subject: ${word(input.subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${input.messageId}`,
    ...(refs.length ? [`In-Reply-To: ${refs[refs.length - 1]}`, `References: ${refs.join(' ')}`] : []),
    // Baja en un clic (RFC 8058): Gmail y Yahoo enseñan «Cancelar suscripción»
    // junto al remitente; mejor una baja que una queja por spam.
    // Sin dirección https, solo la baja por correo (la aceptan Gmail, Yahoo y Outlook).
    ...(input.unsubscribeUrl
      ? [`List-Unsubscribe: <${input.unsubscribeUrl}>, <${mailto}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click']
      : [`List-Unsubscribe: <${mailto}>`]),
    'MIME-Version: 1.0',
  ]
  const part = (type: string, content: string) => `Content-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintable(content)}\r\n`
  if (!input.html) return `${headers.join('\r\n')}\r\n${part('text/plain', input.body)}`
  const boundary = `=_${randomBytes(12).toString('hex')}`
  return [
    `${headers.join('\r\n')}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n`,
    `--${boundary}\r\n${part('text/plain', input.body)}`,
    `--${boundary}\r\n${part('text/html', input.html)}`,
    `--${boundary}--\r\n`,
  ].join('\r\n')
}
