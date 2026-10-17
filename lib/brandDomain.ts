import 'server-only'
import { lookup } from 'node:dns/promises'
import { all, nowIso, one, run } from './db'
import { responses } from './engines/openai'
import { cleanDomain } from './logo'
import { key } from './norm'
import * as repo from './repo'

// Web de un competidor que se añade solo con el nombre (p. ej. desde «Marcas que
// la IA nombra y no sigues»): sin dominio no hay logo ni menciones indirectas.
// 1) Las fuentes que ya citaron las IA en este espacio (gratis e inmediato).
// 2) Si no, una búsqueda corta con IA (~0,01 $) y se comprueba que el dominio existe.

const compact = (s: string) => key(s).replace(/\s+/g, '')

function fromCitations(workspaceId: number, name: string): string | null {
  const target = compact(name)
  if (target.length < 3) return null
  const domains = all<{ domain: string }>('SELECT DISTINCT domain FROM citations WHERE workspaceId = ?', [workspaceId]).map((r) => r.domain)
  const label = (d: string) => compact(d.split('.')[0] ?? '')
  // Solo coincidencia exacta del nombre: «apple» no debe quedarse con applebees.com.
  return domains.find((d) => label(d) === target) ?? null
}

async function exists(domain: string): Promise<boolean> {
  try {
    return (await lookup(domain, { all: true })).length > 0
  } catch {
    return false
  }
}

/** Dominio encontrado, null si la IA no lo sabe, o undefined si la consulta falló (entonces no se guarda). */
async function fromAI(name: string, context: string, country: string): Promise<string | null | undefined> {
  try {
    const res = await responses({
      model: process.env.PLACTON_FAST_MODEL || 'gpt-5.6-luna',
      instructions: 'Find the official website of the company. Answer only with its domain (e.g. example.com), or an empty string if you are not sure.',
      input: `Company: ${name}\nContext: ${context}\nCountry: ${country}`,
      webSearch: true,
      effort: 'low',
      schema: { name: 'company_domain', schema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'], additionalProperties: false } },
      signal: AbortSignal.timeout(20_000),
    })
    const domain = cleanDomain(JSON.parse(res.text || '{}').domain)
    return domain && (await exists(domain)) ? domain : null
  } catch {
    return undefined
  }
}

/* ───── Caché por nombre y país: cada marca se busca una sola vez ───── */

function cached(name: string, country: string): string | null | undefined {
  const r = one<{ domain: string; checkedAt: string }>('SELECT domain, checkedAt FROM brand_domains WHERE nameKey = ? AND country = ?', [compact(name), country])
  if (!r) return undefined
  // Un «no tiene web» se vuelve a mirar pasados 60 días.
  if (!r.domain && Date.now() - new Date(r.checkedAt).getTime() > 60 * 86_400_000) return undefined
  return r.domain || null
}

function remember(name: string, country: string, domain: string | null) {
  run('INSERT OR REPLACE INTO brand_domains (nameKey, country, domain, checkedAt) VALUES (?, ?, ?, ?)', [compact(name), country, domain ?? '', nowIso()])
}

const queue: { name: string; country: string; context: string }[] = []
let working = false

async function drain() {
  if (working) return
  working = true
  try {
    while (queue.length) {
      const job = queue.shift()!
      if (cached(job.name, job.country) !== undefined) continue
      const found = await fromAI(job.name, job.context, job.country)
      if (found !== undefined) remember(job.name, job.country, found)
    }
  } finally {
    working = false
  }
}

/**
 * Web de una marca sugerida (nombrada por las IA, sin dominio) para enseñar su
 * logo. Al momento si ya se conoce o sale en las fuentes citadas; si no, se busca
 * en segundo plano y aparecerá en la siguiente carga.
 */
export function suggestedDomain(ws: { id: number; brandName: string; domain: string; description: string; country: string }, name: string): string | null {
  const hit = cached(name, ws.country)
  if (hit !== undefined) return hit
  const fromCites = fromCitations(ws.id, name)
  if (fromCites) {
    remember(name, ws.country, fromCites)
    return fromCites
  }
  if (queue.length < 40 && !queue.some((q) => compact(q.name) === compact(name) && q.country === ws.country)) {
    queue.push({ name, country: ws.country, context: `competitor of ${ws.brandName} (${ws.domain}). ${ws.description}`.slice(0, 400) })
    void drain()
  }
  return null
}

/** Busca y guarda la web de un competidor sin dominio. Devuelve el dominio o null. */
export async function resolveCompetitorDomain(workspaceId: number, competitorId: number): Promise<string | null> {
  const c = one<{ id: number; name: string; domain: string }>('SELECT id, name, domain FROM competitors WHERE id = ? AND workspaceId = ?', [competitorId, workspaceId])
  if (!c || c.domain) return c?.domain || null
  run('UPDATE competitors SET domainCheckedAt = ? WHERE id = ?', [nowIso(), c.id])
  const ws = repo.workspaceById(workspaceId)
  const country = ws?.country ?? ''
  let domain = cached(c.name, country) ?? fromCitations(workspaceId, c.name)
  if (!domain && cached(c.name, country) === undefined) {
    const found = await fromAI(c.name, ws ? `competitor of ${ws.brandName} (${ws.domain}). ${ws.description}`.slice(0, 400) : '', country)
    if (found === undefined) {
      // Falló la consulta (no es que no tenga web): se reintentará en otra pasada.
      run('UPDATE competitors SET domainCheckedAt = NULL WHERE id = ?', [c.id])
      return null
    }
    domain = found
    remember(c.name, country, domain)
  }
  if (domain) run('UPDATE competitors SET domain = ? WHERE id = ?', [domain, c.id])
  return domain
}

/** Completa, poco a poco, los competidores que aún no tienen web (programador horario). */
export async function fillMissingDomains(limit = 10) {
  const rows = all<{ id: number; workspaceId: number }>("SELECT id, workspaceId FROM competitors WHERE domain = '' AND domainCheckedAt IS NULL LIMIT ?", [limit])
  for (const r of rows) await resolveCompetitorDomain(r.workspaceId, r.id)
}
