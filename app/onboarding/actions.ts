'use server'

import { recordTrial, trialBlockReason } from '@/lib/abuse'
import { run } from '@/lib/db'
import { reportError } from '@/lib/monitor'
import { analyzeBrand, peekSite, suggestPrompts, type BrandProfile, type SuggestedPrompt } from '@/lib/ai'
import { emailVerifyUrl, isEmailVerified, requireUser, sendVerificationEmail } from '@/lib/auth'
import { emailReady } from '@/lib/email'
import { availablePlatformIds } from '@/lib/engines'
import { getT } from '@/lib/i18n'
import { canonicalCountry, countryFromDomain } from '@/lib/countries'
import { domainKey } from '@/lib/norm'
import * as repo from '@/lib/repo'
import { startRun } from '@/lib/tracking'
import type { Workspace } from '@/lib/types'

/**
 * El alta trabaja siempre sobre un borrador propio (sin terminar y del que se es
 * propietario), nunca sobre un espacio ya en marcha. El primero se crea aquí;
 * los siguientes nacen desde «Nuevo espacio» o «Nuevo cliente».
 */
async function draftWorkspace(): Promise<{ ws: Workspace; userId: number }> {
  const user = await requireUser()
  const spaces = repo.workspacesOf(user.id)
  let ws: Workspace | null = repo.onboardingDraftOf(user)
  if (!ws) {
    if (spaces.some((w) => w.onboarded)) throw new Error('No hay ningún espacio nuevo a medias: créalo desde el selector de espacios.')
    ws = repo.createWorkspace(user.id, 'My workspace')
  }
  return { ws, userId: user.id }
}

