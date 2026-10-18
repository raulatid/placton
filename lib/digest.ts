import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { addDays, all, one, run, today } from './db'
import { appUrl, emailReady, sendEmail, type EmailBlock, type EmailInput, type EmailTone } from './email'
import { platformById } from './engines'
import { pick, type Lang } from './i18n-shared'
import { periodKey } from './insights'
import { windowStats } from './metrics'
import { reportError } from './monitor'
import * as repo from './repo'
import type { DigestMode, Insight, Role, Severity, Workspace } from './types'

// Resumen semanal y alertas por correo, una vez por medición semanal terminada.
//
// La medición deja apuntado su día en workspaces.lastTrackedDay al acabar bien
// (la del alta y la semanal; «Medir ahora» no lo toca). La tarea de cada hora
// busca los espacios cuyo lastTrackedDay aún no tiene resumen (digestSentFor) y
// lo envía. Se ancla en el día y no en la medición (runId) porque una medición
// cortada por un reinicio se reanuda con otro runId: así sale un solo correo.
//
// Las cifras son las del panel (windowStats) en las mismas semanas que las ideas:
// del día de la medición hacia atrás 7 días, frente a los 7 anteriores.

const KIND = 'semanal' as const
const MIN_ANSWERS = 3
/** Un resumen de una medición de hace más días ya no se manda (p. ej. tras una caída). */
const MAX_AGE_DAYS = 3
/** Horario de envío en Madrid: de 8:00 a 20:59. */
const FIRST_HOUR = 8
const LAST_HOUR = 20
/** Resend admite 2 envíos por segundo. */
const GAP_MS = 600
const DROP_POINTS = 10
const OVERTAKE_POINTS = 5
const OVERTAKE_MIN_HITS = 2
const QUOTE_MAX = 180
/** Ideas que ya salen como alerta: no se repiten como «idea de la semana». */
const ALERT_INSIGHTS = /^(caida|rival-.+|tono-negativo)$/
const SEVERITY_ORDER: Record<Severity, number> = { critico: 0, aviso: 1, oportunidad: 2, bien: 3 }
const ENGINE_ORDER = ['chatgpt', 'claude', 'google', 'perplexity', 'grok']

/* ───────────── Destinatarios ───────────── */

export interface Recipient {
  userId: number
  email: string
  firstName: string
  lastName: string
  role: Role
}

/** Sin elección propia, lo recibe quien administra el espacio y los miembros no. */
export function digestByDefault(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

/** Quién recibe el resumen del espacio según su rol y lo que haya elegido cada uno. */
export function recipients(workspaceId: number): Recipient[] {
  const prefs = new Map(
    all<{ userId: number; enabled: number }>('SELECT userId, enabled FROM email_prefs WHERE workspaceId = ? AND kind = ?', [workspaceId, KIND]).map((r) => [
      r.userId,
      Boolean(r.enabled),
    ]),
  )
  const seen = new Set<string>()
  return repo.membersOf(workspaceId).filter((m) => {
    const email = m.email.trim().toLowerCase()
    if (!(prefs.get(m.userId) ?? digestByDefault(m.role)) || !email || seen.has(email)) return false
    seen.add(email)
    return true
  })
}

/* ───────────── Enlace de baja (sin sesión) ───────────── */

function emailSecret(): string {
  return process.env.PLACTON_EMAIL_SECRET || process.env.CRON_SECRET || ''
}

function sign(secret: string, userId: number, workspaceId: number): string {
  return createHmac('sha256', secret).update(`${KIND}:${userId}:${workspaceId}`).digest('base64url').slice(0, 16)
}

/** Token firmado de la baja de una persona en un espacio; null sin clave configurada. */
export function digestOffToken(userId: number, workspaceId: number): string | null {
  const secret = emailSecret()
  if (!secret) return null
  return `${userId.toString(36)}.${workspaceId.toString(36)}.${sign(secret, userId, workspaceId)}`
}

export function digestOffUrl(userId: number, workspaceId: number): string | null {
  const token = digestOffToken(userId, workspaceId)
  return token ? `${appUrl()}/api/email-off/${token}` : null
}

/** Comprueba la firma del enlace de baja. */
export function readDigestOffToken(token: string): { userId: number; workspaceId: number } | null {
  const secret = emailSecret()
  const m = /^([0-9a-z]{1,10})\.([0-9a-z]{1,10})\.([\w-]{16})$/.exec(token)
  if (!secret || !m) return null
  const userId = parseInt(m[1], 36)
  const workspaceId = parseInt(m[2], 36)
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(workspaceId) || userId <= 0 || workspaceId <= 0) return null
  const expected = Buffer.from(sign(secret, userId, workspaceId))
  const got = Buffer.from(m[3])
  return expected.length === got.length && timingSafeEqual(expected, got) ? { userId, workspaceId } : null
}

