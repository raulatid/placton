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
  return domains.find((d) => label(d) === target) ?? domains.find((d) => target.length >= 5 && label(d).startsWith(target)) ?? null
}

async function exists(domain: string): Promise<boolean> {
  try {
    return (await lookup(domain, { all: true })).length > 0
  } catch {
    return false
  }
}

async function fromAI(name: string, context: string, country: string): Promise<string | null> {
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
    return null
  }
}

/** Busca y guarda la web de un competidor sin dominio. Devuelve el dominio o null. */
export async function resolveCompetitorDomain(workspaceId: number, competitorId: number): Promise<string | null> {
  const c = one<{ id: number; name: string; domain: string }>('SELECT id, name, domain FROM competitors WHERE id = ? AND workspaceId = ?', [competitorId, workspaceId])
  if (!c || c.domain) return c?.domain || null
  run('UPDATE competitors SET domainCheckedAt = ? WHERE id = ?', [nowIso(), c.id])
  let domain = fromCitations(workspaceId, c.name)
  if (!domain) {
    const ws = repo.workspaceById(workspaceId)
    domain = await fromAI(c.name, ws ? `competitor of ${ws.brandName} (${ws.domain}). ${ws.description}`.slice(0, 400) : '', ws?.country ?? '')
  }
  if (domain) run('UPDATE competitors SET domain = ? WHERE id = ?', [domain, c.id])
  return domain
}

/** Completa, poco a poco, los competidores que aún no tienen web (programador horario). */
export async function fillMissingDomains(limit = 10) {
  const rows = all<{ id: number; workspaceId: number }>("SELECT id, workspaceId FROM competitors WHERE domain = '' AND domainCheckedAt IS NULL LIMIT ?", [limit])
  for (const r of rows) await resolveCompetitorDomain(r.workspaceId, r.id)
}
