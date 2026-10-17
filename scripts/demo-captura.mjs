// Espacio de demostración para la captura de la portada: Asana frente a Notion,
// monday.com, ClickUp y Trello, con 14 días de respuestas inventadas (7 + 7 de
// comparación). Se puede volver a ejecutar: borra la demo anterior y la rehace.
import { createHash, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(new URL('../data/placton.db', import.meta.url).pathname)
db.exec('PRAGMA foreign_keys = ON')
const EMAIL = 'demo-captura@placton.test'
const now = new Date().toISOString()
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const addDays = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
let seed = 20261017
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)

// Borrar la demo anterior
const old = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL)
if (old) {
  for (const w of db.prepare('SELECT workspaceId FROM members WHERE userId = ?').all(old.id)) db.prepare('DELETE FROM workspaces WHERE id = ?').run(w.workspaceId)
  db.prepare('DELETE FROM users WHERE id = ?').run(old.id)
}

const user = db
  .prepare('INSERT INTO users (email, firstName, lastName, createdAt) VALUES (?, ?, ?, ?) RETURNING id')
  .get(EMAIL, 'Alex', 'Rivera', now).id
const periodEnd = new Date(Date.now() + 26 * 86400000).toISOString()
const ws = db
  .prepare(
    `INSERT INTO workspaces (name, brandName, domain, aliases, description, country, language, engines, onboarded, plan, billingInterval, status, currentPeriodEnd, lastTrackedDay, createdBy, createdAt)
     VALUES (?, ?, ?, '[]', ?, 'United States', 'en', ?, 1, 'crecimiento', 'month', 'active', ?, ?, ?, ?) RETURNING id`,
  )
  .get('Asana', 'Asana', 'asana.com', 'Work management platform for teams', JSON.stringify(['chatgpt', 'claude', 'google', 'perplexity', 'grok']), periodEnd, today, user, now).id
db.prepare("INSERT INTO members (workspaceId, userId, role, createdAt) VALUES (?, ?, 'owner', ?)").run(ws, user, now)
db.prepare('UPDATE users SET currentWorkspaceId = ? WHERE id = ?').run(ws, user)

const BRANDS = [
  { key: 'asana', name: 'Asana', domain: 'asana.com', own: true, named: [0.28, 0.33], cited: [0.12, 0.15], weight: 2.2 },
  { key: 'notion', name: 'Notion', domain: 'notion.so', named: [0.39, 0.4], cited: [0.1, 0.1], weight: 2.8 },
  { key: 'mondaycom', name: 'monday.com', domain: 'monday.com', named: [0.23, 0.24], cited: [0.06, 0.06], weight: 1.5 },
  { key: 'clickup', name: 'ClickUp', domain: 'clickup.com', named: [0.18, 0.17], cited: [0.05, 0.05], weight: 1.1 },
  { key: 'trello', name: 'Trello', domain: 'trello.com', named: [0.1, 0.1], cited: [0.03, 0.03], weight: 0.7 },
]
for (const b of BRANDS.slice(1)) b.competitorId = db.prepare("INSERT INTO competitors (workspaceId, name, domain, aliases, createdAt) VALUES (?, ?, ?, '[]', ?) RETURNING id").get(ws, b.name, b.domain, now).id
const OTHERS = [
  { key: 'wrike', name: 'Wrike', p: 0.09 },
  { key: 'basecamp', name: 'Basecamp', p: 0.07 },
  { key: 'jira', name: 'Jira', p: 0.08 },
  { key: 'smartsheet', name: 'Smartsheet', p: 0.05 },
]

const PROMPTS = [
  'Best project management software for small teams',
  'What is the best tool to manage marketing campaigns?',
  'Asana vs Notion for a remote startup',
  'Which work management app is easiest to roll out across a company?',
  'Best alternatives to spreadsheets for tracking projects',
  'Top task management tools for agencies',
  'What software do product teams use to plan roadmaps?',
  'Best project management tool with timeline view',
  'Which project tool integrates best with Slack?',
  'Recommended tools to manage cross-functional projects',
  'Best free project management apps in 2026',
  'How do enterprise teams track OKRs and goals?',
  'Kanban board software for engineering teams',
  'What is the best app to organise team workloads?',
  'Project management tools with good automation',
  'Which tool should a 50-person company use for projects?',
  'Best software for managing client work at a design studio',
  'Simple to-do and project app for a nonprofit',
  'Tools for planning content calendars as a team',
  'What do operations teams use to manage requests?',
]
const prompts = PROMPTS.map((text) => db.prepare("INSERT INTO prompts (workspaceId, text, topic, active, source, createdAt) VALUES (?, ?, '', 1, 'sugerida', ?) RETURNING id").get(ws, text, now).id)