/** Baja de una persona en un espacio: los demás lo siguen recibiendo. */
export function turnOffDigest(userId: number, workspaceId: number) {
  repo.setEmailPref(userId, workspaceId, KIND, false)
}

export function digestOn(userId: number, workspaceId: number, role: Role): boolean {
  return repo.emailPref(userId, workspaceId, KIND) ?? digestByDefault(role)
}

/* ───────────── Datos de la semana ───────────── */

export interface DigestData {
  ws: Workspace
  lang: Lang
  brand: string
  from: string
  to: string
  searches: number
  prevSearches: number
  /** La semana anterior tiene datos suficientes para comparar. */
  hasPrev: boolean
  vis: number
  prevVis: number
  position: number | null
  prevPosition: number | null
  engines: string[]
  /** Los 3 competidores con más visibilidad esta semana. */
  rivals: { name: string; vis: number; prevVis: number; ahead: boolean }[]
  /** Respuestas que citan la web propia (null si el espacio no tiene web). */
  ownCited: { now: number; prev: number } | null
  negatives: { now: number; prev: number; example: { quote: string; engine: string; prompt: string } | null }
  drop: { points: number } | null
  overtaken: { name: string; vis: number; prevVis: number; ownPrevVis: number; others: number } | null
  /** Menciones negativas en preguntas y plataformas que la semana anterior no tenían ninguna. */
  freshNegative: { answers: number; quote: string; engine: string; prompt: string } | null
  idea: { title: string; action: string; evidence: string; severity: Severity } | null
}

const engineName = (id: string) => platformById(id)?.name ?? id

