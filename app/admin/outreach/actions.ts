'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, isAdmin } from '@/lib/auth'
import { one, run } from '@/lib/db'
import { saveSettings, sendStep, settings, suppress, type Contact, type Mailbox } from '@/lib/outreach/engine'

// Acciones del panel de la campaña. Todas comprueban que quien llama es administrador.

async function guard() {
  const user = await currentUser()
  if (!user || !isAdmin(user)) redirect('/admin')
}

const back = (q: Record<string, string>) => redirect(`/admin/outreach?${new URLSearchParams(q)}`)

export async function toggleRunningAction() {
  await guard()
  const s = settings()
  saveSettings({ running: !s.running })
  revalidatePath('/admin/outreach')
}

export async function mailboxAction(form: FormData) {
  await guard()
  const email = String(form.get('email') ?? '')
  const op = String(form.get('op') ?? '')
  if (!one('SELECT 1 AS x FROM outreach_mailboxes WHERE email = ?', [email])) back({ error: 'Ese buzón no existe.' })
  if (op === 'pause') run("UPDATE outreach_mailboxes SET paused = 1, pausedReason = 'Parado a mano' WHERE email = ?", [email])
  if (op === 'resume') run('UPDATE outreach_mailboxes SET paused = 0, pausedReason = NULL, nextSendAt = NULL, resumedAt = ? WHERE email = ?', [new Date().toISOString(), email])
  if (op === 'remove') {
    // Los hilos a medias de ese buzón se cierran: nadie más puede seguirlos en el mismo hilo.
    run("UPDATE outreach_contacts SET status = 'done', nextAt = NULL WHERE mailbox = ? AND status = 'active'", [email])
    run('DELETE FROM outreach_mailboxes WHERE email = ?', [email])
  }
  if (op === 'edit') {
    const name = String(form.get('name') ?? '').trim().slice(0, 60)
    const warmup = String(form.get('warmupFrom') ?? '')
    if (name) run('UPDATE outreach_mailboxes SET name = ? WHERE email = ?', [name, email])
    if (/^\d{4}-\d{2}-\d{2}$/.test(warmup)) run('UPDATE outreach_mailboxes SET warmupFrom = ? WHERE email = ?', [`${warmup}T00:00:00.000Z`, email])
  }
  revalidatePath('/admin/outreach')
}

const nums = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split(/[\s,;]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)

export async function settingsAction(form: FormData) {
  await guard()
  const ramp = nums(form.get('ramp')).map(Math.round).slice(0, 12)
  const days = nums(form.get('days')).filter((d) => d >= 1 && d <= 7)
  const fromHour = Number(form.get('fromHour'))
  const toHour = Number(form.get('toHour'))
  const gapMin = Number(form.get('gapMin'))
  const gapMax = Number(form.get('gapMax'))
  const maxBounce = Number(form.get('maxBounce')) / 100
  if (!ramp.length || ramp.some((n) => n > 60)) back({ error: 'El calentamiento son cifras de 0 a 60 envíos al día por buzón.' })
  if (!days.length) back({ error: 'Elige al menos un día de envío.' })
  if (!(fromHour >= 0 && toHour <= 24 && fromHour < toHour)) back({ error: 'El horario no es válido.' })
  if (!(gapMin >= 1 && gapMax >= gapMin)) back({ error: 'El hueco entre envíos no es válido.' })
  if (!(maxBounce > 0 && maxBounce < 0.2)) back({ error: 'El tope de rebotes va entre 0,1 % y 20 %.' })
  const footer = String(form.get('footer') ?? '').trim().slice(0, 400)
  if (!/\d/.test(footer) || !/no|unsubscribe/i.test(footer)) back({ error: 'El pie debe llevar la dirección postal y cómo darse de baja (lo exige la ley).' })
  saveSettings({ ramp, days, fromHour, toHour, gapMin, gapMax, maxBounce, listUnsubscribe: form.get('listUnsubscribe') === 'on', footer })
  back({ ok: 'Ajustes guardados.' })
}

/** Manda a una dirección propia el paso elegido de un contacto de ejemplo, para ver cómo llega. */
export async function testAction(form: FormData) {
  await guard()
  const email = String(form.get('mailbox') ?? '')
  const to = String(form.get('to') ?? '').trim()
  const audience = String(form.get('audience') ?? '')
  const step = Math.max(0, Number(form.get('step')) || 0)
  const box = one<Mailbox>('SELECT * FROM outreach_mailboxes WHERE email = ?', [email])
  if (!box) back({ error: 'Elige un buzón conectado.' })
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) back({ error: 'Escribe una dirección de destino válida.' })
  const c = one<Contact>(
    `SELECT * FROM outreach_contacts WHERE (? = '' OR audience = ?) AND json_array_length(steps) > ? ORDER BY CASE hook WHEN 'not-named' THEN 0 WHEN 'named' THEN 1 ELSE 2 END, priority DESC LIMIT 1`,
    [audience, audience, step],
  )
  if (!c) back({ error: 'No hay contactos importados de ese tipo con ese paso.' })
  try {
    await sendStep(box!, { ...c!, step }, settings(), { to })
  } catch (err) {
    back({ error: `Google no lo ha enviado: ${(err as Error).message}` })
  }
  back({ ok: `Prueba enviada a ${to} desde ${email} (paso ${step + 1} de ${c!.company || c!.domain}).` })
}

export async function suppressAction(form: FormData) {
  await guard()
  const raw = String(form.get('value') ?? '').trim().toLowerCase()
  const value = raw.includes('@') ? raw : raw ? `@${raw.replace(/^www\./, '')}` : ''
  if (!value) back({ error: 'Escribe un correo o un dominio.' })
  suppress(value, 'a mano')
  run("UPDATE outreach_contacts SET status = 'unsubscribed', nextAt = NULL WHERE (email = ? OR '@' || domain = ?) AND status IN ('pending', 'active')", [value, value])
  back({ ok: `${value} no recibirá más correos.` })
}
