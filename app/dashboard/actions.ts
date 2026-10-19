'use server'

import { domainTrialUsed } from '@/lib/abuse'
import { resolveCompetitorDomain } from '@/lib/brandDomain'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { suggestPrompts } from '@/lib/ai'
import { runAudit, saveAudit } from '@/lib/audit'
import { canManage, endOtherSessions, endSession, hashPassword, passwordProblem, randomToken, requireCtx, requireUser, verifyPassword } from '@/lib/auth'
import { digestByDefault } from '@/lib/digest'
import { appUrl, sendEmail, siteUrl } from '@/lib/email'
import { libMessage } from '@/components/panel/format'
import { availablePlatformIds } from '@/lib/engines'
import { getT } from '@/lib/i18n'
import { markInsightsRead } from '@/lib/insights'
import { isPaidPlan, PLANS, type Interval } from '@/lib/plans'
import * as repo from '@/lib/repo'
import * as billing from '@/lib/stripe'
import { activeRun, startRun, trialManualRunsLeft, trialMeasurements } from '@/lib/tracking'
import type { Role } from '@/lib/types'
import { LOGO_MAX_BYTES, removeWorkspaceLogo, saveWorkspaceLogo } from '@/lib/workspaceLogo'

export interface ActionResult {
  ok?: string
  error?: string
  link?: string
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return host ? `${proto}://${host}` : appUrl()
}

async function managerCtx() {
  const ctx = await requireCtx()
  if (!canManage(ctx.role)) {
    const { t } = await getT()
    throw new Error(t('Only workspace admins can do this.', 'Solo quien administra el espacio puede hacer esto.'))
  }
  return ctx
}

/* ───────────── Espacio activo ───────────── */

export async function switchWorkspaceAction(fd: FormData) {
  const user = await requireUser()
  const id = Number(fd.get('id'))
  if (repo.roleIn(id, user.id)) repo.updateUser(user.id, { currentWorkspaceId: id })
  redirect('/dashboard')
}

/* ───────────── Medición ───────────── */

export async function runNowAction(): Promise<ActionResult> {
  const { workspace } = await requireCtx()
  const { lang, t } = await getT()
  // Prueba gratis: un solo «Medir ahora» en toda la prueba (cada medición cuesta API),
  // y nunca antes de confirmar el correo si aún no tiene ninguna medición.
  if (repo.isFreeTrial(workspace) && !activeRun(workspace.id)) {
    if (!trialMeasurements(workspace.id).first && repo.creatorEmailPending(workspace)) {
      return { error: t('Confirm your email first. We start measuring as soon as you do.', 'Confirma antes tu correo. En cuanto lo hagas, empezamos a medir.') }
    }
    if (trialManualRunsLeft(workspace) === 0) {
      return {
        error: t(
          'The free trial includes one “Run now” and you have already used it. Choose a plan to run it whenever you want.',
          'La prueba gratis incluye un «Medir ahora» y ya lo has usado. Elige un plan para medir cuando quieras.',
        ),
      }
    }
  }
  const res = startRun(workspace.id, 'manual')
  if (!res.runId) return { error: res.reason ? libMessage(res.reason, lang) : t("Couldn't start the run.", 'No se pudo lanzar la medición.') }
  return { ok: t('Run started', 'Medición en marcha') }
}

/* ───────────── Prompts ───────────── */

export async function addPromptAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { workspace } = await requireCtx()
  const { t } = await getT()
  const text = s(fd, 'text')
  const topic = s(fd, 'topic') || 'General'
  if (text.length < 8) return { error: t('Write the full question, the way a customer would ask it.', 'Escribe la pregunta completa, como la haría un cliente.') }
  if (repo.activePromptCount(workspace.id) >= repo.promptLimit(workspace)) return { error: t("You've reached your plan's prompt limit.", 'Has llegado al límite de prompts de tu plan.') }
  const id = repo.addPrompt(workspace.id, text, topic, 'manual')
  if (!id) return { error: t('That prompt is already on the list.', 'Esa pregunta ya está en la lista.') }
  revalidatePath('/dashboard/prompts')
  // En la prueba gratis, con su «Medir ahora» ya usado, no se le ofrece.
  if (trialManualRunsLeft(workspace) === 0) return { ok: t('Added. It will be tracked in your next measurement.', 'Añadida. Se medirá en tu próxima medición.') }
  return { ok: t('Added. It will be tracked in the next weekly run, or right now with “Run now”.', 'Añadida. Se medirá en la próxima medición semanal o ahora mismo con «Medir ahora».') }
}