/** Solo lee datos: no envía nada (sirve para el envío y para la vista previa). */
export function digestData(ws: Workspace, end: string): DigestData {
  const lang: Lang = ws.language === 'es' ? 'es' : 'en'
  const from = addDays(end, -6)
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(from, -7)
  const cur = windowStats(ws, from, end)
  const prev = windowStats(ws, prevFrom, prevTo)
  const own = cur.brands.find((b) => b.own)!
  const prevOwn = prev.brands.find((b) => b.own)!
  const hasPrev = prev.searches >= MIN_ANSWERS && cur.searches >= MIN_ANSWERS
  const prevOf = new Map(prev.brands.map((b) => [b.key, b]))

  const rivals = cur.brands
    .filter((b) => !b.own)
    .sort((a, b) => b.visibility - a.visibility || b.appearances - a.appearances || a.name.localeCompare(b.name))
  const overtakers = hasPrev
    ? rivals.filter((b) => {
        const p = prevOf.get(b.key)
        return p && p.visibility <= prevOwn.visibility && b.visibility >= own.visibility + OVERTAKE_POINTS && b.appearances >= OVERTAKE_MIN_HITS
      })
    : []

  const cited = (a: string, b: string) =>
    one<{ n: number }>(
      'SELECT COUNT(DISTINCT c.answerId) AS n FROM citations c JOIN answers a ON a.id = c.answerId WHERE c.workspaceId = ? AND c.brandKey = ? AND c.day BETWEEN ? AND ? AND a.error IS NULL',
      [ws.id, own.key, a, b],
    )?.n ?? 0
  const negativeCount = (a: string, b: string) =>
    one<{ n: number }>("SELECT COUNT(*) AS n FROM mentions WHERE workspaceId = ? AND brandKey = ? AND day BETWEEN ? AND ? AND sentiment = 'negativo'", [ws.id, own.key, a, b])?.n ?? 0
  const negativeRows = (fresh: boolean) =>
    all<{ answerId: number; quote: string; engine: string; prompt: string }>(
      `SELECT m.answerId, m.quote, m.engine, p.text AS prompt FROM mentions m JOIN prompts p ON p.id = m.promptId
       WHERE m.workspaceId = ? AND m.brandKey = ? AND m.sentiment = 'negativo' AND m.day BETWEEN ? AND ?
       ${
         fresh
           ? `AND NOT EXISTS (SELECT 1 FROM mentions o WHERE o.workspaceId = m.workspaceId AND o.brandKey = m.brandKey AND o.sentiment = 'negativo'
                AND o.promptId = m.promptId AND o.engine = m.engine AND o.day BETWEEN ? AND ?)
              AND EXISTS (SELECT 1 FROM answers pa WHERE pa.workspaceId = m.workspaceId AND pa.promptId = m.promptId AND pa.engine = m.engine
                AND pa.day BETWEEN ? AND ? AND pa.error IS NULL AND pa.empty = 0)`
           : ''
       }
       ORDER BY (m.quote <> '') DESC, m.day DESC, m.id DESC`,
      // Crítica «nueva» solo si esa pregunta y plataforma tuvieron respuesta la semana anterior
      // (sin respuesta tampoco hay crítica: un prompt o plataforma recién añadidos no cuentan).
      fresh ? [ws.id, own.key, from, end, prevFrom, prevTo, prevFrom, prevTo] : [ws.id, own.key, from, end],
    )
  const negatives = negativeRows(false)
  const fresh = hasPrev ? negativeRows(true) : []

  const engines = all<{ engine: string }>('SELECT DISTINCT engine FROM answers WHERE workspaceId = ? AND day BETWEEN ? AND ? AND error IS NULL AND empty = 0', [ws.id, from, end])
    .map((r) => r.engine)
    .sort((a, b) => (ENGINE_ORDER.indexOf(a) + 1 || 99) - (ENGINE_ORDER.indexOf(b) + 1 || 99))
    .map(engineName)

  // La idea más importante de la semana: refreshInsights usa la fecha del día en
  // que acaba la medición, que puede ser el siguiente si cruza la medianoche.
  const keys = [periodKey(end), periodKey(addDays(end, 1))]
  const ideaRow = all<Insight>('SELECT * FROM insights WHERE workspaceId = ? AND periodKey IN (?, ?)', [ws.id, ...keys])
    .filter((i) => !ALERT_INSIGHTS.test(i.kind))
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey) || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]

  const top = overtakers[0]
  return {
    ws,
    lang,
    brand: ws.brandName || ws.name,
    from,
    to: end,
    searches: cur.searches,
    prevSearches: prev.searches,
    hasPrev,
    vis: own.visibility,
    prevVis: prevOwn.visibility,
    position: own.avgPosition,
    prevPosition: prevOwn.avgPosition,
    engines,
    // «Por delante» con las cifras que se ven (redondeadas): con 47 % y 47 % no lo está.
    rivals: rivals
      .slice(0, 3)
      .map((b) => ({ name: b.name, vis: b.visibility, prevVis: prevOf.get(b.key)?.visibility ?? 0, ahead: Math.round(b.visibility) > Math.round(own.visibility) })),
    ownCited: ws.domain ? { now: cited(from, end), prev: cited(prevFrom, prevTo) } : null,
    negatives: {
      now: negativeCount(from, end),
      prev: negativeCount(prevFrom, prevTo),
      example: negatives[0] ? { quote: negatives[0].quote, engine: engineName(negatives[0].engine), prompt: negatives[0].prompt } : null,
    },
    drop: hasPrev && own.visibility - prevOwn.visibility <= -DROP_POINTS ? { points: Math.round(prevOwn.visibility - own.visibility) } : null,
    overtaken: top
      ? { name: top.name, vis: top.visibility, prevVis: prevOf.get(top.key)?.visibility ?? 0, ownPrevVis: prevOwn.visibility, others: overtakers.length - 1 }
      : null,
    freshNegative: fresh.length
      ? { answers: new Set(fresh.map((f) => f.answerId)).size, quote: fresh[0].quote, engine: engineName(fresh[0].engine), prompt: fresh[0].prompt }
      : null,
    idea: ideaRow
      ? { title: pick(ideaRow.title, lang), action: pick(ideaRow.action, lang), evidence: pick(ideaRow.evidence, lang), severity: ideaRow.severity }
      : null,
  }
}

