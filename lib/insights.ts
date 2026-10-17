import 'server-only'
import { addDays, all, nowIso, one, run, today } from './db'
import { platformById } from './engines'
import { trackedBrands } from './repo'
import { bi, type Bi } from './i18n-shared'
import type { Insight, Severity, Workspace } from './types'

// Ideas de la semana. Son reglas deterministas sobre los números: si una idea
// aparece es porque hay un dato concreto detrás, y ese dato se enseña.

const INFRA: Set<string> = new Set(['google.com', 'bing.com', 'openai.com', 'chatgpt.com', 'anthropic.com', 'claude.ai', 'perplexity.ai', 'x.ai', 'youtube.com'])

export function periodKey(day = today()): string {
  const d = new Date(`${day}T12:00:00Z`)
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${d.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}

interface Draft {
  kind: string
  severity: Severity
  title: Bi
  body: Bi
  action: Bi
  evidence: Bi
}

const pctEn = (n: number) => `${Math.round(n)}%`
const pctEs = (n: number) => `${Math.round(n)} %`
const many = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`

export function buildInsights(ws: Workspace): Draft[] {
  const to = today()
  const from = addDays(to, -6)
  const prevFrom = addDays(from, -7)
  const prevTo = addDays(from, -1)
  const brands = trackedBrands(ws)
  const own = brands[0]
  const out: Draft[] = []

  const searches = (a: string, b: string) =>
    one<{ n: number }>('SELECT COUNT(*) AS n FROM answers WHERE workspaceId = ? AND day BETWEEN ? AND ? AND error IS NULL AND empty = 0', [ws.id, a, b])?.n ?? 0
  const hits = (key: string, a: string, b: string) =>
    one<{ n: number }>('SELECT COUNT(DISTINCT answerId) AS n FROM mentions WHERE workspaceId = ? AND brandKey = ? AND day BETWEEN ? AND ?', [ws.id, key, a, b])?.n ?? 0

  const total = searches(from, to)
  if (total < 3) return out
  const ownHits = hits(own.key, from, to)
  const vis = (ownHits / total) * 100
  const prevTotal = searches(prevFrom, prevTo)
  const prevVis = prevTotal ? (hits(own.key, prevFrom, prevTo) / prevTotal) * 100 : null

  // 1. Invisibilidad.
  if (ownHits === 0) {
    out.push({
      kind: 'invisible',
      severity: 'critico',
      title: bi('AI platforms are not mentioning you yet', 'Las IA no te nombran todavía'),
      body: bi(
        `Across ${many(total, 'answer', 'answers')} this week you did not appear once. For people asking about what you sell, you are not part of the conversation yet.`,
        `En ${many(total, 'respuesta', 'respuestas')} de esta semana no has aparecido ni una vez. Para quien pregunta por lo que vendes, hoy no estás en la conversación.`,
      ),
      action: bi(
        'Start with the sources AI assistants read: complete listings in the directories and comparison sites of your industry, one page per service with verifiable facts (prices, timelines, area) and fresh reviews.',
        'Empieza por las fuentes que las IA sí leen: fichas completas en directorios y comparadores de tu sector, una página por cada servicio con datos verificables (precios, plazos, zona) y reseñas recientes.',
      ),
      evidence: bi(`0 of ${total} answers`, `0 de ${total} respuestas`),
    })
  } else if (vis >= 50) {
    out.push({
      kind: 'fuerte',
      severity: 'bien',
      title: bi('You appear in more than half of the answers', 'Apareces en más de la mitad de las respuestas'),
      body: bi(
        `Your visibility this week is ${pctEn(vis)}. That is a strong position: now it is about defending it and climbing the list.`,
        `Tu visibilidad esta semana es del ${pctEs(vis)}. Es una posición fuerte: ahora toca defenderla y mejorar el puesto.`,
      ),
      action: bi(
        'Open Mentions and look at the answers where a competitor is listed above you, then strengthen those pages.',
        'Revisa en Menciones las respuestas donde sales por detrás de un competidor y refuerza esas páginas.',
      ),
      evidence: bi(`${ownHits} of ${total} answers`, `${ownHits} de ${total} respuestas`),
    })
  }

  // 2. Cambio frente a la semana anterior.
  if (prevVis !== null && prevTotal >= 3) {
    const delta = vis - prevVis
    if (delta <= -10) {
      out.push({
        kind: 'caida',
        severity: 'aviso',
        title: bi(`Your visibility dropped ${Math.round(-delta)} points`, `Tu visibilidad ha bajado ${Math.round(-delta)} puntos`),
        body: bi(
          `You went from ${pctEn(prevVis)} to ${pctEn(vis)} in a week. A competitor may have published something new, or a source stopped citing you.`,
          `Has pasado del ${pctEs(prevVis)} al ${pctEs(vis)} en una semana. Puede ser un competidor que ha publicado algo nuevo o una fuente que ha dejado de citarte.`,
        ),
        action: bi(
          'Check in Sources which domains gained weight this week, and in Mentions who took your spot.',
          'Mira en Fuentes qué dominios han ganado peso esta semana y en Menciones quién ocupa tu sitio.',
        ),
        evidence: bi(`${pctEn(prevVis)} → ${pctEn(vis)}`, `${pctEs(prevVis)} → ${pctEs(vis)}`),
      })
    } else if (delta >= 10) {
      out.push({
        kind: 'subida',
        severity: 'bien',
        title: bi(`Your visibility rose ${Math.round(delta)} points`, `Tu visibilidad ha subido ${Math.round(delta)} puntos`),
        body: bi(`You went from ${pctEn(prevVis)} to ${pctEn(vis)}. Whatever you changed is working.`, `Has pasado del ${pctEs(prevVis)} al ${pctEs(vis)}. Lo que hayas cambiado está funcionando.`),
        action: bi(
          'Write down what you published or where you got listed, and repeat it for other topics.',
          'Apunta qué publicaste o en qué fuentes apareciste para repetirlo en otros temas.',
        ),
        evidence: bi(`${pctEn(prevVis)} → ${pctEn(vis)}`, `${pctEs(prevVis)} → ${pctEs(vis)}`),
      })
    }
  }

  // 3. Un competidor te saca ventaja.
  const rivals = brands
    .filter((b) => !b.own)
    .map((b) => ({ b, n: hits(b.key, from, to) }))
    .sort((a, b) => b.n - a.n)
  const leader = rivals[0]
  if (leader && leader.n > 0 && (leader.n / total) * 100 >= vis + 15) {
    const gap = all<{ text: string }>(
      `SELECT DISTINCT p.text FROM mentions m JOIN prompts p ON p.id = m.promptId
       WHERE m.workspaceId = ? AND m.brandKey = ? AND m.day BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM mentions o WHERE o.answerId = m.answerId AND o.brandKey = ?)
       LIMIT 3`,
      [ws.id, leader.b.key, from, to, own.key],
    )
    const lv = (leader.n / total) * 100
    out.push({
      kind: `rival-${leader.b.key}`,
      severity: 'aviso',
      title: bi(`${leader.b.name} appears far more often than you`, `${leader.b.name} aparece mucho más que tú`),
      body: bi(
        `${leader.b.name} shows up in ${pctEn(lv)} of the answers and you in ${pctEn(vis)}.${gap.length ? ` It is named and you are not in questions like "${gap[0].text}".` : ''}`,
        `${leader.b.name} sale en el ${pctEs(lv)} de las respuestas y tú en el ${pctEs(vis)}.${gap.length ? ` Le nombran y a ti no en preguntas como «${gap[0].text}».` : ''}`,
      ),
      action: bi(
        'Open those answers in Searches and look at the sources the AI cites when it talks about them: that is where you need to be.',
        'Abre esas respuestas en Búsquedas y mira qué fuentes cita la IA al hablar de él: ahí es donde tienes que estar.',
      ),
      evidence: bi(`${leader.n} vs ${ownHits} appearances`, `${leader.n} frente a ${ownHits} apariciones`),
    })
  }

  // 4. Te nombran pero no citan tu web.
  const ownCites = one<{ n: number }>('SELECT COUNT(*) AS n FROM citations WHERE workspaceId = ? AND brandKey = ? AND day BETWEEN ? AND ?', [ws.id, own.key, from, to])?.n ?? 0
  if (ownHits > 0 && ownCites === 0 && own.domain) {
    out.push({
      kind: 'sin-citas',
      severity: 'oportunidad',
      title: bi('You are mentioned, but your website is not the source', 'Te nombran, pero tu web no es la fuente'),
      body: bi(
        'You appear in the answers, but no platform links to your domain. They describe you from what others say: you do not control the message and you do not get the click.',
        'Apareces en las respuestas, pero ninguna plataforma enlaza a tu dominio. Hablan de ti a partir de lo que dicen otros: no controlas el mensaje ni te llevas el clic.',
      ),
      action: bi(
        'Publish on your own domain what they currently take from elsewhere: comparisons, pricing, FAQs with the answer in the first sentence, and structured data (Organization, Service, FAQPage).',
        'Publica en tu dominio lo que hoy sacan de fuera: comparativas, precios, preguntas frecuentes con la respuesta en la primera frase y datos estructurados (Organization, Service, FAQPage).',
      ),
      evidence: bi(`${ownHits} appearances, 0 citations to ${own.domain}`, `${ownHits} apariciones, 0 citas a ${own.domain}`),
    })
  }

  // 5. Fuentes donde están los demás y tú no.
  const rivalKeys = brands.filter((b) => !b.own).map((b) => b.key)
  if (rivalKeys.length) {
    const marks = rivalKeys.map(() => '?').join(',')
    const domains = all<{ domain: string; n: number }>(
      `SELECT c.domain, COUNT(DISTINCT c.answerId) AS n FROM citations c
       WHERE c.workspaceId = ? AND c.day BETWEEN ? AND ? AND c.brandKey IS NULL
         AND EXISTS (SELECT 1 FROM mentions m WHERE m.answerId = c.answerId AND m.brandKey IN (${marks}))
         AND NOT EXISTS (SELECT 1 FROM mentions m WHERE m.answerId = c.answerId AND m.brandKey = ?)
       GROUP BY c.domain ORDER BY n DESC LIMIT 6`,
      [ws.id, from, to, ...rivalKeys, own.key],
    ).filter((d) => !INFRA.has(d.domain))
    if (domains.length) {
      const list = domains.slice(0, 3).map((d) => d.domain).join(', ')
      const ev = domains.map((d) => `${d.domain} (${d.n})`).join(', ')
      out.push({
        kind: 'fuentes-rivales',
        severity: 'oportunidad',
        title: bi('Some sources recommend your competitors and not you', 'Hay fuentes que recomiendan a tu competencia y no a ti'),
        body: bi(
          `When AI names your competitors and not you, it mostly relies on ${list}.`,
          `Cuando la IA nombra a tus competidores y no a ti, se apoya sobre todo en ${list}.`,
        ),
        action: bi(
          'Get a presence on those pages: a directory listing, a mention in the comparison article or a review. It is the shortest path into those answers.',
          'Consigue presencia en esas páginas: ficha en el directorio, mención en el artículo comparativo o una reseña. Es el atajo más corto para entrar en esas respuestas.',
        ),
        evidence: bi(ev, ev),
      })
    }
  }

  // 6. Plataforma floja.
  const byEngine = all<{ engine: string; total: number; hits: number }>(
    `SELECT a.engine, COUNT(*) AS total,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM mentions m WHERE m.answerId = a.id AND m.brandKey = ?) THEN 1 ELSE 0 END) AS hits
     FROM answers a WHERE a.workspaceId = ? AND a.day BETWEEN ? AND ? AND a.error IS NULL AND a.empty = 0 GROUP BY a.engine`,
    [own.key, ws.id, from, to],
  ).filter((e) => e.total >= 3)
  if (byEngine.length >= 2 && ownHits > 0) {
    const sorted = byEngine.map((e) => ({ ...e, v: (e.hits / e.total) * 100 })).sort((a, b) => a.v - b.v)
    const worst = sorted[0]
    const best = sorted[sorted.length - 1]
    if (best.v - worst.v >= 25) {
      const w = platformById(worst.engine)?.name ?? worst.engine
      const b = platformById(best.engine)?.name ?? best.engine
      out.push({
        kind: `plataforma-${worst.engine}`,
        severity: 'aviso',
        title: bi(`${w} barely mentions you`, `${w} casi no te menciona`),
        body: bi(
          `On ${b} you appear in ${pctEn(best.v)} of the answers and on ${w} only in ${pctEn(worst.v)}. Each platform relies on different sources.`,
          `En ${b} apareces en el ${pctEs(best.v)} de las respuestas y en ${w} solo en el ${pctEs(worst.v)}. Cada plataforma tira de fuentes distintas.`,
        ),
        action: bi(`Filter Sources by ${w} to see which pages it uses and where you are missing.`, `Filtra Fuentes por ${w} para ver qué páginas usa y dónde te falta presencia.`),
        evidence: bi(`${w} ${pctEn(worst.v)} · ${b} ${pctEn(best.v)}`, `${w} ${pctEs(worst.v)} · ${b} ${pctEs(best.v)}`),
      })
    }
  }

  // 7. Tono negativo.
  const negative = one<{ n: number; quote: string }>(
    `SELECT COUNT(*) AS n, MAX(quote) AS quote FROM mentions WHERE workspaceId = ? AND brandKey = ? AND day BETWEEN ? AND ? AND sentiment = 'negativo'`,
    [ws.id, own.key, from, to],
  )
  if (negative && negative.n > 0) {
    out.push({
      kind: 'tono-negativo',
      severity: 'aviso',
      title: bi(
        negative.n === 1 ? '1 answer speaks badly of you' : `${negative.n} answers speak badly of you`,
        negative.n === 1 ? '1 respuesta habla mal de ti' : `${negative.n} respuestas hablan mal de ti`,
      ),
      body: bi(
        negative.quote ? `For example: "${negative.quote.slice(0, 180)}".` : 'Some mentions include an explicit complaint.',
        negative.quote ? `Por ejemplo: «${negative.quote.slice(0, 180)}».` : 'Hay menciones con una pega explícita.',
      ),
      action: bi(
        'Find where that opinion comes from (reviews, forums, articles) and answer it or correct the facts on your website with verifiable information.',
        'Localiza la fuente de esa opinión (reseñas, foros, artículos) y responde o corrige el dato en tu web con información verificable.',
      ),
      evidence: bi(`${negative.n} negative mentions`, `${negative.n} menciones negativas`),
    })
  }

  // 8. Posición mejorable.
  const rank = one<{ r: number | null }>(
    'SELECT AVG(rank) AS r FROM mentions WHERE workspaceId = ? AND brandKey = ? AND direct = 1 AND day BETWEEN ? AND ?',
    [ws.id, own.key, from, to],
  )?.r
  if (rank && rank > 3) {
    out.push({
      kind: 'posicion',
      severity: 'oportunidad',
      title: bi('You appear, but far from the top spots', 'Sales, pero lejos de los primeros puestos'),
      body: bi(
        `When you are named you sit at position ${rank.toFixed(1)} on average. The first brands on the list get almost all the attention.`,
        `Cuando te nombran, ocupas de media el puesto ${rank.toFixed(1).replace('.', ',')}. Las primeras marcas de la lista se llevan casi toda la atención.`,
      ),
      action: bi(
        'Make what sets you apart explicit on your website with concrete facts (years, clients, results) so the AI has reasons to list you earlier.',
        'Refuerza lo que te diferencia en tu web con datos concretos (años, clientes, resultados) para que la IA tenga motivos para ponerte antes.',
      ),
      evidence: bi(`Average position ${rank.toFixed(1)}`, `Posición media ${rank.toFixed(1).replace('.', ',')}`),
    })
  }

  // 9. Competidores que no sigues.
  const untracked = all<{ name: string; n: number }>(
    `SELECT MAX(name) AS name, COUNT(DISTINCT answerId) AS n FROM mentions WHERE workspaceId = ? AND kind = 'otro' AND day BETWEEN ? AND ?
     GROUP BY brandKey ORDER BY n DESC LIMIT 3`,
    [ws.id, from, to],
  ).filter((u) => u.n >= 2)
  if (untracked.length) {
    const names = untracked.map((u) => u.name).join(', ')
    const ev = untracked.map((u) => `${u.name} (${u.n})`).join(', ')
    out.push({
      kind: 'sin-seguir',
      severity: 'oportunidad',
      title: bi('AI keeps recommending brands you are not tracking', 'Hay marcas que la IA recomienda y no estás siguiendo'),
      body: bi(`${names} show up often in your answers.`, `${names} aparecen a menudo en tus búsquedas.`),
      action: bi('Add them in Competitors to compare yourself and see which sources support them.', 'Añádelas en Competidores para compararte con ellas y ver qué fuentes las sostienen.'),
      evidence: bi(ev, ev),
    })
  }

  return out
}

export function refreshInsights(ws: Workspace) {
  const key = periodKey()
  const drafts = buildInsights(ws)
  for (const d of drafts) {
    run(
      `INSERT INTO insights (workspaceId, periodKey, kind, severity, title, body, action, evidence, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (workspaceId, periodKey, kind) DO UPDATE SET
         severity = excluded.severity, body = excluded.body, action = excluded.action, evidence = excluded.evidence,
         readAt = CASE WHEN insights.title = excluded.title THEN insights.readAt ELSE NULL END,
         title = excluded.title`,
      [ws.id, key, d.kind, d.severity, JSON.stringify(d.title), JSON.stringify(d.body), JSON.stringify(d.action), JSON.stringify(d.evidence), nowIso()],
    )
  }
  // Las ideas de esta semana que ya no se cumplen se retiran.
  const kinds = drafts.map((d) => d.kind)
  const marks = kinds.map(() => '?').join(',')
  run(`DELETE FROM insights WHERE workspaceId = ? AND periodKey = ? ${kinds.length ? `AND kind NOT IN (${marks})` : ''}`, [ws.id, key, ...kinds])
}

const ORDER: Record<Severity, number> = { critico: 0, aviso: 1, oportunidad: 2, bien: 3 }

export function insightsOf(workspaceId: number): Insight[] {
  return all<Insight>('SELECT * FROM insights WHERE workspaceId = ? ORDER BY periodKey DESC, createdAt DESC LIMIT 60', [workspaceId]).sort(
    (a, b) => (a.periodKey === b.periodKey ? ORDER[a.severity] - ORDER[b.severity] : b.periodKey.localeCompare(a.periodKey)),
  )
}

export function unreadInsights(workspaceId: number): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM insights WHERE workspaceId = ? AND readAt IS NULL', [workspaceId])?.n ?? 0
}

export function markInsightsRead(workspaceId: number) {
  run('UPDATE insights SET readAt = ? WHERE workspaceId = ? AND readAt IS NULL', [nowIso(), workspaceId])
}
