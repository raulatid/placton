'use server'

import { trialAlreadyUsed } from '@/lib/abuse'
import { reportError } from '@/lib/monitor'
import { analyzeBrand, peekSite, suggestPrompts, type BrandProfile, type SuggestedPrompt } from '@/lib/ai'
import { requireUser } from '@/lib/auth'
import { availablePlatformIds } from '@/lib/engines'
import { getT } from '@/lib/i18n'
import { domainKey } from '@/lib/norm'
import * as repo from '@/lib/repo'
import { startRun } from '@/lib/tracking'
import type { Workspace } from '@/lib/types'

async function draftWorkspace(): Promise<{ ws: Workspace; userId: number }> {
  const user = await requireUser()
  let ws = user.currentWorkspaceId ? repo.workspaceById(user.currentWorkspaceId) : null
  if (ws && !repo.roleIn(ws.id, user.id)) ws = null
  if (!ws) {
    // Si ya pertenece a algún espacio terminado y crea otro, empieza uno nuevo.
    const pending = repo.workspacesOf(user.id).find((w) => !w.onboarded && w.role === 'owner')
    ws = pending ?? repo.createWorkspace(user.id, 'My workspace')
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
    country: 'España',
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

export async function finishAction(payload: FinishPayload): Promise<{ error: string } | { ok: true; runId: number | null }> {
  const { ws, userId } = await draftWorkspace()
  const { t } = await getT()
  const brandName = payload.brandName.trim().slice(0, 80)
  if (!brandName) return { error: t('Your brand name is missing.', 'Falta el nombre de tu marca.') }
  const prompts = payload.prompts.filter((p) => p.text.trim())
  if (!prompts.length) return { error: t('Pick at least one prompt to track.', 'Elige al menos una pregunta que seguir.') }

  repo.updateWorkspace(ws.id, {
    name: ws.name === 'Mi espacio' || ws.name === 'My workspace' ? brandName : ws.name,
    brandName,
    description: payload.description.trim().slice(0, 600),
    country: payload.country || 'España',
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
  if (fresh.plan === 'trial' && !fresh.billingOwnerId && trialAlreadyUsed(fresh)) {
    repo.updateWorkspace(ws.id, { trialEndsAt: new Date().toISOString() })
    return { ok: true, runId: null }
  }

  const { runId } = startRun(ws.id, 'alta')
  return { ok: true, runId }
}