export function hasAlerts(d: DigestData): boolean {
  return Boolean(d.drop || d.overtaken || d.freshNegative)
}

/* ───────────── Composición del correo ───────────── */

const NBSP = ' '
const MINUS = '−'

function fmt(lang: Lang) {
  const es = lang === 'es'
  const pct = (n: number) => (es ? `${Math.round(n)}${NBSP}%` : `${Math.round(n)}%`)
  const dec = (n: number) => (es ? n.toFixed(1).replace('.', ',') : n.toFixed(1))
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `${MINUS}${-n}` : '0')
  const points = (n: number) => {
    const r = Math.round(n)
    return `${signed(r)} ${es ? (Math.abs(r) === 1 ? 'punto' : 'puntos') : Math.abs(r) === 1 ? 'point' : 'points'}`
  }
  const many = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`
  const list = (items: string[]) =>
    items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${es ? 'y' : 'and'} ${items[items.length - 1]}`
  const range = (from: string, to: string) => {
    const date = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString(es ? 'es-ES' : 'en-US', { ...o, timeZone: 'UTC' })
    const sameMonth = from.slice(0, 7) === to.slice(0, 7)
    if (es) return sameMonth ? `del ${Number(from.slice(8))} al ${date(to, { day: 'numeric', month: 'long' })}` : `del ${date(from, { day: 'numeric', month: 'long' })} al ${date(to, { day: 'numeric', month: 'long' })}`
    return sameMonth ? `from ${date(from, { month: 'long', day: 'numeric' })} to ${Number(to.slice(8))}` : `from ${date(from, { month: 'long', day: 'numeric' })} to ${date(to, { month: 'long', day: 'numeric' })}`
  }
  const clip = (s: string, max = QUOTE_MAX) => {
    const t = s.replace(/\s+/g, ' ').trim()
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
  }
  return { pct, dec, signed, points, many, list, range, clip }
}

export function digestSubject(d: DigestData): string {
  const es = d.lang === 'es'
  const f = fmt(d.lang)
  if (d.drop) return es ? `Alerta: la visibilidad de ${d.brand} baja ${d.drop.points} puntos` : `Alert: ${d.brand}'s visibility dropped ${d.drop.points} points`
  if (d.overtaken) return es ? `Alerta: ${d.overtaken.name} te adelanta en las respuestas de IA` : `Alert: ${d.overtaken.name} overtook ${d.brand} in AI answers`
  if (d.freshNegative) return es ? `Alerta: una IA habla mal de ${d.brand}` : `Alert: an AI answer speaks badly of ${d.brand}`
  const delta = d.hasPrev ? Math.round(d.vis - d.prevVis) : null
  const change = delta === null ? '' : delta === 0 ? (es ? ' (sin cambios)' : ' (no change)') : ` (${f.signed(delta)})`
  return es ? `${d.brand} esta semana en las IA: ${f.pct(d.vis)} de visibilidad${change}` : `${d.brand} in AI answers this week: ${f.pct(d.vis)} visibility${change}`
}

