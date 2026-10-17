'use server'

import { storedTopic, type ContactField, type ContactState } from '@/components/marketing/contact'
import { getT } from '@/lib/i18n'
import { clientIp, ipHash } from '@/lib/abuse'
import { one, run } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { saveContact } from '@/lib/repo'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function field(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

export async function sendContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const { t } = await getT()
  const name = field(formData, 'name')
  const email = field(formData, 'email').toLowerCase()
  const topic = storedTopic(field(formData, 'topic'))
  const message = field(formData, 'message')

  // Trampa: si un robot rellena el campo oculto, fingimos que todo fue bien.
  if (field(formData, 'company_site')) return { status: 'ok' }

  const errors: Partial<Record<ContactField, string>> = {}
  if (name.length < 2) errors.name = t('Please enter your name.', 'Escribe tu nombre.')
  else if (name.length > 120) errors.name = t('That name is too long.', 'El nombre es demasiado largo.')
  if (!EMAIL_RE.test(email) || email.length > 200) errors.email = t('That email address does not look right.', 'Revisa el correo: parece que no es válido.')
  if (!topic) errors.topic = t('Please choose a topic.', 'Elige un motivo.')
  if (message.length < 10) errors.message = t('Tell us a little more (at least 10 characters).', 'Cuéntanos un poco más (al menos 10 caracteres).')
  else if (message.length > 5000) errors.message = t('The message cannot be longer than 5,000 characters.', 'El mensaje no puede pasar de 5.000 caracteres.')

  if (Object.keys(errors).length > 0 || !topic) {
    return { status: 'error', message: t('Please check the highlighted fields.', 'Revisa los campos marcados.'), errors }
  }

  // Freno al envío masivo: 5 mensajes por conexión cada hora.
  const ip = ipHash(await clientIp())
  if ((one<{ n: number }>('SELECT COUNT(*) AS n FROM signup_log WHERE ipHash = ? AND createdAt > ?', [`contact:${ip}`, new Date(Date.now() - 3_600_000).toISOString()])?.n ?? 0) >= 5) {
    return { status: 'error', message: t('Too many messages in a short time. Try again later or write to contact@placton.tech.', 'Demasiados mensajes seguidos. Prueba más tarde o escríbenos a contact@placton.tech.') }
  }
  run('INSERT INTO signup_log (ipHash, createdAt) VALUES (?, ?)', [`contact:${ip}`, new Date().toISOString()])

  try {
    saveContact({ name, email, topic, message, userId: null })
    // Aviso al equipo para responder pronto (no hace falta mirar el panel).
    void sendEmail({
      to: process.env.PLACTON_SUPPORT_EMAIL || 'contact@placton.tech',
      subject: `[Placton · contacto] ${topic}: ${name}`,
      kind: 'contacto',
      title: `Mensaje de ${name} (${email})`,
      body: `Motivo: ${topic}\n\n${message}`,
      lang: 'es',
    })
  } catch (e) {
    console.error('[contact] could not save the message', e)
    return {
      status: 'error',
      message: t(
        'We could not send your message. Please try again in a moment or write to contact@placton.tech.',
        'No hemos podido enviar tu mensaje. Inténtalo de nuevo en un momento o escríbenos a contact@placton.tech.',
      ),
    }
  }

  return { status: 'ok' }
}