export async function togglePromptAction(fd: FormData) {
  const { workspace } = await requireCtx()
  const id = Number(fd.get('id'))
  const active = fd.get('active') === '1'
  if (active && repo.activePromptCount(workspace.id) >= repo.promptLimit(workspace)) return
  repo.setPromptActive(workspace.id, id, active)
  revalidatePath('/dashboard/prompts')
}

export async function deletePromptAction(fd: FormData) {
  const { workspace } = await requireCtx()
  repo.deletePrompt(workspace.id, Number(fd.get('id')))
  revalidatePath('/dashboard/prompts')
}

export async function editPromptAction(fd: FormData) {
  const { workspace } = await requireCtx()
  const text = s(fd, 'text')
  if (text.length >= 8) repo.updatePrompt(workspace.id, Number(fd.get('id')), text, s(fd, 'topic') || 'General')
  revalidatePath('/dashboard/prompts')
}

export async function acceptSuggestionAction(fd: FormData) {
  const { workspace } = await requireCtx()
  if (repo.activePromptCount(workspace.id) >= repo.promptLimit(workspace)) return
  const sug = repo.setSuggestionStatus(workspace.id, Number(fd.get('id')), 'aceptada')
  if (sug) repo.addPrompt(workspace.id, sug.text, sug.topic, 'sugerido')
  revalidatePath('/dashboard/prompts')
}

export async function dismissSuggestionAction(fd: FormData) {
  const { workspace } = await requireCtx()
  repo.setSuggestionStatus(workspace.id, Number(fd.get('id')), 'descartada')
  revalidatePath('/dashboard/prompts')
}

export async function moreSuggestionsAction(): Promise<ActionResult> {
  const { workspace } = await requireCtx()
  const { lang, t } = await getT()
  // Cuesta una consulta a la IA: solo con la prueba o la suscripción activas, y con freno.
  if (!repo.accessOf(workspace).ok) return { error: t('Choose a plan to get new suggestions.', 'Elige un plan para recibir sugerencias nuevas.') }
  if (repo.suggestionsOf(workspace.id).length >= 40) return { error: t('Review the suggestions you already have first.', 'Revisa antes las sugerencias que ya tienes.') }
  try {
    const items = await suggestPrompts(
      {
        brandName: workspace.brandName,
        domain: workspace.domain,
        description: workspace.description,
        country: workspace.country,
        language: workspace.language,
        competitors: repo.competitorsOf(workspace.id).map((c) => c.name),
        existing: [...repo.promptsOf(workspace.id), ...repo.suggestionsOf(workspace.id)].map((p) => p.text),
      },
      8,
      lang,
    )
    repo.addSuggestions(workspace.id, items)
    revalidatePath('/dashboard/prompts')
    return { ok: t(`${items.length} new suggestions`, `${items.length} sugerencias nuevas`) }
  } catch {
    return { error: t("We couldn't generate suggestions right now. Try again in a while.", 'No hemos podido generar sugerencias ahora mismo. Inténtalo en un rato.') }
  }
}

/* ───────────── Competidores ───────────── */

export async function addCompetitorAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { workspace } = await requireCtx()
  const { t } = await getT()
  const name = s(fd, 'name')
  if (!name) return { error: t("Enter the competitor's name.", 'Escribe el nombre del competidor.') }
  if (repo.competitorsOf(workspace.id).length >= repo.MAX_COMPETITORS) return { error: t('You can track up to 25 competitors.', 'Puedes seguir hasta 25 competidores.') }
  const aliases = s(fd, 'aliases')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  const id = repo.addCompetitor(workspace.id, name, s(fd, 'domain'), aliases)
  if (!id) return { error: t('That competitor is already on the list (or is your own brand).', 'Ese competidor ya está en la lista (o es tu propia marca).') }
  // Buscar su web cuesta una consulta a la IA: solo con la suscripción activa.
  if (!s(fd, 'domain') && repo.accessOf(workspace).ok) await resolveCompetitorDomain(workspace.id, id)
  revalidatePath('/dashboard/competitors')
  return { ok: t(`${name} added. You'll see it in new runs.`, `${name} añadido. Lo verás en las mediciones nuevas.`) }
}

