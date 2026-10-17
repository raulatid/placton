import 'server-only'
import { addDays, all, jsonList, one, today } from './db'
import { brandKeys } from './norm'
import { trackedBrands } from './repo'
import type { Sentiment, TrackedBrand, Workspace } from './types'

// Toda la matemática del panel vive aquí.
//
// Una «búsqueda» es una respuesta válida de una plataforma a un prompt en un día.
// Visibilidad = % de búsquedas en las que la marca aparece (directa o indirecta).
// Las búsquedas donde no sales cuentan como 0: es la diferencia entre medir
// visibilidad y medir vanidad.

export type RangeId = 'hoy' | '7d' | '30d' | '90d'

export const RANGE_LABEL: Record<RangeId, { en: string; es: string }> = {
  hoy: { en: 'Latest day', es: 'Último día' },
  '7d': { en: '7 days', es: '7 días' },
  '30d': { en: '30 days', es: '30 días' },
  '90d': { en: '90 days', es: '90 días' },
}

export interface Range {
  id: RangeId
  from: string
  to: string
  prevFrom: string
  prevTo: string
}

export function parseRange(raw: string | undefined): RangeId {
  // 30 días por defecto: con la medición semanal, 7 días suele tener una sola pasada.
  return raw === 'hoy' || raw === '7d' || raw === '30d' || raw === '90d' ? raw : '30d'
}

export function resolveRange(workspaceId: number, id: RangeId): Range {
  if (id === 'hoy') {
    const last =
      one<{ day: string }>('SELECT MAX(day) AS day FROM answers WHERE workspaceId = ? AND error IS NULL', [workspaceId])?.day ?? today()
    const prev =
      one<{ day: string }>('SELECT MAX(day) AS day FROM answers WHERE workspaceId = ? AND error IS NULL AND day < ?', [workspaceId, last])?.day ??
      addDays(last, -1)
    return { id, from: last, to: last, prevFrom: prev, prevTo: prev }
  }
  const days = id === '7d' ? 7 : id === '30d' ? 30 : 90
  const to = today()
  const from = addDays(to, -(days - 1))
  return { id, from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) }
}

const SENTIMENT_SCORE: Record<Sentiment, number> = { positivo: 100, neutro: 50, negativo: 0 }

function valid(ws: number, from: string, to: string): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM answers WHERE workspaceId = ? AND day BETWEEN ? AND ? AND error IS NULL AND empty = 0', [ws, from, to])?.n ?? 0
}

export interface BrandStats {
  key: string
  name: string
  domain: string
  own: boolean
  competitorId: number | null
  /** 0-100 */
  visibility: number
  appearances: number
  direct: number
  indirect: number
  total: number
  /** Posición media cuando la nombran. null si nunca. */
  avgPosition: number | null
  /** 0-100; null si no hay menciones directas con tono. */
  sentiment: number | null
  citations: number
  byEngine: Record<string, number>
}

interface MentionAgg {
  brandKey: string
  answers: number
  direct: number
  indirect: number
  avgRank: number | null
  pos: number
  neu: number
  neg: number
}