const ENGINES = { chatgpt: 1.0, claude: 0.85, google: 1.1, perplexity: 1.25, grok: 0.95 }
const MODELS = { chatgpt: 'gpt-5.4-mini', claude: 'claude-opus-5-5', google: 'ai-overview', perplexity: 'sonar', grok: 'grok-4' }
const SOURCES = ['g2.com', 'capterra.com', 'zapier.com', 'reddit.com', 'pcmag.com', 'forbes.com']

const insAnswer = db.prepare('INSERT INTO answers (runId, workspaceId, promptId, engine, model, day, text, empty, searchQueries, latencyMs, costUsd, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?) RETURNING id')
const insMention = db.prepare('INSERT INTO mentions (answerId, workspaceId, day, engine, promptId, brandKey, name, kind, competitorId, direct, rank, sentiment, quote) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
const insCite = db.prepare('INSERT INTO citations (answerId, workspaceId, day, engine, url, domain, title, brandKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')

db.exec('BEGIN')
for (let back = 13; back >= 0; back--) {
  const day = addDays(today, -back)
  const week = back >= 7 ? 0 : 1
  const startedAt = `${day}T07:00:00.000Z`
  const runId = db.prepare("INSERT INTO runs (workspaceId, day, trigger, status, total, done, costUsd, startedAt, finishedAt) VALUES (?, ?, 'diario', 'ok', 100, 100, 3.1, ?, ?) RETURNING id").get(ws, day, startedAt, `${day}T07:06:00.000Z`).id
  for (const [pi, promptId] of prompts.entries()) {
    for (const [engine, f] of Object.entries(ENGINES)) {
      const named = BRANDS.filter((b) => rnd() < b.named[week] * f)
      const others = OTHERS.filter((o) => rnd() < o.p)
      // Orden de aparición: sorteo ponderado (Notion suele salir antes)
      const order = [...named, ...others.map((o) => ({ ...o, weight: 0.6 }))].map((b) => ({ b, s: Math.pow(rnd(), 1 / b.weight) })).sort((x, y) => y.s - x.s).map((x) => x.b)
      const cited = BRANDS.filter((b) => rnd() < b.cited[week] * (engine === 'perplexity' || engine === 'google' ? 1.4 : 0.8))
      const names = order.map((b) => b.name)
      const text = names.length
        ? `For "${PROMPTS[pi]}", the options that come up most are ${names.slice(0, -1).join(', ')}${names.length > 1 ? ' and ' : ''}${names.at(-1)}. Each one fits a different kind of team, so it is worth comparing pricing, integrations and how much structure you need.`
        : `There is no single best answer to "${PROMPTS[pi]}". It depends on team size, budget and the integrations you rely on.`
      const answerId = insAnswer.get(runId, ws, promptId, engine, MODELS[engine], day, text, JSON.stringify([PROMPTS[pi].toLowerCase()]), 2000 + Math.round(rnd() * 6000), 0.03, `${day}T07:0${Math.floor(rnd() * 6)}:00.000Z`).id
      order.forEach((b, i) => {
        const r = rnd()
        const sentiment = r < 0.62 ? 'positivo' : r < 0.95 ? 'neutro' : 'negativo'
        const tracked = BRANDS.includes(b)
        insMention.run(answerId, ws, day, engine, promptId, b.key, b.name, tracked ? (b.own ? 'marca' : 'competidor') : 'otro', b.competitorId ?? null, 1, i + 1, sentiment, `${b.name} is a solid choice for teams that need clear ownership of tasks.`)
      })
      for (const b of cited) {
        insCite.run(answerId, ws, day, engine, `https://${b.domain}/guide/${pi + 1}`, b.domain, `${b.name} guide`, b.key)
        if (!named.includes(b)) insMention.run(answerId, ws, day, engine, promptId, b.key, b.name, b.own ? 'marca' : 'competidor', b.competitorId ?? null, 0, null, 'neutro', '')
      }
      if (rnd() < 0.7) {
        const d = SOURCES[Math.floor(rnd() * SOURCES.length)]
        insCite.run(answerId, ws, day, engine, `https://${d}/best-project-management-software`, d, 'Best project management software', null)
      }
    }
  }
}
db.exec('COMMIT')

// Sesión para la captura (un día)
const token = randomBytes(32).toString('base64url')
db.prepare('INSERT INTO sessions (id, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)').run(
  createHash('sha256').update(token).digest('hex'),
  user,
  new Date(Date.now() + 86400000).toISOString(),
  now,
)
console.log(JSON.stringify({ ws, user, token }))