export async function quickAddCompetitorAction(fd: FormData) {
  const { workspace } = await requireCtx()
  const id = repo.addCompetitor(workspace.id, s(fd, 'name'), s(fd, 'domain'))
  // Sin web no hay logo: se busca al momento (fuentes ya citadas o una búsqueda corta), si la suscripción está activa.
  if (id && !s(fd, 'domain') && repo.accessOf(workspace).ok) await resolveCompetitorDomain(workspace.id, id)
  revalidatePath('/dashboard/competitors')
  revalidatePath('/dashboard')
}

export async function updateCompetitorAction(fd: FormData) {
  const { workspace } = await requireCtx()
  const aliases = s(fd, 'aliases')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  const id = Number(fd.get('id'))
  const name = s(fd, 'name').slice(0, 80)
  if (name && !repo.brandNameTaken(workspace.id, name, id)) repo.updateCompetitor(workspace.id, id, name, s(fd, 'domain'), aliases)
  revalidatePath('/dashboard/competitors')
}

export async function removeCompetitorAction(fd: FormData) {
  const { workspace } = await requireCtx()
  repo.removeCompetitor(workspace.id, Number(fd.get('id')))
  revalidatePath('/dashboard/competitors')
}

/* ───────────── Ideas ───────────── */

export async function markIdeasReadAction() {
  const { workspace } = await requireCtx()
  markInsightsRead(workspace.id)
  revalidatePath('/dashboard', 'layout')
}

/* ───────────── Auditoría ───────────── */

export async function auditAction(_: ActionResult & { id?: number }, fd: FormData): Promise<ActionResult & { id?: number }> {
  const { workspace } = await requireCtx()
  const { lang, t } = await getT()
  if (!repo.accessOf(workspace).ok) return { error: t('Choose a plan to run new audits.', 'Elige un plan para hacer auditorías nuevas.') }
  if (repo.recentAudits(workspace.id) >= 10) return { error: t('You have run many audits in the last hour. Try again later.', 'Has hecho muchas auditorías en la última hora. Prueba más tarde.') }
  const url = s(fd, 'url') || workspace.domain
  if (!url) return { error: t('Enter the address of the website you want to audit.', 'Escribe la dirección de la web que quieres auditar.') }
  const res = await runAudit(url, lang)
  if ('error' in res) return { error: res.error }
  const id = saveAudit(workspace.id, res.url, res.score, res.results)
  revalidatePath('/dashboard/audit')
  redirect(`/dashboard/audit?id=${id}`)
}

/* ───────────── Ajustes del espacio ───────────── */

export async function saveWorkspaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { workspace } = await managerCtx()
  const { t } = await getT()
  const newDomain = s(fd, 'domain')
  if (workspace.plan === 'trial' && newDomain && newDomain !== workspace.domain && domainTrialUsed(newDomain, workspace.id)) {
    return { error: t('That website already had its free trial. Choose a plan to track it.', 'Esa web ya tuvo su prueba gratis. Elige un plan para medirla.') }
  }
  const name = s(fd, 'name')
  const brandName = s(fd, 'brandName')
  if (!name || !brandName) return { error: t('The workspace and the brand both need a name.', 'El espacio y la marca necesitan nombre.') }
  // El historial de la marca sigue con su nombre nuevo.
  repo.rekeyBrand(workspace.id, workspace.brandName || workspace.name, brandName)
  repo.updateWorkspace(workspace.id, {
    name: name.slice(0, 80),
    brandName: brandName.slice(0, 80),
    domain: s(fd, 'domain'),
    aliases: s(fd, 'aliases')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 10),
    description: s(fd, 'description').slice(0, 600),
    country: s(fd, 'country') || 'España',
    language: (s(fd, 'language') || 'es').slice(0, 2),
  })
  revalidatePath('/dashboard', 'layout')
  return { ok: t('Changes saved.', 'Cambios guardados.') }
}

