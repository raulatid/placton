import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

// node:sqlite se pide directamente a Node y no a través del empaquetador: el
// recargado en caliente de Turbopack lo trataba como módulo externo y fallaba
// con «require is not defined», tumbando el panel hasta reiniciar.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')
type DatabaseSync = DatabaseSyncType

// SQLite nativo de Node 24 (`node:sqlite`): un solo fichero, cero dependencias.
// En producción va en un volumen persistente (PLACTON_DATA_DIR). Todo el acceso
// pasa por los helpers de abajo; cambiar a Postgres = reescribir esta capa y repo.

const DB_DIR = process.env.PLACTON_DATA_DIR || path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'placton.db')

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  firstName TEXT NOT NULL DEFAULT '',
  lastName TEXT NOT NULL DEFAULT '',
  passwordHash TEXT,
  googleId TEXT UNIQUE,
  currentWorkspaceId INTEGER,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expiresAt TEXT NOT NULL,
  usedAt TEXT
);

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brandName TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  aliases TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'España',
  language TEXT NOT NULL DEFAULT 'es',
  engines TEXT NOT NULL DEFAULT '[]',
  onboarded INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'trial',
  billingInterval TEXT NOT NULL DEFAULT 'month',
  status TEXT NOT NULL DEFAULT 'trialing',
  trialEndsAt TEXT,
  currentPeriodEnd TEXT,
  cancelAtPeriodEnd INTEGER NOT NULL DEFAULT 0,
  stripeCustomerId TEXT,
  stripeSubscriptionId TEXT,
  lastTrackedDay TEXT,
  createdBy INTEGER,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt TEXT NOT NULL,
  PRIMARY KEY (workspaceId, userId)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(userId);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  invitedBy INTEGER,
  createdAt TEXT NOT NULL,
  acceptedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_ws ON invites(workspaceId);

CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  aliases TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_competitors_ws ON competitors(workspaceId);

CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompts_ws ON prompts(workspaceId);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  why TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'nueva',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_ws ON suggestions(workspaceId, status);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'diario',
  status TEXT NOT NULL DEFAULT 'corriendo',
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  costUsd REAL NOT NULL DEFAULT 0,
  error TEXT,
  startedAt TEXT NOT NULL,
  finishedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_ws ON runs(workspaceId, startedAt DESC);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runId INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  promptId INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  empty INTEGER NOT NULL DEFAULT 0,
  searchQueries TEXT NOT NULL DEFAULT '[]',
  latencyMs INTEGER NOT NULL DEFAULT 0,
  costUsd REAL NOT NULL DEFAULT 0,
  error TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_ws_day ON answers(workspaceId, day);
CREATE INDEX IF NOT EXISTS idx_answers_prompt ON answers(promptId, day);

CREATE TABLE IF NOT EXISTS mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answerId INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  engine TEXT NOT NULL,
  promptId INTEGER NOT NULL,
  brandKey TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  competitorId INTEGER,
  direct INTEGER NOT NULL DEFAULT 1,
  rank INTEGER,
  sentiment TEXT NOT NULL DEFAULT 'neutro',
  quote TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mentions_ws_day ON mentions(workspaceId, day);
CREATE INDEX IF NOT EXISTS idx_mentions_answer ON mentions(answerId);

CREATE TABLE IF NOT EXISTS citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answerId INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  engine TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  brandKey TEXT
);
CREATE INDEX IF NOT EXISTS idx_citations_ws_day ON citations(workspaceId, day);
CREATE INDEX IF NOT EXISTS idx_citations_answer ON citations(answerId);

CREATE TABLE IF NOT EXISTS insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  periodKey TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  readAt TEXT,
  createdAt TEXT NOT NULL,
  UNIQUE (workspaceId, periodKey, kind)
);
CREATE INDEX IF NOT EXISTS idx_insights_ws ON insights(workspaceId, createdAt DESC);

CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspaceId INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  results TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audits_ws ON audits(workspaceId, createdAt DESC);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  userId INTEGER,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  workspaceId INTEGER,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'eur',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_domains (
  nameKey TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  checkedAt TEXT NOT NULL,
  PRIMARY KEY (nameKey, country)
);

CREATE TABLE IF NOT EXISTS signup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ipHash TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signup_ip ON signup_log(ipHash, createdAt);

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  refHost TEXT NOT NULL DEFAULT '',
  utmSource TEXT NOT NULL DEFAULT '',
  visitor TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_views_day ON page_views(day);

CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature TEXT NOT NULL,
  message TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(createdAt);