/** Nombre legible a partir del dominio: «mi-tienda.es» → «Mi Tienda». */
function nameFromDomain(domain: string): string {
  const label = domain.split('.')[0] ?? domain
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export async function analyzeAction(rawUrl: string): Promise<{ profile: BrandProfile; domain: string; warning?: string }> {
  const { ws } = await draftWorkspace()
  const { lang, t } = await getT()
  const site = await peekSite(rawUrl)
  const domain = site ? domainKey(site.url) : domainKey(rawUrl)
  const fallback: BrandProfile = {
    brandName: nameFromDomain(domain),
    description: site?.description ?? '',
    country: countryFromDomain(domain, site?.lang || lang),
    language: site?.lang || (lang === 'es' ? 'es' : 'en'),
    competitors: [],
  }
  repo.updateWorkspace(ws.id, { domain, brandName: fallback.brandName })
  if (!site) {
    return {
      profile: fallback,
      domain,
      warning: t("We couldn't open that website, so add your competitors by hand.", 'No hemos podido abrir esa web: añade tus competidores a mano.'),
    }
  }
  try {
    const profile = await analyzeBrand(site, '', lang)
    repo.updateWorkspace(ws.id, { brandName: profile.brandName })
    return { profile, domain }
  } catch (err) {
    console.error('[placton] analizar marca', err)
    reportError(err, 'onboarding: analizar la web')
    return {
      profile: { ...fallback, brandName: site.title.split(/[|·:–-]/)[0].trim() || fallback.brandName },
      domain,
      warning: t("We couldn't find competitors automatically. Add the ones you know.", 'No hemos podido encontrar competidores solos. Añade los que conozcas.'),
    }
  }
}

export async function suggestAction(input: {
  brandName: string
  description: string
  country: string
  language: string
  competitors: string[]
}): Promise<{ ok: true; prompts: SuggestedPrompt[] } | { ok: false; error: string }> {
  const { ws } = await draftWorkspace()
  const { lang, t } = await getT()
  try {
    const prompts = await suggestPrompts({ ...input, domain: ws.domain, existing: [] }, Math.max(15, repo.promptLimit(ws) + 5), lang)
    return { ok: true, prompts }
  } catch (err) {
    console.error('[placton] sugerir prompts', err)
    return { ok: false, error: t("We couldn't generate suggestions right now. Write your own prompts and let's continue.", 'No hemos podido generar sugerencias ahora mismo. Escribe tus propias preguntas y seguimos.') }
  }
}

export interface FinishPayload {
  brandName: string
  description: string
  country: string
  language: string
  competitors: { name: string; domain: string }[]
  prompts: { text: string; topic: string }[]
  leftovers: SuggestedPrompt[]
}

/** Enlace de confirmación en pantalla solo en local y sin correo configurado (para poder probarlo). */
function devVerifyLink(user: { id: number; email: string }): string | undefined {
  return !emailReady() && process.env.NODE_ENV !== 'production' ? (emailVerifyUrl(user) ?? undefined) : undefined
}

export type FinishResult =
  | { error: string }
  /** Falta confirmar el correo: no se ha guardado ni gastado nada. */
  | { verify: true; email: string; draftId: number; link?: string }
  | { ok: true; runId: number | null; trialUsed?: 'persona' | 'web' }

export async function finishAction(payload: FinishPayload): Promise<FinishResult> {
  const user = await requireUser()
  const { t } = await getT()
  // Otra pestaña ya terminó el alta (p. ej. la que abrió el enlace del correo): al panel.
  // Sin ninguna espera entre esta comprobación y lo que se guarda abajo, dos pestañas
  // a la vez no pueden lanzar dos mediciones.
  const draft = repo.onboardingDraftOf(user)
  if (!draft && repo.workspacesOf(user.id).some((w) => w.onboarded)) return { ok: true, runId: null }
  const { ws, userId } = draft ? { ws: draft as Workspace, userId: user.id } : await draftWorkspace()
  const brandName = payload.brandName.trim().slice(0, 80)
  if (!brandName) return { error: t('Your brand name is missing.', 'Falta el nombre de tu marca.') }
  const prompts = payload.prompts.filter((p) => p.text.trim())
  if (!prompts.length) return { error: t('Pick at least one prompt to track.', 'Elige al menos una pregunta que seguir.') }

  // Quien se registró con contraseña confirma su correo antes de la primera medición.
  // Se mira en la base (no en la sesión) y antes de guardar nada: el espacio sigue sin
  // terminar, así que tampoco entra en la medición semanal.
  const me = repo.userById(userId)
  if (me && !isEmailVerified(me)) return { verify: true, email: me.email, draftId: ws.id, link: devVerifyLink(me) }
  // Dos pestañas a la vez: si la otra acaba de terminarlo, no se repite nada.
  if (repo.workspaceById(ws.id)?.onboarded) return { ok: true, runId: null }

  repo.updateWorkspace(ws.id, {
    name: ws.name === 'Mi espacio' || ws.name === 'My workspace' ? brandName : ws.name,
    brandName,
    description: payload.description.trim().slice(0, 600),
    // Siempre un país de la lista: si no, las búsquedas saldrían desde otro país.
    country: canonicalCountry(payload.country) ?? countryFromDomain(ws.domain, payload.language),
    language: (payload.language || 'es').slice(0, 2),
    engines: availablePlatformIds(),
  })
  for (const c of payload.competitors.slice(0, 20)) repo.addCompetitor(ws.id, c.name, c.domain)
  const limit = repo.promptLimit(ws)
  for (const p of prompts.slice(0, limit)) repo.addPrompt(ws.id, p.text, p.topic || 'General', 'sugerido')
  repo.addSuggestions(ws.id, [...prompts.slice(limit), ...payload.leftovers].map((p) => ({ text: p.text, topic: p.topic || 'General', why: 'why' in p ? String(p.why) : '' })))
  repo.updateWorkspace(ws.id, { onboarded: true })
  // El panel abre justo este espacio (no otro anterior de la misma persona).
  repo.updateUser(userId, { currentWorkspaceId: ws.id })

  // Una sola prueba gratis por web: si otra cuenta ya la usó, este espacio
  // empieza sin prueba (el panel le pide elegir un plan) y no se gasta API.
  const fresh = repo.workspaceById(ws.id)!
  const blocked = fresh.plan === 'trial' && !fresh.billingOwnerId ? trialBlockReason(fresh) : null
  if (blocked) {
    repo.updateWorkspace(ws.id, { trialEndsAt: new Date().toISOString() })
    // Sin prueba no hay correos de «tu prueba termina» ni «ha terminado».
    run('UPDATE workspaces SET trialReminderAt = ?, trialEndedMailAt = ? WHERE id = ?', [new Date().toISOString(), new Date().toISOString(), ws.id])
    return { ok: true, runId: null, trialUsed: blocked }
  }
  if (fresh.plan === 'trial' && !fresh.billingOwnerId) recordTrial(fresh)

  const { runId } = startRun(ws.id, 'alta')
  return { ok: true, runId }
}

/* ───────────── Reenviar el correo de confirmación ───────────── */

const RESEND_GAP_MS = 60_000
/** El del registro y 5 reenvíos como mucho en 24 horas. */
const MAX_VERIFY_EMAILS = 6
const resendLock = new Map<number, number>()

export async function resendVerificationAction(): Promise<{ ok: true; verified?: boolean; link?: string; left: number } | { error: string; wait?: number; limit?: boolean }> {
  const user = await requireUser()
  const { lang, t } = await getT()
  const fresh = repo.userById(user.id) ?? user
  if (isEmailVerified(fresh)) return { ok: true, verified: true, left: 0 }
  // Uno por minuto: manda el último del registro de correos o, si aún se está enviando
  // (se apunta al terminar), el freno en memoria de esta misma pulsación.
  const now = Date.now()
  const stats = repo.verifyEmailStats(fresh.email)
  const last = Math.max(resendLock.get(user.id) ?? 0, stats.last ? Date.parse(stats.last) : 0)
  const wait = Math.ceil((last + RESEND_GAP_MS - now) / 1000)
  if (wait > 0) return { error: t(`Wait ${wait} seconds before asking again.`, `Espera ${wait} segundos antes de pedirlo otra vez.`), wait }
  if (stats.count >= MAX_VERIFY_EMAILS)
    return {
      error: t(
        'We have already sent it several times today. Check your spam folder or write to us.',
        'Ya te lo hemos enviado varias veces hoy. Mira en la carpeta de spam o escríbenos.',
      ),
      limit: true,
    }
  for (const [id, at] of resendLock) if (now - at > RESEND_GAP_MS) resendLock.delete(id)
  resendLock.set(user.id, now)
  const { sent } = await sendVerificationEmail(fresh, lang)
  return { ok: true, left: Math.max(0, MAX_VERIFY_EMAILS - stats.count - 1), link: sent ? undefined : devVerifyLink(fresh) }
}