export async function uploadLogoAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { workspace } = await managerCtx()
  const { t } = await getT()
  const f = fd.get('logo')
  if (!(f instanceof File) || !f.size) return { error: t('Choose an image first.', 'Elige antes una imagen.') }
  if (f.size > LOGO_MAX_BYTES) return { error: t('The image is too large (3 MB max).', 'La imagen pesa demasiado (máximo 3 MB).') }
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml|avif)$/.test(f.type)) return { error: t('Use a PNG, JPG, WebP or SVG image.', 'Usa una imagen PNG, JPG, WebP o SVG.') }
  const ok = await saveWorkspaceLogo(workspace.id, Buffer.from(await f.arrayBuffer()))
  if (!ok) return { error: t("We couldn't read that image. Try another file.", 'No hemos podido leer esa imagen. Prueba con otro archivo.') }
  revalidatePath('/dashboard', 'layout')
  return { ok: t('Logo updated.', 'Logo actualizado.') }
}

export async function removeLogoAction(_: ActionResult): Promise<ActionResult> {
  const { workspace } = await managerCtx()
  const { t } = await getT()
  await removeWorkspaceLogo(workspace.id)
  revalidatePath('/dashboard', 'layout')
  return { ok: t("Back to your website's icon.", 'Vuelve a salir el icono de tu web.') }
}

export async function saveEnginesAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { workspace } = await managerCtx()
  const { t } = await getT()
  const avail = availablePlatformIds() as string[]
  const chosen = fd.getAll('engines').map(String).filter((e) => avail.includes(e))
  if (!chosen.length) return { error: t('Keep at least one platform active.', 'Deja al menos una plataforma activa.') }
  repo.updateWorkspace(workspace.id, { engines: chosen })
  revalidatePath('/dashboard/settings')
  return { ok: t('Platforms updated. Changes apply from the next run.', 'Plataformas actualizadas. Se aplican desde la próxima medición.') }
}

/**
 * Resumen semanal por correo. Qué se envía en el espacio (todo, solo alertas o
 * nada) lo decide quien administra; si te llega a ti, cada persona.
 */
export async function saveDigestAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { workspace, role, user } = await requireCtx()
  const { t } = await getT()
  const manage = canManage(role)
  if (manage) {
    const mode = s(fd, 'mode')
    if (mode === 'all' || mode === 'alerts' || mode === 'off') repo.updateWorkspace(workspace.id, { digestMode: mode })
  }
  // Si coincide con lo que toca por su rol no se guarda: así, si cambia de rol, vale lo del rol nuevo.
  const me = fd.get('me') === 'on'
  repo.setEmailPref(user.id, workspace.id, 'semanal', me === digestByDefault(role) ? null : me)
  revalidatePath('/dashboard/settings')
  return { ok: t('Email preferences saved.', 'Preferencias de correo guardadas.') }
}

export async function deleteWorkspaceAction(fd: FormData) {
  const { workspace, role, user } = await requireCtx({ allowUnonboarded: true })
  if (role !== 'owner') return
  if (s(fd, 'confirm') !== workspace.name) return
  if (repo.membersOf(workspace.id).length > 1) return
  // Primero se cancela el cobro; si Stripe falla, no se borra nada (si no, seguiría cobrando sin espacio).
  if (workspace.stripeSubscriptionId && workspace.status !== 'canceled' && !(await billing.cancelImmediately(workspace.stripeSubscriptionId))) {
    redirect(`/dashboard/settings/billing?error=${encodeURIComponent('No hemos podido cancelar la suscripción en Stripe. No se ha borrado nada: inténtalo de nuevo o escríbenos.')}`)
  }
  repo.deleteWorkspace(workspace.id)
  const next = repo.workspacesOf(user.id)[0]
  repo.updateUser(user.id, { currentWorkspaceId: next?.id ?? null })
  redirect(next ? '/dashboard' : '/onboarding')
}

/* ───────────── Miembros ───────────── */