function brandStatsFor(ws: Workspace, from: string, to: string): { searches: number; brands: BrandStats[] } {
  const searches = valid(ws.id, from, to)
  const brands = trackedBrands(ws)
  const aggs = new Map(
    all<MentionAgg>(
      `SELECT m.brandKey,
              COUNT(DISTINCT m.answerId) AS answers,
              COUNT(DISTINCT CASE WHEN m.direct = 1 THEN m.answerId END) AS direct,
              0 AS indirect,
              AVG(CASE WHEN m.direct = 1 THEN m.rank END) AS avgRank,
              SUM(CASE WHEN m.direct = 1 AND m.sentiment = 'positivo' THEN 1 ELSE 0 END) AS pos,
              SUM(CASE WHEN m.direct = 1 AND m.sentiment = 'neutro' THEN 1 ELSE 0 END) AS neu,
              SUM(CASE WHEN m.direct = 1 AND m.sentiment = 'negativo' THEN 1 ELSE 0 END) AS neg
       FROM mentions m JOIN answers a ON a.id = m.answerId
       WHERE m.workspaceId = ? AND m.day BETWEEN ? AND ? AND a.error IS NULL
       GROUP BY m.brandKey`,
      [ws.id, from, to],
    ).map((r) => [r.brandKey, r]),
  )
  const engines = all<{ brandKey: string; engine: string; n: number }>(
    `SELECT brandKey, engine, COUNT(DISTINCT answerId) AS n FROM mentions WHERE workspaceId = ? AND day BETWEEN ? AND ? GROUP BY brandKey, engine`,
    [ws.id, from, to],
  )
  const cites = new Map(
    all<{ brandKey: string; n: number }>(
      'SELECT brandKey, COUNT(*) AS n FROM citations WHERE workspaceId = ? AND day BETWEEN ? AND ? AND brandKey IS NOT NULL GROUP BY brandKey',
      [ws.id, from, to],
    ).map((r) => [r.brandKey, r.n]),
  )
  // Indirectas, como en Lima: respuestas que citan la web de la marca como
  // fuente, la nombren o no. Una respuesta puede contar como directa e indirecta.
  const indirect = new Map(
    all<{ brandKey: string; n: number }>(
      `SELECT brandKey, COUNT(DISTINCT answerId) AS n FROM (
         SELECT c.brandKey AS brandKey, c.answerId AS answerId FROM citations c JOIN answers a ON a.id = c.answerId
         WHERE c.workspaceId = ? AND c.day BETWEEN ? AND ? AND c.brandKey IS NOT NULL AND a.error IS NULL
         UNION
         SELECT m.brandKey, m.answerId FROM mentions m JOIN answers a ON a.id = m.answerId
         WHERE m.workspaceId = ? AND m.day BETWEEN ? AND ? AND m.direct = 0 AND a.error IS NULL
       ) GROUP BY brandKey`,
      [ws.id, from, to, ws.id, from, to],
    ).map((r) => [r.brandKey, r.n]),
  )

  const out = brands.map((b): BrandStats => {
    const a = aggs.get(b.key)
    const toned = (a?.pos ?? 0) + (a?.neu ?? 0) + (a?.neg ?? 0)
    const byEngine: Record<string, number> = {}
    for (const e of engines) if (e.brandKey === b.key) byEngine[e.engine] = e.n
    return {
      key: b.key,
      name: b.name,
      domain: b.domain,
      own: b.own,
      competitorId: b.competitorId,
      visibility: searches ? ((a?.answers ?? 0) / searches) * 100 : 0,
      appearances: a?.answers ?? 0,
      direct: a?.direct ?? 0,
      indirect: indirect.get(b.key) ?? 0,
      total: (a?.direct ?? 0) + (indirect.get(b.key) ?? 0),
      avgPosition: a?.avgRank ?? null,
      sentiment: toned ? ((a!.pos * 100 + a!.neu * 50) / toned) : null,
      citations: cites.get(b.key) ?? 0,
      byEngine,
    }
  })
  return { searches, brands: out }
}

export interface Overview {
  range: Range
  searches: number
  own: BrandStats
  prev: { searches: number; own: BrandStats }
  ranking: BrandStats[]
  hasData: boolean
}

export function overview(ws: Workspace, rangeId: RangeId): Overview {
  const range = resolveRange(ws.id, rangeId)
  const cur = brandStatsFor(ws, range.from, range.to)
  const prev = brandStatsFor(ws, range.prevFrom, range.prevTo)
  const own = cur.brands.find((b) => b.own)!
  const ranking = [...cur.brands].sort((a, b) => b.visibility - a.visibility || b.total - a.total || a.name.localeCompare(b.name))
  return {
    range,
    searches: cur.searches,
    own,
    prev: { searches: prev.searches, own: prev.brands.find((b) => b.own)! },
    ranking,
    hasData: cur.searches > 0,
  }
}

export function brandStats(ws: Workspace, rangeId: RangeId): { range: Range; searches: number; brands: BrandStats[] } {
  const range = resolveRange(ws.id, rangeId)
  const cur = brandStatsFor(ws, range.from, range.to)
  return { range, ...cur }
}

/** Visibilidad por día y marca, para la vista de evolución. */
/** Lunes de la semana de un día (YYYY-MM-DD). */
function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  return addDays(day, -dow)
}

/**
 * Evolución de la visibilidad por marca. En 7 días va por día; en 30 y 90, por
 * semanas (lunes), que es el ritmo de la medición y no deja huecos en la gráfica.
 */