CREATE TABLE IF NOT EXISTS trial_log (
  workspaceId INTEGER PRIMARY KEY,
  userId INTEGER,
  domain TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trial_log_domain ON trial_log(domain);
CREATE INDEX IF NOT EXISTS idx_trial_log_user ON trial_log(userId);

CREATE TABLE IF NOT EXISTS cost_snapshots (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  value REAL NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (day, source)
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  toEmail TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  createdAt TEXT NOT NULL
);

-- Campaña de captación por correo (lib/outreach): buzones de envío conectados
-- por OAuth, contactos con su secuencia ya redactada, lo enviado, lo recibido
-- (respuestas, rebotes, bajas) y la lista de exclusión permanente.
CREATE TABLE IF NOT EXISTS outreach_mailboxes (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  refreshToken TEXT NOT NULL,
  warmupFrom TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  pausedReason TEXT,
  nextSendAt TEXT,
  lastPollAt TEXT,
  lastError TEXT,
  createdAt TEXT NOT NULL,
  resumedAt TEXT
);

CREATE TABLE IF NOT EXISTS outreach_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  tz TEXT NOT NULL DEFAULT 'America/New_York',
  priority INTEGER NOT NULL DEFAULT 0,
  steps TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  step INTEGER NOT NULL DEFAULT 0,
  mailbox TEXT,
  threadId TEXT,
  messageIds TEXT NOT NULL DEFAULT '[]',
  subject TEXT,
  nextAt TEXT,
  lastSentAt TEXT,
  repliedAt TEXT,
  signedUpAt TEXT,
  paidAt TEXT,
  workspaceId INTEGER,
  importedAt TEXT NOT NULL,
  pendingAt TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_due ON outreach_contacts(status, nextAt);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_domain ON outreach_contacts(domain);
CREATE INDEX IF NOT EXISTS idx_outreach_contacts_thread ON outreach_contacts(threadId);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contactId INTEGER NOT NULL,
  mailbox TEXT NOT NULL,
  step INTEGER NOT NULL,
  subject TEXT NOT NULL,
  gmailId TEXT,
  error TEXT,
  sentAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_mailbox ON outreach_messages(mailbox, sentAt);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_sent ON outreach_messages(sentAt);

CREATE TABLE IF NOT EXISTS outreach_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contactId INTEGER,
  mailbox TEXT,
  kind TEXT NOT NULL,
  fromEmail TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  threadId TEXT,
  gmailId TEXT UNIQUE,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outreach_events_kind ON outreach_events(kind, createdAt);

CREATE TABLE IF NOT EXISTS outreach_suppress (
  value TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach_seen (
  gmailId TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

const globalForDb = globalThis as unknown as { __plactonDb?: DatabaseSync }

export function db(): DatabaseSync {
  if (globalForDb.__plactonDb) return globalForDb.__plactonDb
  mkdirSync(DB_DIR, { recursive: true })
  const conn = new DatabaseSync(DB_PATH)
  conn.exec(SCHEMA)
  // Migraciones aditivas: columnas nuevas en bases ya creadas.
  for (const sql of [
    'ALTER TABLE runs ADD COLUMN heartbeatAt TEXT',
    // Plan Agencia: clientes contratados (en el espacio que paga) y quién paga (en cada cliente).
    'ALTER TABLE workspaces ADD COLUMN seats INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE workspaces ADD COLUMN billingOwnerId INTEGER',
    // Plan Agencia: bolsa de prompts diarios contratada (en el espacio que paga).
    'ALTER TABLE workspaces ADD COLUMN promptPool INTEGER NOT NULL DEFAULT 0',
    // Avisos de la prueba gratis ya enviados (2 días antes y al terminar).
    'ALTER TABLE workspaces ADD COLUMN trialReminderAt TEXT',
    'ALTER TABLE workspaces ADD COLUMN trialEndedMailAt TEXT',
    // Competidores añadidos sin web: cuándo se buscó su dominio (para no repetir).
    'ALTER TABLE competitors ADD COLUMN domainCheckedAt TEXT',
    // Logo subido por el cliente para su propia marca (fecha = versión de la imagen).
    'ALTER TABLE workspaces ADD COLUMN logoUpdatedAt TEXT',
    // Analítica: tipo de dispositivo de cada visita (móvil, tableta u ordenador).
    "ALTER TABLE page_views ADD COLUMN device TEXT NOT NULL DEFAULT ''",
    // Respuestas compartidas: la misma pregunta, plataforma, país e idioma en la
    // misma semana se pregunta una vez y se reutiliza para los demás espacios.
    'ALTER TABLE answers ADD COLUMN promptKey TEXT',
    'ALTER TABLE answers ADD COLUMN reusedFrom INTEGER',
    'CREATE INDEX IF NOT EXISTS idx_answers_pool ON answers(promptKey, engine, day)',
    // Impagos: desde cuándo, para cortar el acceso tras los días de gracia.
    'ALTER TABLE workspaces ADD COLUMN pastDueSince TEXT',
    // Prompts borrados: se archivan (su historial de respuestas se conserva).
    'ALTER TABLE prompts ADD COLUMN deletedAt TEXT',
    // Campaña de correo: envío en curso, fallos por paso y reanudación de buzones.
    'ALTER TABLE outreach_contacts ADD COLUMN pendingAt TEXT',
    'ALTER TABLE outreach_contacts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE outreach_mailboxes ADD COLUMN resumedAt TEXT',
    // Pruebas ya usadas (permanente): borrar el espacio o la cuenta no da otra prueba.
    "INSERT OR IGNORE INTO trial_log (workspaceId, userId, domain, createdAt) SELECT id, createdBy, lower(domain), createdAt FROM workspaces WHERE onboarded = 1 AND billingOwnerId IS NULL",
  ]) {
    try {
      conn.exec(sql)
    } catch {
      // ya existe
    }
  }
  globalForDb.__plactonDb = conn
  return conn
}

type Param = string | number | null
type Params = Param[]

// node:sqlite devuelve filas sin prototipo; React no deja pasarlas a componentes
// de cliente. Se copian a objetos normales aquí, una vez, para toda la app.
export function all<T>(sql: string, params: Params = []): T[] {
  return db()
    .prepare(sql)
    .all(...params)
    .map((r) => ({ ...r })) as T[]
}

export function one<T>(sql: string, params: Params = []): T | null {
  const row = db().prepare(sql).get(...params)
  return row ? ({ ...row } as T) : null
}

export function run(sql: string, params: Params = []): { id: number; changes: number } {
  const r = db().prepare(sql).run(...params)
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) }
}

export function tx<T>(fn: () => T): T {
  const conn = db()
  conn.exec('BEGIN')
  try {
    const out = fn()
    conn.exec('COMMIT')
    return out
  } catch (err) {
    conn.exec('ROLLBACK')
    throw err
  }
}

export function jsonList(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function jsonOr<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Día natural en Madrid (YYYY-MM-DD): las mediciones diarias se agrupan por aquí. */
export function today(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(date)
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