export async function inviteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { workspace, user } = await managerCtx()
  const { lang, t } = await getT()
  const email = s(fd, 'email').toLowerCase()
  const role = (s(fd, 'role') === 'admin' ? 'admin' : 'member') as Role
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: t("That email doesn't look valid.", 'Ese correo no parece válido.') }
  if (workspace.plan === 'trial') return { error: t("You can't invite your team during the trial. Choose a plan to do it.", 'Durante la prueba no se puede invitar al equipo. Elige un plan para hacerlo.') }
  const limit = repo.memberLimit(workspace)
  const taken = repo.membersOf(workspace.id).length + repo.pendingInvites(workspace.id).length
  if (limit !== null && taken >= limit) return { error: t(`Your plan allows ${limit} members. Upgrade to invite more.`, `Tu plan admite ${limit} miembros. Mejora el plan para invitar a más.`) }
  const existing = repo.userByEmail(email)
  if (existing && repo.roleIn(workspace.id, existing.id)) return { error: t('That person is already in the workspace.', 'Esa persona ya está en el espacio.') }
  if (repo.recentInvites(workspace.id) >= 10) return { error: t('Too many invitations in the last hour. Try again later.', 'Demasiadas invitaciones en la última hora. Prueba más tarde.') }

  const invite = repo.createInvite(workspace.id, email, role, user.id, randomToken(24))
  const link = `${appUrl()}/invite/${invite.token}`
  const inviter = repo.displayName(user).slice(0, 60)
  const brand = (workspace.brandName || workspace.name).slice(0, 80)
  // La invitación sale en el idioma de quien invita.
  const sent = await sendEmail({
    to: email,
    subject: t(`${inviter} invited you to ${workspace.name} on Placton`, `${inviter} te invita a ${workspace.name} en Placton`),
    kind: 'invitacion',
    title: t(`You've been invited to ${workspace.name}`, `Te han invitado a ${workspace.name}`),
    body: t(
      `${inviter} wants you to see with their team how ${brand} shows up in answers from ChatGPT, Claude, Google AI, Perplexity and Grok.`,
      `${inviter} quiere que veas con su equipo cómo aparece ${brand} en las respuestas de ChatGPT, Claude, Google AI, Perplexity y Grok.`,
    ),
    cta: { label: t('Accept invitation', 'Aceptar invitación'), url: link },
    lang,
  })
  revalidatePath('/dashboard/settings/members')
  return sent
    ? { ok: t(`Invitation sent to ${email}.`, `Invitación enviada a ${email}.`) }
    : { ok: t(`Invitation created. Share this link with ${email}:`, `Invitación creada. Comparte este enlace con ${email}:`), link }
}

export async function revokeInviteAction(fd: FormData) {
  const { workspace } = await managerCtx()
  repo.revokeInvite(workspace.id, Number(fd.get('id')))
  revalidatePath('/dashboard/settings/members')
}

export async function changeRoleAction(fd: FormData) {
  const { workspace, role, user } = await managerCtx()
  const target = Number(fd.get('userId'))
  const newRole = s(fd, 'role') as Role
  if (target === user.id || !['admin', 'member', 'owner'].includes(newRole)) return
  if (newRole === 'owner' && role !== 'owner') return
  if (repo.roleIn(workspace.id, target) === 'owner' && role !== 'owner') return
  repo.setMemberRole(workspace.id, target, newRole)
  revalidatePath('/dashboard/settings/members')
}

export async function removeMemberAction(fd: FormData) {
  const { workspace, role, user } = await requireCtx()
  const target = Number(fd.get('userId'))
  const self = target === user.id
  if (!self && !canManage(role)) return
  const targetRole = repo.roleIn(workspace.id, target)
  if (!targetRole) return
  if (targetRole === 'owner' && !self) return
  if (self && targetRole === 'owner' && !repo.membersOf(workspace.id).some((m) => m.userId !== user.id && m.role === 'owner')) {
    // El último propietario no puede irse sin pasar la propiedad.
    return
  }
  repo.removeMember(workspace.id, target)
  // Quien sale de una agencia sale también de todos sus clientes.
  if (workspace.plan === 'agencia' && !workspace.billingOwnerId) {
    for (const c of repo.agencyClients(workspace.id)) if (c.id !== workspace.id) repo.removeMember(c.id, target)
  }
  if (self) redirect('/dashboard')
  revalidatePath('/dashboard/settings/members')
}

/* ───────────── Espacios nuevos ───────────── */

/**
 * «Nuevo espacio» o, en una agencia, «Nuevo cliente». Es un formulario (POST):
 * un enlace externo no puede crear espacios ni gastar plazas de la agencia.
 */