export function timeline(ws: Workspace, rangeId: RangeId): { days: string[]; series: { key: string; name: string; own: boolean; values: (number | null)[] }[] } {
  const range = resolveRange(ws.id, rangeId === 'hoy' ? '7d' : rangeId)
  const weekly = rangeId === '30d' || rangeId === '90d'
  const bucket = (d: string) => (weekly ? weekStart(d) : d)
  const perBucket = new Map<string, number>()
  for (const r of all<{ day: string; n: number }>(
    'SELECT day, COUNT(*) AS n FROM answers WHERE workspaceId = ? AND day BETWEEN ? AND ? AND error IS NULL AND empty = 0 GROUP BY day',
    [ws.id, range.from, range.to],
  ))
    perBucket.set(bucket(r.day), (perBucket.get(bucket(r.day)) ?? 0) + r.n)
  const hits = new Map<string, number>()
  for (const h of all<{ day: string; brandKey: string; n: number }>(
    'SELECT day, brandKey, COUNT(DISTINCT answerId) AS n FROM mentions WHERE workspaceId = ? AND day BETWEEN ? AND ? GROUP BY day, brandKey',
    [ws.id, range.from, range.to],
  )) {
    const k = `${bucket(h.day)}|${h.brandKey}`
    hits.set(k, (hits.get(k) ?? 0) + h.n)
  }
  const days: string[] = []
  for (let d = weekly ? weekStart(range.from) : range.from; d <= range.to; d = addDays(d, weekly ? 7 : 1)) days.push(d)
  const series = trackedBrands(ws).map((b) => ({
    key: b.key,
    name: b.name,
    own: b.own,
    values: days.map((d) => {
      const total = perBucket.get(d)
      if (!total) return null
      return ((hits.get(`${d}|${b.key}`) ?? 0) / total) * 100
    }),
  }))
  return { days, series }
}

/* ───────────── Prompts ───────────── */

export interface PromptStats {
  promptId: number
  searches: number
  visibility: number
  avgPosition: number | null
  mentions: number
  lastDay: string | null
  byEngine: Record<string, { searches: number; hits: number }>
  topBrands: { key: string; name: string; own: boolean; n: number }[]
}

export function promptStats(ws: Workspace, rangeId: RangeId): Map<number, PromptStats> {
  const range = resolveRange(ws.id, rangeId)
  const ownKey = trackedBrands(ws)[0].key
  const base = all<{ promptId: number; engine: string; n: number; lastDay: string }>(
    `SELECT promptId, engine, COUNT(*) AS n, MAX(day) AS lastDay FROM answers
     WHERE workspaceId = ? AND day BETWEEN ? AND ? AND error IS NULL AND empty = 0 GROUP BY promptId, engine`,
    [ws.id, range.from, range.to],
  )
  const ownHits = all<{ promptId: number; engine: string; n: number; avgRank: number | null }>(
    `SELECT promptId, engine, COUNT(DISTINCT answerId) AS n, AVG(CASE WHEN direct = 1 THEN rank END) AS avgRank FROM mentions
     WHERE workspaceId = ? AND day BETWEEN ? AND ? AND brandKey = ? GROUP BY promptId, engine`,
    [ws.id, range.from, range.to, ownKey],
  )
  const brandsPer = all<{ promptId: number; brandKey: string; name: string; n: number }>(
    `SELECT promptId, brandKey, MAX(name) AS name, COUNT(*) AS n FROM mentions
     WHERE workspaceId = ? AND day BETWEEN ? AND ? GROUP BY promptId, brandKey ORDER BY n DESC`,
    [ws.id, range.from, range.to],
  )
  const out = new Map<number, PromptStats>()
  const get = (id: number) => {
    let s = out.get(id)
    if (!s) {
      s = { promptId: id, searches: 0, visibility: 0, avgPosition: null, mentions: 0, lastDay: null, byEngine: {}, topBrands: [] }
      out.set(id, s)
    }
    return s
  }
  for (const r of base) {
    const s = get(r.promptId)
    s.searches += r.n
    s.byEngine[r.engine] = { searches: r.n, hits: 0 }
    if (!s.lastDay || r.lastDay > s.lastDay) s.lastDay = r.lastDay
  }
  const rankAcc = new Map<number, { sum: number; n: number }>()
  for (const r of ownHits) {
    const s = get(r.promptId)
    s.mentions += r.n
    s.byEngine[r.engine] = { searches: s.byEngine[r.engine]?.searches ?? 0, hits: r.n }
    if (r.avgRank != null) {
      const acc = rankAcc.get(r.promptId) ?? { sum: 0, n: 0 }
      acc.sum += r.avgRank * r.n
      acc.n += r.n
      rankAcc.set(r.promptId, acc)
    }
  }
  for (const s of out.values()) {
    s.visibility = s.searches ? (s.mentions / s.searches) * 100 : 0
    const acc = rankAcc.get(s.promptId)
    s.avgPosition = acc?.n ? acc.sum / acc.n : null
  }
  for (const r of brandsPer) {
    const s = get(r.promptId)
    if (s.topBrands.length < 5) s.topBrands.push({ key: r.brandKey, name: r.name, own: r.brandKey === ownKey, n: r.n })
  }
  return out
}

