'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, isAdmin } from '@/lib/auth'
import { appUrl, sendEmail } from '@/lib/email'
import { AGENCY_PROMPTS_MAX, AGENCY_PROMPTS_MIN, PLANS, type PaidPlanId } from '@/lib/plans'
import * as repo from '@/lib/repo'

// Planes dados a mano desde la administración. Solo administradores.

async function guard() {
  const user = await currentUser()
  if (!user || !isAdmin(user)) redirect('/admin')
}

const back = (q: Record<string, string>) => redirect(`/admin/planes?${new URLSearchParams(q)}`)
const PAID: PaidPlanId[] = ['inicial', 'crecimiento', 'escala', 'agencia']

export async function grantAction(form: FormData) {
  await guard()
  const id = Number(form.get('workspaceId'))
  const plan = String(form.get('plan') ?? '') as PaidPlanId
  const untilRaw = String(form.get('until') ?? '').trim()
  const q = String(form.get('q') ?? '')
  if (!PAID.includes(plan)) back({ q, error: 'Elige un plan.' })
  if (untilRaw && !/^\d{4}-\d{2}-\d{2}$/.test(untilRaw)) back({ q, error: 'La fecha de fin no es válida.' })
  const until = untilRaw ? new Date(`${untilRaw}T23:59:59`).toISOString() : null
  if (until && new Date(until).getTime() < Date.now()) back({ q, error: 'La fecha de fin ya ha pasado.' })
  const seats = Math.min(100, Math.max(1, Number(form.get('seats')) || 1))
  const prompts = Math.min(AGENCY_PROMPTS_MAX, Math.max(AGENCY_PROMPTS_MIN, Number(form.get('prompts')) || AGENCY_PROMPTS_MIN))
  const note = String(form.get('note') ?? '').trim()
  const error = repo.grantManualPlan(id, { plan, until, seats, prompts, note })
  if (error) back({ q, error })
  const ws = repo.workspaceById(id)!
  // Aviso al propietario, en el idioma de su espacio.
  if (form.get('notify') === 'on') {
    const owner = repo.membersOf(id).find((m) => m.role === 'owner')
    if (owner) {
      const es = ws.language === 'es'
      const name = es ? PLANS[plan].nameEs : PLANS[plan].name
      const date = until ? new Date(until).toLocaleDateString(es ? 'es-ES' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
      void sendEmail({
        to: owner.email,
        subject: es ? `Te hemos activado el plan ${name} de Placton` : `Your Placton ${name} plan is active`,
        kind: 'plan-a-mano',
        title: es ? `Plan ${name} activado` : `${name} plan activated`,
        body: es
          ? `Hola${owner.firstName ? `, ${owner.firstName}` : ''}. Hemos activado el plan ${name} en ${ws.brandName || ws.name}${until ? ` hasta el ${date}` : ''}, sin coste para ti. Ya puedes usarlo.`
          : `Hi${owner.firstName ? ` ${owner.firstName}` : ''}, we've activated the ${name} plan for ${ws.brandName || ws.name}${until ? ` until ${date}` : ''}, at no cost to you. It's ready to use.`,
        cta: { label: es ? 'Ir al panel' : 'Go to dashboard', url: `${appUrl()}/dashboard` },
        lang: es ? 'es' : 'en',
      })
    }
  }
  revalidatePath('/admin/planes')
  back({ q, ok: `Plan ${PLANS[plan].nameEs} dado a ${ws.name}${until ? ` hasta el ${untilRaw}` : ' sin fecha de fin'}.` })
}

export async function revokeAction(form: FormData) {
  await guard()
  const id = Number(form.get('workspaceId'))
  const q = String(form.get('q') ?? '')
  const ws = repo.workspaceById(id)
  if (!ws?.manualPlan) back({ q, error: 'Ese espacio no tiene un plan dado a mano.' })
  repo.revokeManualPlan(id)
  revalidatePath('/admin/planes')
  back({ q, ok: `Plan quitado a ${ws!.name}. Tendrá que elegir un plan para seguir.` })
}