const TONE: Record<Severity, EmailTone> = { critico: 'bad', aviso: 'warn', oportunidad: 'good', bien: 'good' }

/** El correo de una persona (el pie y el enlace de baja son suyos). */
export function composeDigest(d: DigestData, r: Recipient): EmailInput {
  const es = d.lang === 'es'
  const t = (en: string, esText: string) => (es ? esText : en)
  const f = fmt(d.lang)
  const blocks: EmailBlock[] = []

  // 1. Alertas
  if (d.drop) {
    blocks.push({
      type: 'alert',
      tone: 'bad',
      title: t(`Your visibility dropped ${d.drop.points} points`, `Tu visibilidad ha bajado ${d.drop.points} puntos`),
      text: t(
        `You went from ${f.pct(d.prevVis)} to ${f.pct(d.vis)} in a week. Check in your dashboard who took your spot and which sources gained weight.`,
        `Has pasado del ${f.pct(d.prevVis)} al ${f.pct(d.vis)} en una semana. Mira en el panel quién ocupa tu sitio y qué fuentes han ganado peso.`,
      ),
    })
  }
  if (d.overtaken) {
    const o = d.overtaken
    const more = o.others ? t(` and ${o.others} more`, ` y ${o.others} más`) : ''
    blocks.push({
      type: 'alert',
      tone: 'warn',
      title: o.others ? t(`${o.name}${more} overtook you`, `${o.name}${more} te han adelantado`) : t(`${o.name} overtook you`, `${o.name} te ha adelantado`),
      text: t(
        `Last week ${o.name} appeared in ${f.pct(o.prevVis)} of answers and you in ${f.pct(o.ownPrevVis)}. This week it is ${f.pct(o.vis)} against your ${f.pct(d.vis)}.`,
        `La semana pasada ${o.name} salía en el ${f.pct(o.prevVis)} de las respuestas y tú en el ${f.pct(o.ownPrevVis)}. Esta semana sale en el ${f.pct(o.vis)} y tú en el ${f.pct(d.vis)}.`,
      ),
    })
  }
  if (d.freshNegative) {
    const n = d.freshNegative
    const where = t(`${n.engine}, asked "${f.clip(n.prompt, 120)}"`, `${n.engine}, al preguntar «${f.clip(n.prompt, 120)}»`)
    blocks.push({
      type: 'alert',
      tone: 'warn',
      title:
        n.answers === 1
          ? t(`A new answer speaks badly of ${d.brand}`, `Una respuesta nueva habla mal de ${d.brand}`)
          : t(`${n.answers} new answers speak badly of ${d.brand}`, `${n.answers} respuestas nuevas hablan mal de ${d.brand}`),
      text: n.quote
        ? t(`"${f.clip(n.quote)}" (${where}). Last week that question had no criticism on that platform.`, `«${f.clip(n.quote)}» (${where}). La semana pasada esa pregunta no tenía críticas en esa plataforma.`)
        : t(`On ${where}. Last week that question had no criticism on that platform.`, `En ${where}. La semana pasada esa pregunta no tenía críticas en esa plataforma.`),
    })
  }

  // 2. Cifras
  const visDelta = d.vis - d.prevVis
  blocks.push({
    type: 'stats',
    heading: t('Your numbers', 'Tus cifras'),
    items: [
      {
        label: t('Visibility', 'Visibilidad'),
        value: f.pct(d.vis),
        sub: d.hasPrev ? t(`${f.points(visDelta)} vs last week`, `${f.points(visDelta)} frente a la semana anterior`) : t('No previous week to compare', 'Sin semana anterior para comparar'),
      },
      {
        label: t('Average position', 'Posición media'),
        value: d.position !== null ? f.dec(d.position) : t('No data', 'Sin datos'),
        sub:
          d.position === null
            ? t('You were not named first-hand', 'No te han nombrado directamente')
            : d.hasPrev && d.prevPosition !== null
              ? t(`was ${f.dec(d.prevPosition)} · lower is better`, `antes ${f.dec(d.prevPosition)} · cuanto más bajo, mejor`)
              : t('Lower is better', 'Cuanto más bajo, mejor'),
      },
      {
        label: t('Answers analyzed', 'Respuestas analizadas'),
        value: String(d.searches),
        sub: d.prevSearches > 0 ? t(`was ${d.prevSearches}`, `antes ${d.prevSearches}`) : undefined,
      },
    ],
  })

  // 3. Competencia
  if (d.rivals.length) {
    const rows = [
      { name: d.brand, vis: d.vis, prevVis: d.prevVis, own: true, ahead: false },
      ...d.rivals.map((x) => ({ ...x, own: false })),
    ].sort((a, b) => Math.round(b.vis) - Math.round(a.vis) || Number(b.own) - Number(a.own) || b.vis - a.vis)
    blocks.push({
      type: 'rows',
      heading: t('You vs your competitors', 'Tú frente a tu competencia'),
      // Sin semana anterior con la que comparar, la columna del cambio no sale.
      head: [t('Brand', 'Marca'), t('Visibility', 'Visibilidad'), ...(d.hasPrev ? [t('Change', 'Cambio')] : [])],
      rows: rows.map((x) => ({
        cells: [x.name, f.pct(x.vis), ...(d.hasPrev ? [f.signed(Math.round(x.vis - x.prevVis))] : [])],
        strong: x.own,
        note: x.own ? t('you', 'tú') : x.ahead ? t('ahead of you', 'por delante de ti') : undefined,
      })),
    })
  }

  // 4. Tu web como fuente
  if (d.ownCited) {
    const { now, prev } = d.ownCited
    const domain = d.ws.domain
    const lost = d.hasPrev && prev > 0 && now === 0
    blocks.push(
      lost
        ? {
            type: 'item',
            heading: t('Your website as a source', 'Tu web como fuente'),
            tone: 'bad',
            title: t('Your website is no longer cited', 'Tu web ha dejado de citarse'),
            text: t(
              `Last week ${f.many(prev, 'answer', 'answers')} linked to ${domain}; this week, none. Check that those pages are still live and up to date.`,
              `La semana pasada ${f.many(prev, 'respuesta enlazaba', 'respuestas enlazaban')} a ${domain}; esta semana, ninguna. Revisa que esas páginas sigan publicadas y al día.`,
            ),
          }
        : {
            type: 'item',
            heading: t('Your website as a source', 'Tu web como fuente'),
            text:
              t(`${domain} was cited in ${f.many(now, 'answer', 'answers')}`, `${domain} aparece como fuente en ${f.many(now, 'respuesta', 'respuestas')}`) +
              (d.prevSearches > 0 ? t(` (was ${prev}).`, ` (antes ${prev}).`) : '.'),
          },
    )
  }

  // 5. Tono
  {
    const { now, prev, example } = d.negatives
    const text =
      now === 0 && prev === 0
        ? t(`No answer speaks badly of ${d.brand}.`, `Ninguna respuesta habla mal de ${d.brand}.`)
        : (now === 0
            ? t('No negative mentions this week', 'Ninguna mención negativa esta semana')
            : t(`${f.many(now, 'negative mention', 'negative mentions')}`, `${f.many(now, 'mención negativa', 'menciones negativas')}`)) +
          (d.prevSearches > 0 ? t(` (was ${prev}).`, ` (antes ${prev}).`) : '.')
    let note: string | undefined
    if (now > 0 && !d.freshNegative) {
      const quote = example?.quote
        ? t(`For example: "${f.clip(example.quote)}" (${example.engine}).`, `Por ejemplo: «${f.clip(example.quote)}» (${example.engine}).`)
        : ''
      const same = d.hasPrev ? t(' None is new: they repeat on the same questions as last week.', ' Ninguna es nueva: se repiten en las mismas preguntas que la semana pasada.') : ''
      note = `${quote}${same}`.trim() || undefined
    }
    blocks.push({ type: 'item', heading: t('Tone', 'Tono'), text, note })
  }

  // 6. Idea de la semana
  if (d.idea) {
    blocks.push({
      type: 'item',
      heading: t('Insight of the week', 'Idea de la semana'),
      tone: TONE[d.idea.severity],
      title: d.idea.title,
      text: d.idea.action,
      note: d.idea.evidence ? t(`Data: ${d.idea.evidence}`, `Dato: ${d.idea.evidence}`) : undefined,
    })
  }

  const base = `${appUrl()}/dashboard/w/${d.ws.id}`
  const off = digestOffUrl(r.userId, d.ws.id)
  const manages = digestByDefault(r.role)
  const platforms = d.engines.length ? f.list(d.engines) : t('the AI platforms', 'las IA')
  return {
    to: r.email,
    subject: digestSubject(d),
    kind: hasAlerts(d) ? 'resumen-alerta' : 'resumen-semanal',
    lang: d.lang,
    title: t(`${d.brand} in AI answers this week`, `${d.brand} esta semana en las IA`),
    body: t(
      `Here is what ${platforms} said about ${d.brand} ${f.range(d.from, d.to)}, across ${f.many(d.searches, 'answer', 'answers')} to your prompts.`,
      `Esto es lo que han dicho ${platforms} sobre ${d.brand} ${f.range(d.from, d.to)}, en ${f.many(d.searches, 'respuesta', 'respuestas')} a tus prompts.`,
    ),
    blocks,
    cta: { label: t('Open your dashboard', 'Abrir el panel'), url: base },
    link: { label: t('See all insights', 'Ver todas las ideas'), url: `${base}?to=insights` },
    footer: {
      text: manages
        ? t(`You're receiving this because you manage ${d.ws.name} on Placton.`, `Recibes este correo porque gestionas ${d.ws.name} en Placton.`)
        : t(`You're receiving this because you turned it on for ${d.ws.name} on Placton.`, `Recibes este correo porque lo activaste para ${d.ws.name} en Placton.`),
      links: [
        { label: t('Change in Settings', 'Cambiar en Ajustes'), url: `${base}?to=settings` },
        ...(off ? [{ label: t('Unsubscribe', 'Darme de baja'), url: off }] : []),
      ],
    },
    headers: off ? { 'List-Unsubscribe': `<${off}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
  }
}

/** Datos y correo de un espacio para una persona, sin enviarlo (vista previa). */
export function buildDigest(ws: Workspace, to?: Recipient, end = ws.lastTrackedDay ?? today()): { data: DigestData; email: EmailInput } {
  const data = digestData(ws, end)
  const r = to ??
    recipients(ws.id)[0] ?? { userId: 0, email: 'preview@placton.test', firstName: '', lastName: '', role: 'owner' as Role }
  return { data, email: composeDigest(data, r) }
}

/* ───────────── Envío (tarea de cada hora) ───────────── */

function madridHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(now))
}

/** Hay una medición viva (con latido reciente) en el espacio. */
function measuring(workspaceId: number, now: Date): boolean {
  const since = new Date(now.getTime() - 10 * 60_000).toISOString()
  return Boolean(one("SELECT 1 AS x FROM runs WHERE workspaceId = ? AND status = 'corriendo' AND COALESCE(heartbeatAt, startedAt) > ?", [workspaceId, since]))
}

/** Reserva el resumen de esa medición: si otro proceso ya lo cogió, no cambia ninguna fila. */
function claim(workspaceId: number, day: string): boolean {
  return run('UPDATE workspaces SET digestSentFor = ? WHERE id = ? AND (digestSentFor IS NULL OR digestSentFor <> ?)', [day, workspaceId, day]).changes === 1
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Outcome = 'wait' | 'skip' | 'sent'

async function digestFor(workspaceId: number, now: Date): Promise<{ outcome: Outcome; emails: number }> {
  const ws = repo.workspaceById(workspaceId)
  const day = ws?.lastTrackedDay
  if (!ws || !day) return { outcome: 'wait', emails: 0 }
  const skip = () => {
    claim(ws.id, day)
    return { outcome: 'skip' as const, emails: 0 }
  }
  // Mediciones viejas (tras una caída del servidor): no se mandan resúmenes atrasados.
  if (day < addDays(today(now), -MAX_AGE_DAYS)) return skip()
  if (measuring(ws.id, now)) return { outcome: 'wait', emails: 0 }
  // La primera medición (alta) no tiene semana anterior: el primer resumen sale con la semanal.
  const trigger = one<{ trigger: string }>("SELECT trigger FROM runs WHERE workspaceId = ? AND day = ? AND status = 'ok' AND trigger <> 'manual' ORDER BY id DESC LIMIT 1", [ws.id, day])?.trigger
  if (trigger !== 'diario') return skip()
  // Tampoco si es la primera medición completa aunque sea semanal (prueba que paga sin
  // medición de alta, o alta que falló): sin otra anterior no hay semana con la que comparar.
  if (!one("SELECT 1 AS x FROM runs WHERE workspaceId = ? AND status = 'ok' AND trigger <> 'manual' AND day < ?", [ws.id, day])) return skip()
  const mode: DigestMode = ws.digestMode ?? 'all'
  if (mode === 'off' || !repo.accessOf(ws).ok) return skip()
  const hour = madridHour(now)
  if (hour < FIRST_HOUR || hour > LAST_HOUR) return { outcome: 'wait', emails: 0 }
  if (!claim(ws.id, day)) return { outcome: 'skip', emails: 0 }
  const data = digestData(ws, day)
  if (data.searches < MIN_ANSWERS || (mode === 'alerts' && !hasAlerts(data))) return { outcome: 'skip', emails: 0 }
  let emails = 0
  for (const r of recipients(ws.id)) {
    // Se apunta antes de enviar (como los avisos de la prueba): un fallo de Resend queda en email_log y no se reintenta.
    if (await sendEmail(composeDigest(data, r))) emails++
    if (emailReady()) await sleep(GAP_MS)
  }
  return { outcome: 'sent', emails }
}

/**
 * Lo que llama la tarea de cada hora. PLACTON_DIGEST=0 lo apaga entero.
 * `now` solo sirve para las pruebas (horario y antigüedad).
 */
export async function weeklyDigests(opts: { now?: Date } = {}): Promise<{ sent: number[]; skipped: number[]; waiting: number[]; emails: number }> {
  const out = { sent: [] as number[], skipped: [] as number[], waiting: [] as number[], emails: 0 }
  if (process.env.PLACTON_DIGEST === '0') return out
  const g = globalThis as unknown as { __plactonDigest?: boolean }
  if (g.__plactonDigest) return out
  g.__plactonDigest = true
  try {
    const pending = all<{ id: number }>(
      'SELECT id FROM workspaces WHERE onboarded = 1 AND lastTrackedDay IS NOT NULL AND (digestSentFor IS NULL OR digestSentFor <> lastTrackedDay) ORDER BY id',
    )
    for (const { id } of pending) {
      try {
        const res = await digestFor(id, opts.now ?? new Date())
        out[res.outcome === 'sent' ? 'sent' : res.outcome === 'skip' ? 'skipped' : 'waiting'].push(id)
        out.emails += res.emails
      } catch (err) {
        reportError(err, `resumen semanal del espacio ${id}`)
      }
    }
  } finally {
    g.__plactonDigest = false
  }
  return out
}