/* ───────────── Respuestas (búsquedas) ───────────── */

export interface AnswerView {
  id: number
  promptId: number
  promptText: string
  engine: string
  model: string
  day: string
  text: string
  empty: boolean
  error: string | null
  searchQueries: string[]
  mentions: { brandKey: string; name: string; kind: string; direct: boolean; rank: number | null; sentiment: Sentiment; quote: string }[]
  citations: { url: string; domain: string; title: string; brandKey: string | null }[]
}

export function answersList(
  ws: Workspace,
  opts: { rangeId: RangeId; promptId?: number; engine?: string; brandKey?: string; limit?: number; offset?: number; includeErrors?: boolean },
): { total: number; items: AnswerView[] } {
  const range = resolveRange(ws.id, opts.rangeId)
  const where = ['a.workspaceId = ?', 'a.day BETWEEN ? AND ?']
  const params: (string | number)[] = [ws.id, range.from, range.to]
  if (!opts.includeErrors) where.push('a.error IS NULL')
  if (opts.promptId) {
    where.push('a.promptId = ?')
    params.push(opts.promptId)
  }
  if (opts.engine) {
    where.push('a.engine = ?')
    params.push(opts.engine)
  }
  if (opts.brandKey) {
    where.push('EXISTS (SELECT 1 FROM mentions m WHERE m.answerId = a.id AND m.brandKey = ?)')
    params.push(opts.brandKey)
  }
  const total = one<{ n: number }>(`SELECT COUNT(*) AS n FROM answers a WHERE ${where.join(' AND ')}`, params)?.n ?? 0
  const rows = all<{
    id: number
    promptId: number
    promptText: string
    engine: string
    model: string
    day: string
    text: string
    empty: number
    error: string | null
    searchQueries: string
  }>(
    `SELECT a.id, a.promptId, p.text AS promptText, a.engine, a.model, a.day, a.text, a.empty, a.error, a.searchQueries
     FROM answers a JOIN prompts p ON p.id = a.promptId
     WHERE ${where.join(' AND ')} ORDER BY a.day DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, opts.limit ?? 30, opts.offset ?? 0],
  )
  return { total, items: hydrateAnswers(rows) }
}

export function answerById(ws: Workspace, id: number): AnswerView | null {
  const rows = all<{
    id: number
    promptId: number
    promptText: string
    engine: string
    model: string
    day: string
    text: string
    empty: number
    error: string | null
    searchQueries: string
  }>(
    `SELECT a.id, a.promptId, p.text AS promptText, a.engine, a.model, a.day, a.text, a.empty, a.error, a.searchQueries
     FROM answers a JOIN prompts p ON p.id = a.promptId WHERE a.id = ? AND a.workspaceId = ?`,
    [id, ws.id],
  )
  return hydrateAnswers(rows)[0] ?? null
}

function hydrateAnswers(
  rows: { id: number; promptId: number; promptText: string; engine: string; model: string; day: string; text: string; empty: number; error: string | null; searchQueries: string }[],
): AnswerView[] {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const marks = ids.map(() => '?').join(',')
  const mentions = all<{ answerId: number; brandKey: string; name: string; kind: string; direct: number; rank: number | null; sentiment: Sentiment; quote: string }>(
    `SELECT answerId, brandKey, name, kind, direct, rank, sentiment, quote FROM mentions WHERE answerId IN (${marks}) ORDER BY direct DESC, rank ASC`,
    ids,
  )
  const cites = all<{ answerId: number; url: string; domain: string; title: string; brandKey: string | null }>(
    `SELECT answerId, url, domain, title, brandKey FROM citations WHERE answerId IN (${marks}) ORDER BY id ASC`,
    ids,
  )
  return rows.map((r) => ({
    id: r.id,
    promptId: r.promptId,
    promptText: r.promptText,
    engine: r.engine,
    model: r.model,
    day: r.day,
    text: r.text,
    empty: Boolean(r.empty),
    error: r.error,
    searchQueries: jsonList(r.searchQueries),
    mentions: mentions
      .filter((m) => m.answerId === r.id)
      .map((m) => ({ brandKey: m.brandKey, name: m.name, kind: m.kind, direct: Boolean(m.direct), rank: m.rank, sentiment: m.sentiment, quote: m.quote })),
    citations: cites.filter((c) => c.answerId === r.id).map((c) => ({ url: c.url, domain: c.domain, title: c.title, brandKey: c.brandKey })),
  }))
}

/* ───────────── Fuentes citadas ───────────── */

export interface SourceDomain {
  domain: string
  count: number
  answers: number
  brandKey: string | null
  engines: Record<string, number>
  urls: { url: string; title: string; count: number }[]
}

export function sources(ws: Workspace, rangeId: RangeId, brandKey?: string): { range: Range; domains: SourceDomain[]; totalCitations: number } {
  const range = resolveRange(ws.id, rangeId)
  const filter = brandKey ? 'AND brandKey = ?' : ''
  const params: (string | number)[] = brandKey ? [ws.id, range.from, range.to, brandKey] : [ws.id, range.from, range.to]
  const rows = all<{ domain: string; url: string; title: string; engine: string; answerId: number; brandKey: string | null }>(
    `SELECT domain, url, title, engine, answerId, brandKey FROM citations WHERE workspaceId = ? AND day BETWEEN ? AND ? ${filter}`,
    params,
  )
  const map = new Map<string, SourceDomain & { answerSet: Set<number>; urlMap: Map<string, { url: string; title: string; count: number }> }>()
  for (const r of rows) {
    let d = map.get(r.domain)
    if (!d) {
      d = { domain: r.domain, count: 0, answers: 0, brandKey: r.brandKey, engines: {}, urls: [], answerSet: new Set(), urlMap: new Map() }
      map.set(r.domain, d)
    }
    d.count++
    d.answerSet.add(r.answerId)
    d.engines[r.engine] = (d.engines[r.engine] ?? 0) + 1
    const u = d.urlMap.get(r.url) ?? { url: r.url, title: r.title, count: 0 }
    u.count++
    if (!u.title && r.title) u.title = r.title
    d.urlMap.set(r.url, u)
  }
  const domains = [...map.values()]
    .map(({ answerSet, urlMap, ...d }) => ({
      ...d,
      answers: answerSet.size,
      urls: [...urlMap.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    }))
    .sort((a, b) => b.count - a.count)
  return { range, domains, totalCitations: rows.length }
}

/* ───────────── Marcas que la IA nombra y no sigues ───────────── */

export function untrackedBrands(ws: Workspace, rangeId: RangeId, limit = 8): { key: string; name: string; n: number; avgRank: number | null }[] {
  const range = resolveRange(ws.id, rangeId)
  // Las menciones guardan el tipo del momento en que se midieron: una marca que
  // luego pasaste a seguir no debe volver a salir como sugerida.
  const tracked = new Set(trackedBrands(ws).flatMap((b) => [b.key, ...brandKeys(b.name, b.domain, b.aliases)]))
  return all<{ key: string; name: string; n: number; avgRank: number | null }>(
    `SELECT brandKey AS key, MAX(name) AS name, COUNT(DISTINCT answerId) AS n, AVG(rank) AS avgRank FROM mentions
     WHERE workspaceId = ? AND day BETWEEN ? AND ? AND kind = 'otro' GROUP BY brandKey ORDER BY n DESC, avgRank ASC LIMIT ?`,
    [ws.id, range.from, range.to, limit + tracked.size],
  )
    .filter((r) => !tracked.has(r.key))
    .slice(0, limit)
}

export function brandByKey(ws: Workspace, brandKey: string): TrackedBrand | null {
  return trackedBrands(ws).find((b) => b.key === brandKey) ?? null
}

/** Coste de API de un espacio en un intervalo (para /admin). */
export function apiCost(workspaceId: number | null, from: string, to: string): number {
  const where = workspaceId ? 'workspaceId = ? AND' : ''
  const params = workspaceId ? [workspaceId, from, to] : [from, to]
  return one<{ c: number }>(`SELECT COALESCE(SUM(costUsd), 0) AS c FROM answers WHERE ${where} day BETWEEN ? AND ?`, params)?.c ?? 0
}