export async function newWorkspaceAction() {
  const user = await requireUser()
  const { t } = await getT()
  const spaces = repo.workspacesOf(user.id)
  // Si ya hay uno a medias, se sigue con ese.
  if (spaces.some((w) => !w.onboarded && w.role === 'owner')) redirect('/onboarding')
  const current = user.currentWorkspaceId ? repo.workspaceById(user.currentWorkspaceId) : null
  const owner = current ? repo.agencyOwnerOf(current) : null
  if (owner) {
    const role = repo.roleIn(owner.id, user.id)
    if (!role || !canManage(role)) redirect('/dashboard')
    if (!repo.accessOf(owner).ok) redirect('/dashboard/plans')
    // Con la bolsa de prompts agotada, el cliente nuevo no podría terminar el alta.
    if (repo.agencyPromptsUsed(owner.id) >= (owner.promptPool || PLANS.agencia.prompts))
      redirect(`/dashboard/settings/billing?error=${encodeURIComponent('Tu bolsa de prompts está agotada. Añade más antes de crear otro cliente.')}`)
    const client = repo.createClientWorkspace(user.id, owner, 'New client')
    if (!client) redirect(`/dashboard/settings/billing?error=${encodeURIComponent('Has usado todos los clientes de tu plan. Añade más aquí.')}`)
    redirect('/onboarding')
  }
  if (spaces.some((w) => w.onboarded) && !repo.canCreateWorkspace(user.id)) {
    redirect(`/dashboard/settings/billing?error=${encodeURIComponent('La prueba gratis incluye un solo espacio. Elige un plan para crear más.')}`)
  }
  repo.createWorkspace(user.id, 'My workspace')
  redirect('/onboarding')
}

/* ───────────── Pagos ───────────── */

/**
 * La facturación se decide con el papel en el espacio QUE PAGA: en un cliente de
 * agencia es la agencia. Ser administrador de un cliente no da acceso a la
 * suscripción, la tarjeta ni las facturas de la agencia.
 */
async function billingCtx(opts?: { allowUnonboarded?: boolean }) {
  const ctx = await requireCtx(opts)
  const payer = repo.agencyOwnerOf(ctx.workspace) ?? ctx.workspace
  const role = payer.id === ctx.workspace.id ? ctx.role : repo.roleIn(payer.id, ctx.user.id)
  return { ...ctx, payer, canBill: Boolean(role && canManage(role)) }
}

export async function checkoutAction(fd: FormData) {
  const { user, payer, canBill } = await billingCtx({ allowUnonboarded: true })
  if (!canBill) redirect('/dashboard/plans?error=permiso')
  const plan = s(fd, 'plan')
  const interval: Interval = s(fd, 'interval') === 'year' ? 'year' : 'month'
  if (!isPaidPlan(plan)) redirect('/dashboard/plans')
  const res = await billing.checkout(payer, user, plan, interval, await origin(), Number(s(fd, 'clients')) || 1, Number(s(fd, 'prompts')) || 0)
  if ('url' in res) redirect(res.url)
  if ('changed' in res) redirect('/dashboard/settings/billing?cambio=1')
  redirect(`/dashboard/plans?error=${encodeURIComponent(res.error)}`)
}

export async function setClientsAction(fd: FormData) {
  const { workspace, canBill } = await billingCtx()
  if (!canBill) redirect('/dashboard/settings/billing')
  const owner = repo.agencyOwnerOf(workspace)
  if (!owner) redirect('/dashboard/plans')
  const res = await billing.setAgency(owner, Number(s(fd, 'clients')) || 0, Number(s(fd, 'prompts')) || 0)
  if ('error' in res) redirect(`/dashboard/settings/billing?error=${encodeURIComponent(res.error)}`)
  revalidatePath('/dashboard', 'layout')
  redirect('/dashboard/settings/billing?cambio=1')
}

export async function portalAction() {
  const { payer, canBill } = await billingCtx({ allowUnonboarded: true })
  if (!canBill) redirect('/dashboard/settings/billing')
  const res = await billing.portal(payer, await origin())
  if ('url' in res) redirect(res.url)
  redirect(`/dashboard/settings/billing?error=${encodeURIComponent(res.error)}`)
}

