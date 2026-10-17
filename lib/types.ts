import type { Interval, PlanId } from './plans'

export type Role = 'owner' | 'admin' | 'member'
export type Sentiment = 'positivo' | 'neutro' | 'negativo'
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'

export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  passwordHash: string | null
  googleId: string | null
  currentWorkspaceId: number | null
  createdAt: string
}

export interface Workspace {
  id: number
  name: string
  brandName: string
  domain: string
  aliases: string[]
  description: string
  country: string
  language: string
  engines: string[]
  onboarded: boolean
  plan: PlanId
  billingInterval: Interval
  status: SubStatus
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  lastTrackedDay: string | null
  /** Plan Agencia: clientes contratados (en el espacio que paga). */
  seats: number
  /** Plan Agencia: espacio de la agencia que paga este cliente. */
  billingOwnerId: number | null
  /** Plan Agencia: prompts semanales contratados en total (en el espacio que paga). */
  promptPool: number
  /** Desde cuándo hay un cobro fallido (los días de gracia cuentan desde aquí). */
  pastDueSince?: string | null
  /** Logo subido por el cliente (si no, el icono de su web). */
  logoUpdatedAt?: string | null
  createdBy: number | null
  createdAt: string
}

export interface Member {
  userId: number
  email: string
  firstName: string
  lastName: string
  role: Role
  createdAt: string
}

export interface Invite {
  id: number
  workspaceId: number
  email: string
  role: Role
  token: string
  invitedBy: number | null
  createdAt: string
  acceptedAt: string | null
}

export interface Competitor {
  id: number
  workspaceId: number
  name: string
  domain: string
  aliases: string[]
  createdAt: string
}

export interface Prompt {
  id: number
  workspaceId: number
  text: string
  topic: string
  active: boolean
  source: 'sugerido' | 'manual'
  createdAt: string
}

export interface Suggestion {
  id: number
  workspaceId: number
  text: string
  topic: string
  why: string
  status: 'nueva' | 'aceptada' | 'descartada'
  createdAt: string
}

export interface Run {
  id: number
  workspaceId: number
  day: string
  trigger: 'diario' | 'manual' | 'alta'
  status: 'corriendo' | 'ok' | 'error'
  total: number
  done: number
  costUsd: number
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface Answer {
  id: number
  runId: number
  workspaceId: number
  promptId: number
  engine: string
  model: string
  day: string
  text: string
  empty: boolean
  searchQueries: string[]
  latencyMs: number
  costUsd: number
  error: string | null
  createdAt: string
}

export interface MentionRow {
  id: number
  answerId: number
  workspaceId: number
  day: string
  engine: string
  promptId: number
  brandKey: string
  name: string
  kind: 'marca' | 'competidor' | 'otro'
  competitorId: number | null
  direct: number
  rank: number | null
  sentiment: Sentiment
  quote: string
}

export interface CitationRow {
  id: number
  answerId: number
  workspaceId: number
  day: string
  engine: string
  url: string
  domain: string
  title: string
  brandKey: string | null
}

export type Severity = 'critico' | 'aviso' | 'oportunidad' | 'bien'

export interface Insight {
  id: number
  workspaceId: number
  periodKey: string
  kind: string
  severity: Severity
  title: string
  body: string
  action: string
  evidence: string
  readAt: string | null
  createdAt: string
}

/** Una marca seguida en el espacio: la propia o un competidor. */
export interface TrackedBrand {
  key: string
  name: string
  domain: string
  aliases: string[]
  own: boolean
  competitorId: number | null
}
