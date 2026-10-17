'use server'

import { requireUser } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { getT } from '@/lib/i18n'
import { saveContact } from '@/lib/repo'

export async function helpContactAction(_: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  const user = await requireUser()
  const { t } = await getT()
  const message = String(fd.get('message') ?? '').trim()
  const topic = String(fd.get('topic') ?? 'Soporte')
  if (message.length < 5) return { error: t('Write a little more so we can help you.', 'Escribe un poco más para que podamos ayudarte.') }
  saveContact({ name: String(fd.get('name') ?? ''), email: user.email, topic, message, userId: user.id })
  const to = process.env.PLACTON_SUPPORT_EMAIL
  if (to) {
    await sendEmail({ to, subject: `[Placton · ${topic}] ${user.email}`, kind: 'soporte', title: `${topic} de ${user.email}`, body: message, lang: 'es' })
  }
  return { ok: t("Got it. We'll reply by email as soon as possible.", 'Recibido. Te contestamos por correo lo antes posible.') }
}
