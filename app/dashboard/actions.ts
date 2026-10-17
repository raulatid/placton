'use server'

import { resolveCompetitorDomain } from '@/lib/brandDomain'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { suggestPrompts } from '@/lib/ai'
import { runAudit, saveAudit } from '@/lib/audit'
import { canManage, endSession, hashPassword, passwordProblem, randomToken, requireCtx, requireUser, verifyPassword } from '@/lib/auth'
import { appUrl, sendEmail } from '@/lib/email'
import { libMessage } from '@/components/panel/format'
import { availablePlatformIds } from '@/lib/engines'
import { getT } from '@/lib/i18n'
import { markInsightsRead } from '@/lib/insights'
import { isPaidPlan, type Interval } from '@/lib/plans'
import * as repo from '@/lib/repo'
import * as billing from '@/lib/stripe'
import { startRun } from '@/lib/tracking'
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
  const { t } = await getT()
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
  if (repo.competitorsOf(workspace.id).length >= 25) return { error: t('You can track up to 25 competitors.', 'Puedes seguir hasta 25 competidores.') }
  const aliases = s(fd, 'aliases')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  const id = repo.addCompetitor(workspace.id, name, s(fd, 'domain'), aliases)
  if (!id) return { error: t('That competitor is already on the list.', 'Ese competidor ya está en la lista.') }
  if (!s(fd, 'domain')) await resolveCompetitorDomain(workspace.id, id)
  revalidatePath('/dashboard/competitors')
  return { ok: t(`${name} added. You'll see it in new runs.`, `${name} añadido. Lo verás en las mediciones nuevas.`) }
}

export async function quickAddCompetitorAction(fd: FormData) {
  const { workspace } = await requireCtx()
  const id = repo.addCompetitor(workspace.id, s(fd, 'name'), s(fd, 'domain'))
  // Sin web no hay logo: se busca al momento (fuentes ya citadas o una búsqueda corta).
  if (id && !s(fd, 'domain')) await resolveCompetitorDomain(workspace.id, id)
  revalidatePath('/dashboard/competitors')
  revalidatePath('/dashboard')
}

export async function updateCompetitorAction(fd: FormData) {
  const { workspace } = await requireCtx()
  const aliases = s(fd, 'aliases')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  if (s(fd, 'name')) repo.updateCompetitor(workspace.id, Number(fd.get('id')), s(fd, 'name'), s(fd, 'domain'), aliases)
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
  const name = s(fd, 'name')
  const brandName = s(fd, 'brandName')
  if (!name || !brandName) return { error: t('The workspace and the brand both need a name.', 'El espacio y la marca necesitan nombre.') }
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

export async function deleteWorkspaceAction(fd: FormData) {
  const { workspace, role, user } = await requireCtx({ allowUnonboarded: true })
  if (role !== 'owner') return
  if (s(fd, 'confirm') !== workspace.name) return
  if (repo.membersOf(workspace.id).length > 1) return
  if (workspace.stripeSubscriptionId && workspace.status !== 'canceled') await billing.cancelImmediately(workspace.stripeSubscriptionId)
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

  const invite = repo.createInvite(workspace.id, email, role, user.id, randomToken(24))
  const link = `${appUrl()}/invite/${invite.token}`
  const inviter = repo.displayName(user)
  const brand = workspace.brandName || workspace.name
  // La invitación sale en el idioma de quien invita.
  const sent = await sendEmail({
    to: email,
    subject: t(`${inviter} invited you to ${workspace.name} on Placton`, `${inviter} te invita a ${workspace.name} en Placton`),
    kind: 'invitacion',
    title: t(`You've been invited to ${workspace.name}`, `Te han invitado a ${workspace.name}`),
    body: t(
      `${inviter} wants you to see with their team how ${brand} shows up in answers from ChatGPT, Claude, Google AI and Perplexity.`,
      `${inviter} quiere que veas con su equipo cómo aparece ${brand} en las respuestas de ChatGPT, Claude, Google AI y Perplexity.`,
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
  if (self) redirect('/dashboard')
  revalidatePath('/dashboard/settings/members')
}

/* ───────────── Pagos ───────────── */

export async function checkoutAction(fd: FormData) {
  const { workspace, user, role } = await requireCtx({ allowUnonboarded: true })
  if (!canManage(role)) redirect('/dashboard/plans?error=permiso')
  const plan = s(fd, 'plan')
  const interval: Interval = s(fd, 'interval') === 'year' ? 'year' : 'month'
  if (!isPaidPlan(plan)) redirect('/dashboard/plans')
  // Un cliente de agencia contrata a través del espacio que paga.
  const payer = repo.agencyOwnerOf(workspace) ?? workspace
  const res = await billing.checkout(payer, user, plan, interval, await origin(), Number(s(fd, 'clients')) || 1, Number(s(fd, 'prompts')) || 0)
  if ('url' in res) redirect(res.url)
  if ('changed' in res) redirect('/dashboard/settings/billing?cambio=1')
  redirect(`/dashboard/plans?error=${encodeURIComponent(res.error)}`)
}

export async function setClientsAction(fd: FormData) {
  const { workspace, role } = await requireCtx()
  if (!canManage(role)) redirect('/dashboard/settings/billing')
  const owner = repo.agencyOwnerOf(workspace)
  if (!owner) redirect('/dashboard/plans')
  const res = await billing.setAgency(owner, Number(s(fd, 'clients')) || 0, Number(s(fd, 'prompts')) || 0)
  if ('error' in res) redirect(`/dashboard/settings/billing?error=${encodeURIComponent(res.error)}`)
  revalidatePath('/dashboard', 'layout')
  redirect('/dashboard/settings/billing?cambio=1')
}

export async function portalAction() {
  const { workspace, role } = await requireCtx({ allowUnonboarded: true })
  if (!canManage(role)) redirect('/dashboard/settings/billing')
  const res = await billing.portal(repo.agencyOwnerOf(workspace) ?? workspace, await origin())
  if ('url' in res) redirect(res.url)
  redirect(`/dashboard/settings/billing?error=${encodeURIComponent(res.error)}`)
}

export async function cancelSubscriptionAction(fd: FormData) {
  const { workspace, role } = await requireCtx()
  if (!canManage(role)) return
  const res = await billing.cancelAtPeriodEnd(repo.agencyOwnerOf(workspace) ?? workspace, fd.get('undo') !== '1')
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
  repo.updateUser(user.id, { firstName, lastName: s(fd, 'lastName'), email })
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
  return { ok: t('Password changed.', 'Contraseña cambiada.') }
}

export async function deleteAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const { t } = await getT()
  // Vale la palabra de cualquiera de los dos idiomas: DELETE o BORRAR.
  if (!['borrar', 'delete'].includes(s(fd, 'confirm').toLowerCase())) return { error: t('Type DELETE to confirm.', 'Escribe BORRAR para confirmar.') }
  const { stripeSubscriptions } = repo.deleteUser(user.id)
  for (const sub of stripeSubscriptions) await billing.cancelImmediately(sub)
  await endSession()
  redirect('/?cuenta=borrada')
}