export async function cancelSubscriptionAction(fd: FormData) {
  const { payer, canBill } = await billingCtx()
  if (!canBill) return
  const res = await billing.cancelAtPeriodEnd(payer, fd.get('undo') !== '1')
  if ('error' in res) redirect(`/dashboard/settings/billing?error=${encodeURIComponent(res.error)}`)
  revalidatePath('/dashboard', 'layout')
  redirect('/dashboard/settings/billing')
}

/* ───────────── Cuenta ───────────── */

export async function saveProfileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const { t } = await getT()
  const firstName = s(fd, 'firstName')
  const email = s(fd, 'email').toLowerCase()
  if (!firstName) return { error: t('Enter your name.', 'Escribe tu nombre.') }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: t("That email doesn't look valid.", 'Ese correo no parece válido.') }
  const other = repo.userByEmail(email)
  if (other && other.id !== user.id) return { error: t('Another account already uses that email.', 'Ese correo ya lo usa otra cuenta.') }
  const changing = email !== user.email.toLowerCase()
  if (changing) {
    // El correo de una cuenta de Google lo pone Google; en las demás, cambiarlo exige la contraseña.
    if (user.googleId) return { error: t('Your email comes from your Google account and cannot be changed here.', 'Tu correo viene de tu cuenta de Google y no se puede cambiar aquí.') }
    if (!user.passwordHash || !(await verifyPassword(String(fd.get('current') ?? ''), user.passwordHash)))
      return { error: t('Enter your current password to change your email.', 'Escribe tu contraseña actual para cambiar el correo.') }
  }
  repo.updateUser(user.id, { firstName, lastName: s(fd, 'lastName'), email })
  if (changing) {
    // Los enlaces y sesiones anteriores dejan de valer, y se avisa a la dirección antigua.
    repo.clearPasswordResets(user.id)
    await endOtherSessions(user.id)
    await sendEmail({
      to: user.email,
      subject: 'Placton: el correo de tu cuenta ha cambiado',
      kind: 'cambio-correo',
      title: 'Has cambiado el correo de tu cuenta',
      body: `El correo de tu cuenta de Placton es ahora ${email}. Si no has sido tú, escríbenos a contact@placton.tech cuanto antes.`,
      lang: 'es',
    })
  }
  revalidatePath('/dashboard', 'layout')
  return { ok: t('Profile saved.', 'Perfil guardado.') }
}

export async function changePasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const { lang, t } = await getT()
  const current = String(fd.get('current') ?? '')
  const next = String(fd.get('next') ?? '')
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) return { error: t('Your current password is incorrect.', 'La contraseña actual no es correcta.') }
  const problem = passwordProblem(next)
  if (problem) return { error: libMessage(problem, lang) }
  repo.updateUser(user.id, { passwordHash: await hashPassword(next) })
  // Las demás sesiones (otro navegador, otra persona) se cierran.
  repo.clearPasswordResets(user.id)
  await endOtherSessions(user.id)
  return { ok: t('Password changed. Other sessions have been signed out.', 'Contraseña cambiada. Se han cerrado las demás sesiones.') }
}

export async function deleteAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const { t } = await getT()
  // Vale la palabra de cualquiera de los dos idiomas: DELETE o BORRAR.
  if (!['borrar', 'delete'].includes(s(fd, 'confirm').toLowerCase())) return { error: t('Type DELETE to confirm.', 'Escribe BORRAR para confirmar.') }
  const plan = repo.deletionPlan(user.id)
  if (plan.sharedPaid.length) {
    return {
      error: t(
        `You own a paid workspace shared with others (${plan.sharedPaid.join(', ')}). Cancel its subscription or hand over ownership before deleting your account.`,
        `Eres propietario de un espacio de pago compartido (${plan.sharedPaid.join(', ')}). Cancela su suscripción o pasa la propiedad antes de borrar tu cuenta.`,
      ),
    }
  }
  // Primero se cancelan los cobros; si Stripe falla, no se borra nada.
  for (const sub of plan.cancel) {
    if (!(await billing.cancelImmediately(sub)))
      return { error: t("We couldn't cancel your subscription in Stripe. Nothing was deleted: please try again or write to us.", 'No hemos podido cancelar tu suscripción en Stripe. No se ha borrado nada: inténtalo de nuevo o escríbenos.') }
  }
  repo.deleteUser(user.id)
  await endSession()
  redirect(`${siteUrl()}/?cuenta=borrada`)
}
