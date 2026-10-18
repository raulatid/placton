import { all, jsonList, nowIso, one, run, tx } from './db'
import { key, domainKey } from './norm'
import { PLANS, TRIAL_DAYS, type Interval, type PaidPlanId, type PlanId } from './plans'
import type {
  Competitor,
  DigestMode,
  Invite,
  Member,
  Prompt,
  Role,
  SubStatus,
  Suggestion,
  TrackedBrand,
  User,
  Workspace,
} from './types'

// Acceso a datos de cuentas, espacios y configuración de seguimiento.
// Las métricas viven en metrics.ts; el motor, en tracking.ts.

/* ───────────── Usuarios ───────────── */

export function userById(id: number): User | null {
  return one<User>('SELECT * FROM users WHERE id = ?', [id])
}

export function userByEmail(email: string): User | null {
  return one<User>('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()])
}

export function userByGoogleId(googleId: string): User | null {
  return one<User>('SELECT * FROM users WHERE googleId = ?', [googleId])
}

export function createUser(input: {
  email: string
  firstName: string
  lastName: string
  passwordHash: string | null
  googleId?: string | null
}): User {
  const { id } = run(
    'INSERT INTO users (email, firstName, lastName, passwordHash, googleId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [
      input.email.trim().toLowerCase(),
      input.firstName.trim(),
      input.lastName.trim(),
      input.passwordHash,
      input.googleId ?? null,
      nowIso(),
    ],
  )
  return userById(id)!
}

export function updateUser(id: number, fields: Partial<Pick<User, 'firstName' | 'lastName' | 'email' | 'passwordHash' | 'googleId' | 'currentWorkspaceId'>>) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined)
  if (!entries.length) return
  run(`UPDATE users SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`, [
    ...entries.map(([, v]) => v as string | number | null),
    id,
  ])
}

/** Auditorías hechas por un espacio en la última hora (freno). */
export function recentAudits(workspaceId: number): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM audits WHERE workspaceId = ? AND createdAt > ?', [workspaceId, new Date(Date.now() - 3_600_000).toISOString()])?.n ?? 0
}

/** Invalida los enlaces de cambio de contraseña pendientes. */
export function clearPasswordResets(userId: number) {
  run('DELETE FROM password_resets WHERE userId = ?', [userId])
}

export function displayName(u: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
  const full = `${u.firstName} ${u.lastName}`.trim()
  return full || u.email
}

/**
 * Qué pasaría al borrar la cuenta: suscripciones a cancelar (espacios que se
 * borran con ella) y espacios de pago compartidos de los que es propietario
 * (esos no se pueden dejar cobrando a su tarjeta sin que nadie lo sepa).
 */
export function deletionPlan(userId: number): { cancel: string[]; sharedPaid: string[] } {
  const cancel: string[] = []
  const sharedPaid: string[] = []
  for (const m of all<{ workspaceId: number; role: Role }>('SELECT workspaceId, role FROM members WHERE userId = ?', [userId])) {
    const ws = workspaceById(m.workspaceId)
    if (!ws) continue
    const others = one<{ n: number }>('SELECT COUNT(*) AS n FROM members WHERE workspaceId = ? AND userId != ?', [ws.id, userId])?.n ?? 0
    const live = ws.stripeSubscriptionId && ws.status !== 'canceled'
    if (!others && live) cancel.push(ws.stripeSubscriptionId!)
    if (others && live && m.role === 'owner') sharedPaid.push(ws.name)
  }
  return { cancel, sharedPaid }
}

/**
 * Borra la cuenta. Los espacios donde era el único miembro se borran con ella;
 * los compartidos se quedan y, si era propietario, la propiedad pasa al miembro
 * más antiguo.
 */
export function deleteUser(userId: number): { deletedWorkspaces: number[]; stripeSubscriptions: string[] } {
  const deletedWorkspaces: number[] = []
  const stripeSubscriptions: string[] = []
  tx(() => {
    const memberships = all<{ workspaceId: number; role: Role }>('SELECT workspaceId, role FROM members WHERE userId = ?', [userId])
    for (const m of memberships) {
      const others = all<{ userId: number; role: Role }>(
        'SELECT userId, role FROM members WHERE workspaceId = ? AND userId != ? ORDER BY createdAt ASC',
        [m.workspaceId, userId],
      )
      if (!others.length) {
        const ws = workspaceById(m.workspaceId)
        if (ws?.stripeSubscriptionId && ws.status !== 'canceled') stripeSubscriptions.push(ws.stripeSubscriptionId)
        run('DELETE FROM workspaces WHERE id = ?', [m.workspaceId])
        deletedWorkspaces.push(m.workspaceId)
      } else if (m.role === 'owner' && !others.some((o) => o.role === 'owner')) {
        run("UPDATE members SET role = 'owner' WHERE workspaceId = ? AND userId = ?", [m.workspaceId, others[0].userId])
      }
    }
    const email = one<{ email: string }>('SELECT email FROM users WHERE id = ?', [userId])?.email
    if (email) {
      run('DELETE FROM email_log WHERE lower(toEmail) = lower(?)', [email])
      run('DELETE FROM contact_messages WHERE userId = ? OR lower(email) = lower(?)', [userId, email])
    }
    run('DELETE FROM users WHERE id = ?', [userId])
  })
  return { deletedWorkspaces, stripeSubscriptions }
}

/* ───────────── Espacios ───────────── */

interface WorkspaceRow extends Omit<Workspace, 'aliases' | 'engines' | 'onboarded' | 'cancelAtPeriodEnd' | 'manualPlan'> {
  aliases: string
  engines: string
  onboarded: number
  cancelAtPeriodEnd: number
  manualPlan?: number
}

function toWorkspace(r: WorkspaceRow | null): Workspace | null {
  if (!r) return null
  return {
    ...r,
    aliases: jsonList(r.aliases),
    engines: jsonList(r.engines),
    onboarded: Boolean(r.onboarded),
    cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd),
    manualPlan: Boolean(r.manualPlan),
  }
}

export function workspaceById(id: number): Workspace | null {
  return toWorkspace(one<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id]))
}

export function workspaceByCustomer(customerId: string): Workspace | null {
  return toWorkspace(one<WorkspaceRow>('SELECT * FROM workspaces WHERE stripeCustomerId = ?', [customerId]))
}

export function workspaceBySubscription(subId: string): Workspace | null {
  return toWorkspace(one<WorkspaceRow>('SELECT * FROM workspaces WHERE stripeSubscriptionId = ?', [subId]))
}

export function allWorkspaces(): Workspace[] {
  return all<WorkspaceRow>('SELECT * FROM workspaces ORDER BY createdAt DESC').map((r) => toWorkspace(r)!)
}

export function workspacesOf(userId: number): (Workspace & { role: Role })[] {
  return all<WorkspaceRow & { role: Role }>(
    'SELECT w.*, m.role FROM workspaces w JOIN members m ON m.workspaceId = w.id WHERE m.userId = ? ORDER BY w.createdAt ASC',
    [userId],
  ).map((r) => ({ ...toWorkspace(r)!, role: r.role }))
}

export function roleIn(workspaceId: number, userId: number): Role | null {
  return one<{ role: Role }>('SELECT role FROM members WHERE workspaceId = ? AND userId = ?', [workspaceId, userId])?.role ?? null
}

export function createWorkspace(userId: number, name: string): Workspace {
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()
  const id = tx(() => {
    const { id } = run(
      `INSERT INTO workspaces (name, plan, status, trialEndsAt, createdBy, createdAt) VALUES (?, 'trial', 'trialing', ?, ?, ?)`,
      [name.trim() || 'My workspace', trialEnds, userId, nowIso()],
    )
    run("INSERT INTO members (workspaceId, userId, role, createdAt) VALUES (?, ?, 'owner', ?)", [id, userId, nowIso()])
    // Solo el primero pasa a ser el actual; los siguientes, al terminar su alta.
    run('UPDATE users SET currentWorkspaceId = ? WHERE id = ? AND currentWorkspaceId IS NULL', [id, userId])
    return id
  })
  return workspaceById(id)!
}

type WorkspaceEditable = Partial<{
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
  seats: number
  billingOwnerId: number | null
  promptPool: number
  pastDueSince: string | null
  digestMode: DigestMode
  digestSentFor: string | null
}>

export function updateWorkspace(id: number, fields: WorkspaceEditable) {
  const entries = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]): [string, string | number | null] => {
      if (Array.isArray(v)) return [k, JSON.stringify(v)]
      if (typeof v === 'boolean') return [k, v ? 1 : 0]
      if (k === 'domain' && typeof v === 'string') return [k, domainKey(v)]
      return [k, v as string | number | null]
    })
  if (!entries.length) return
  run(`UPDATE workspaces SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, v]) => v), id])
}

export function deleteWorkspace(id: number) {
  // Los clientes de una agencia que se borra se quedan con sus datos y sin plan:
  // pueden contratar el suyo propio.
  run("UPDATE workspaces SET billingOwnerId = NULL, plan = 'trial', status = 'expired', trialEndsAt = ?, trialEndedMailAt = ? WHERE billingOwnerId = ? AND id <> ?", [nowIso(), nowIso(), id, id])
  run('DELETE FROM workspaces WHERE id = ?', [id])
  run('UPDATE users SET currentWorkspaceId = NULL WHERE currentWorkspaceId = ?', [id])
}

/** ¿Puede el espacio medir y usar el panel? */
export function accessOf(ws: Workspace): { ok: boolean; reason: 'trial' | 'active' | 'trial_ended' | 'canceled' | 'past_due' } {
  if (ws.billingOwnerId && ws.billingOwnerId !== ws.id) {
    // Un cliente vale lo que valga la agencia que lo paga, y solo si sigue en el plan Agencia.
    const owner = workspaceById(ws.billingOwnerId)
    return owner && owner.plan === 'agencia' ? accessOf(owner) : { ok: false, reason: 'canceled' }
  }
  if (ws.plan === 'trial') {
    const live = ws.trialEndsAt && new Date(ws.trialEndsAt).getTime() > Date.now()
    return live ? { ok: true, reason: 'trial' } : { ok: false, reason: 'trial_ended' }
  }
  // Plan dado a mano: vale mientras no llegue su fecha de fin (si la tiene).
  if (ws.manualPlan) {
    const live = ws.status === 'active' && (!ws.manualUntil || new Date(ws.manualUntil).getTime() > Date.now())
    return live ? { ok: true, reason: 'active' } : { ok: false, reason: 'canceled' }
  }
  if (ws.status === 'active' || ws.status === 'trialing') return { ok: true, reason: 'active' }
  // Un impago deja 14 días de gracia mientras Stripe reintenta el cobro; después, se corta.
  if (ws.status === 'past_due') {
    const since = ws.pastDueSince ? new Date(ws.pastDueSince).getTime() : Date.now()
    return Date.now() - since < 14 * 86_400_000 ? { ok: true, reason: 'past_due' } : { ok: false, reason: 'past_due' }
  }
  return { ok: false, reason: 'canceled' }
}

/**
 * Crear otro espacio (fuera de la Agencia) exige tener ya uno de pago: la prueba
 * gratis es de un solo espacio por persona.
 */
export function canCreateWorkspace(userId: number): boolean {
  return workspacesOf(userId).some((w) => w.role === 'owner' && w.plan !== 'trial' && !w.billingOwnerId && accessOf(w).ok)
}

export function trialDaysLeft(ws: Workspace): number {
  if (!ws.trialEndsAt) return 0
  return Math.max(0, Math.ceil((new Date(ws.trialEndsAt).getTime() - Date.now()) / 86_400_000))
}

export function promptLimit(ws: Workspace): number {
  const owner = agencyOwnerOf(ws)
  if (owner) {
    // Bolsa compartida: lo contratado menos lo que ya usan los demás clientes.
    const pool = owner.promptPool || PLANS.agencia.prompts
    const elsewhere = agencyClients(owner.id)
      .filter((c) => c.id !== ws.id)
      .reduce((sum, c) => sum + activePromptCount(c.id), 0)
    return Math.max(0, pool - elsewhere)
  }
  return PLANS[ws.plan]?.prompts ?? PLANS.trial.prompts
}

/** Agencia: prompts activos sumando todos los clientes. */
export function agencyPromptsUsed(ownerId: number): number {
  return agencyClients(ownerId).reduce((sum, c) => sum + activePromptCount(c.id), 0)
}

export function memberLimit(ws: Workspace): number | null {
  if (ws.billingOwnerId) return null
  return PLANS[ws.plan]?.members ?? 1
}

/* ───────────── Plan Agencia ───────────── */

/** El espacio que paga: la propia agencia o la agencia de este cliente. */
export function agencyOwnerOf(ws: Workspace): Workspace | null {
  if (ws.billingOwnerId && ws.billingOwnerId !== ws.id) return workspaceById(ws.billingOwnerId)
  return ws.plan === 'agencia' ? ws : null
}

/** Clientes en uso: la propia agencia cuenta como su primer cliente. */
export function agencyClients(ownerId: number): Workspace[] {
  return all<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ? OR billingOwnerId = ? ORDER BY createdAt ASC', [ownerId, ownerId]).map((r) => toWorkspace(r)!)
}

/** Crea un espacio cliente pagado por la agencia, si quedan plazas. */
export function createClientWorkspace(userId: number, owner: Workspace, name: string): Workspace | null {
  if (agencyClients(owner.id).length >= Math.max(1, owner.seats)) return null
  const id = tx(() => {
    const { id } = run(
      `INSERT INTO workspaces (name, plan, status, billingOwnerId, createdBy, createdAt) VALUES (?, 'agencia', 'active', ?, ?, ?)`,
      [name.trim() || 'New client', owner.id, userId, nowIso()],
    )
    // Quien lo crea es su propietario; el resto del equipo de la agencia entra con su mismo papel.
    run("INSERT INTO members (workspaceId, userId, role, createdAt) VALUES (?, ?, 'owner', ?)", [id, userId, nowIso()])
    for (const m of membersOf(owner.id)) {
      run('INSERT OR IGNORE INTO members (workspaceId, userId, role, createdAt) VALUES (?, ?, ?, ?)', [id, m.userId, m.role, nowIso()])
    }
    return id
  })
  return workspaceById(id)
}

/* ───────────── Miembros e invitaciones ───────────── */

export function membersOf(workspaceId: number): Member[] {
  return all<Member>(
    `SELECT u.id AS userId, u.email, u.firstName, u.lastName, m.role, m.createdAt
     FROM members m JOIN users u ON u.id = m.userId WHERE m.workspaceId = ? ORDER BY m.createdAt ASC`,
    [workspaceId],
  )
}

export function addMember(workspaceId: number, userId: number, role: Role) {
  run('INSERT OR IGNORE INTO members (workspaceId, userId, role, createdAt) VALUES (?, ?, ?, ?)', [workspaceId, userId, role, nowIso()])
}

export function setMemberRole(workspaceId: number, userId: number, role: Role) {
  run('UPDATE members SET role = ? WHERE workspaceId = ? AND userId = ?', [role, workspaceId, userId])
}

export function removeMember(workspaceId: number, userId: number) {
  run('DELETE FROM members WHERE workspaceId = ? AND userId = ?', [workspaceId, userId])
  run('UPDATE users SET currentWorkspaceId = NULL WHERE id = ? AND currentWorkspaceId = ?', [userId, workspaceId])
}

/* ───────────── Preferencias de correo ───────────── */

export type EmailKind = 'semanal'

/** Lo que eligió la persona para ese espacio, o null si nunca eligió (manda su rol). */
export function emailPref(userId: number, workspaceId: number, kind: EmailKind): boolean | null {
  const r = one<{ enabled: number }>('SELECT enabled FROM email_prefs WHERE userId = ? AND workspaceId = ? AND kind = ?', [userId, workspaceId, kind])
  return r ? Boolean(r.enabled) : null
}

/** Guarda la elección; con null la borra y vuelve a mandar el rol. */
export function setEmailPref(userId: number, workspaceId: number, kind: EmailKind, enabled: boolean | null) {
  if (enabled === null) {
    run('DELETE FROM email_prefs WHERE userId = ? AND workspaceId = ? AND kind = ?', [userId, workspaceId, kind])
    return
  }
  run(
    'INSERT INTO email_prefs (userId, workspaceId, kind, enabled, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT (userId, workspaceId, kind) DO UPDATE SET enabled = excluded.enabled, updatedAt = excluded.updatedAt',
    [userId, workspaceId, kind, enabled ? 1 : 0, nowIso()],
  )
}

export function pendingInvites(workspaceId: number): Invite[] {
  return all<Invite>('SELECT * FROM invites WHERE workspaceId = ? AND acceptedAt IS NULL ORDER BY createdAt DESC', [workspaceId])
}

/** Invitación vigente: las de más de 14 días caducan (el enlace pudo acabar en cualquier sitio). */
export function inviteByToken(token: string): Invite | null {
  if (!token) return null
  return one<Invite>('SELECT * FROM invites WHERE token = ? AND createdAt > ?', [token, new Date(Date.now() - 14 * 86_400_000).toISOString()])
}

/** Invitaciones enviadas por un espacio en la última hora (freno al envío masivo). */
export function recentInvites(workspaceId: number): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM invites WHERE workspaceId = ? AND createdAt > ?', [workspaceId, new Date(Date.now() - 3_600_000).toISOString()])?.n ?? 0
}

export function createInvite(workspaceId: number, email: string, role: Role, invitedBy: number, token: string): Invite {
  run('DELETE FROM invites WHERE workspaceId = ? AND email = ? AND acceptedAt IS NULL', [workspaceId, email.toLowerCase()])
  const { id } = run('INSERT INTO invites (workspaceId, email, role, token, invitedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    workspaceId,
    email.trim().toLowerCase(),
    role,
    token,
    invitedBy,
    nowIso(),
  ])
  return one<Invite>('SELECT * FROM invites WHERE id = ?', [id])!
}

export function revokeInvite(workspaceId: number, inviteId: number) {
  run('DELETE FROM invites WHERE id = ? AND workspaceId = ?', [inviteId, workspaceId])
}

export function acceptInvite(invite: Invite, userId: number) {
  tx(() => {
    addMember(invite.workspaceId, userId, invite.role)
    run('UPDATE invites SET acceptedAt = ? WHERE id = ?', [nowIso(), invite.id])
    run('UPDATE users SET currentWorkspaceId = ? WHERE id = ?', [invite.workspaceId, userId])
  })
}

/* ───────────── Competidores ───────────── */

interface CompetitorRow extends Omit<Competitor, 'aliases'> {
  aliases: string
}

export function competitorsOf(workspaceId: number): Competitor[] {
  return all<CompetitorRow>('SELECT * FROM competitors WHERE workspaceId = ? ORDER BY createdAt ASC', [workspaceId]).map((r) => ({
    ...r,
    aliases: jsonList(r.aliases),
  }))
}

export const MAX_COMPETITORS = 25

/** ¿Choca este nombre con la marca propia o con otro competidor (salvo el que se edita)? */
export function brandNameTaken(workspaceId: number, name: string, exceptCompetitorId?: number): boolean {
  const k = key(name)
  const ws = workspaceById(workspaceId)
  if (ws && k && k === key(ws.brandName || ws.name)) return true
  return competitorsOf(workspaceId).some((c) => c.id !== exceptCompetitorId && key(c.name) === k)
}

export function addCompetitor(workspaceId: number, name: string, domain: string, aliases: string[] = []): number | null {
  const clean = name.trim().slice(0, 80)
  if (!clean || !key(clean)) return null
  const list = competitorsOf(workspaceId)
  if (list.length >= MAX_COMPETITORS) return null
  if (brandNameTaken(workspaceId, clean) || (domain && list.some((c) => c.domain === domainKey(domain)))) return null
  return run('INSERT INTO competitors (workspaceId, name, domain, aliases, createdAt) VALUES (?, ?, ?, ?, ?)', [
    workspaceId,
    clean,
    domain ? domainKey(domain) : '',
    JSON.stringify(aliases),
    nowIso(),
  ]).id
}

/**
 * Al renombrar una marca, su historial pasa a la clave nueva: las menciones y
 * citas se guardan con la clave del nombre que tenía al medirse.
 */
export function rekeyBrand(workspaceId: number, oldName: string, newName: string) {
  const from = key(oldName)
  const to = key(newName)
  if (!from || !to || from === to) return
  run('UPDATE mentions SET brandKey = ? WHERE workspaceId = ? AND brandKey = ?', [to, workspaceId, from])
  run('UPDATE citations SET brandKey = ? WHERE workspaceId = ? AND brandKey = ?', [to, workspaceId, from])
}

export function updateCompetitor(workspaceId: number, id: number, name: string, domain: string, aliases: string[]) {
  const before = one<{ name: string }>('SELECT name FROM competitors WHERE id = ? AND workspaceId = ?', [id, workspaceId])
  if (before) rekeyBrand(workspaceId, before.name, name)
  run('UPDATE competitors SET name = ?, domain = ?, aliases = ? WHERE id = ? AND workspaceId = ?', [
    name.trim(),
    domain ? domainKey(domain) : '',
    JSON.stringify(aliases),
    id,
    workspaceId,
  ])
}

export function removeCompetitor(workspaceId: number, id: number) {
  run('DELETE FROM competitors WHERE id = ? AND workspaceId = ?', [id, workspaceId])
}

/** La marca propia más los competidores, con su clave canónica. */
export function trackedBrands(ws: Workspace): TrackedBrand[] {
  const own: TrackedBrand = {
    key: key(ws.brandName || ws.name),
    name: ws.brandName || ws.name,
    domain: ws.domain,
    aliases: ws.aliases,
    own: true,
    competitorId: null,
  }
  return [
    own,
    ...competitorsOf(ws.id).map((c) => ({
      key: key(c.name),
      name: c.name,
      domain: c.domain,
      aliases: c.aliases,
      own: false,
      competitorId: c.id,
    })),
  ]
}

/* ───────────── Prompts y sugerencias ───────────── */

interface PromptRow extends Omit<Prompt, 'active'> {
  active: number
}

export function promptsOf(workspaceId: number, onlyActive = false): Prompt[] {
  return all<PromptRow>(
    `SELECT * FROM prompts WHERE workspaceId = ? AND deletedAt IS NULL ${onlyActive ? 'AND active = 1' : ''} ORDER BY createdAt ASC, id ASC`,
    [workspaceId],
  ).map((r) => ({ ...r, active: Boolean(r.active) }))
}

export function promptById(workspaceId: number, id: number): Prompt | null {
  const r = one<PromptRow>('SELECT * FROM prompts WHERE id = ? AND workspaceId = ?', [id, workspaceId])
  return r ? { ...r, active: Boolean(r.active) } : null
}

export function activePromptCount(workspaceId: number): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM prompts WHERE workspaceId = ? AND active = 1 AND deletedAt IS NULL', [workspaceId])?.n ?? 0
}

export function addPrompt(workspaceId: number, text: string, topic: string, source: 'sugerido' | 'manual'): number | null {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return null
  const dup = one<{ id: number; deletedAt: string | null }>('SELECT id, deletedAt FROM prompts WHERE workspaceId = ? AND lower(text) = lower(?) ORDER BY deletedAt IS NULL DESC LIMIT 1', [workspaceId, clean])
  // Si estaba archivado, vuelve con todo su historial (y no se vuelve a pagar lo de esta semana).
  if (dup?.deletedAt) {
    run('UPDATE prompts SET deletedAt = NULL, active = 1 WHERE id = ?', [dup.id])
    return dup.id
  }
  if (dup) return null
  return run('INSERT INTO prompts (workspaceId, text, topic, source, createdAt) VALUES (?, ?, ?, ?, ?)', [
    workspaceId,
    clean.slice(0, 400),
    topic.trim().slice(0, 60),
    source,
    nowIso(),
  ]).id
}

export function setPromptActive(workspaceId: number, id: number, active: boolean) {
  run('UPDATE prompts SET active = ? WHERE id = ? AND workspaceId = ?', [active ? 1 : 0, id, workspaceId])
}

/**
 * Cambiar el texto de una pregunta es preguntar otra cosa: la antigua se archiva
 * con sus respuestas y la nueva empieza de cero (se mide en la próxima medición).
 * Cambiar solo el tema no toca el historial.
 */
export function updatePrompt(workspaceId: number, id: number, text: string, topic: string) {
  const current = promptById(workspaceId, id)
  if (!current) return
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, 400)
  if (clean.toLowerCase() === current.text.toLowerCase()) {
    run('UPDATE prompts SET topic = ? WHERE id = ? AND workspaceId = ?', [topic.trim().slice(0, 60), id, workspaceId])
    return
  }
  deletePrompt(workspaceId, id)
  addPrompt(workspaceId, clean, topic, 'manual')
}

/** Borrar = archivar: deja de medirse y desaparece de la lista, pero sus respuestas siguen en el historial. */
export function deletePrompt(workspaceId: number, id: number) {
  run('UPDATE prompts SET deletedAt = ?, active = 0 WHERE id = ? AND workspaceId = ?', [nowIso(), id, workspaceId])
}

export function suggestionsOf(workspaceId: number, status: Suggestion['status'] = 'nueva'): Suggestion[] {
  return all<Suggestion>('SELECT * FROM suggestions WHERE workspaceId = ? AND status = ? ORDER BY createdAt DESC, id ASC', [workspaceId, status])
}

export function addSuggestions(workspaceId: number, items: { text: string; topic: string; why: string }[]) {
  const existing = new Set(
    [
      ...all<{ text: string }>('SELECT text FROM prompts WHERE workspaceId = ?', [workspaceId]),
      ...all<{ text: string }>('SELECT text FROM suggestions WHERE workspaceId = ?', [workspaceId]),
    ].map((r) => r.text.toLowerCase()),
  )
  for (const s of items) {
    const t = s.text.trim()
    if (!t || existing.has(t.toLowerCase())) continue
    existing.add(t.toLowerCase())
    run('INSERT INTO suggestions (workspaceId, text, topic, why, createdAt) VALUES (?, ?, ?, ?, ?)', [workspaceId, t, s.topic, s.why, nowIso()])
  }
}

export function setSuggestionStatus(workspaceId: number, id: number, status: Suggestion['status']): Suggestion | null {
  run('UPDATE suggestions SET status = ? WHERE id = ? AND workspaceId = ?', [status, id, workspaceId])
  return one<Suggestion>('SELECT * FROM suggestions WHERE id = ? AND workspaceId = ?', [id, workspaceId])
}

/* ───────────── Contacto ───────────── */

export function saveContact(input: { name: string; email: string; topic: string; message: string; userId: number | null }) {
  run('INSERT INTO contact_messages (name, email, topic, message, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    input.name.slice(0, 120),
    input.email.slice(0, 200),
    input.topic.slice(0, 60),
    input.message.slice(0, 5000),
    input.userId,
    nowIso(),
  ])
}

/* ───────────── Planes dados a mano (administración) ───────────── */

/** Da un plan sin pasar por Stripe. Sin fecha de fin, dura hasta que se quite. */
export function grantManualPlan(id: number, input: { plan: PaidPlanId; until: string | null; seats: number; prompts: number; note: string }): string | null {
  const ws = workspaceById(id)
  if (!ws) return 'Ese espacio no existe.'
  if (ws.billingOwnerId && ws.billingOwnerId !== ws.id) return 'Es un cliente de una agencia: su plan es el de la agencia que lo paga.'
  if (ws.stripeSubscriptionId && !ws.manualPlan && ['active', 'past_due', 'trialing'].includes(ws.status)) {
    return 'Tiene una suscripción de pago en Stripe. Cancélala antes de darle un plan a mano.'
  }
  const agency = input.plan === 'agencia'
  run(
    `UPDATE workspaces SET plan = ?, billingInterval = 'month', status = 'active', currentPeriodEnd = ?, cancelAtPeriodEnd = ?, seats = ?, promptPool = ?,
       pastDueSince = NULL, manualPlan = 1, manualUntil = ?, manualNote = ? WHERE id = ?`,
    [input.plan, input.until, input.until ? 1 : 0, agency ? Math.max(1, input.seats) : 1, agency ? Math.max(0, input.prompts) : 0, input.until, input.note.slice(0, 300), id],
  )
  return null
}

/** Quita el plan dado a mano: el espacio vuelve a la prueba (terminada si ya pasó) y elige plan. */
export function revokeManualPlan(id: number) {
  run(
    `UPDATE workspaces SET plan = 'trial', status = 'canceled', currentPeriodEnd = NULL, cancelAtPeriodEnd = 0, seats = 1, promptPool = 0,
       manualPlan = 0, manualUntil = NULL WHERE id = ? AND manualPlan = 1`,
    [id],
  )
}

/** Al empezar a pagar con Stripe deja de ser un plan dado a mano. */
export function clearManualPlan(id: number) {
  run('UPDATE workspaces SET manualPlan = 0, manualUntil = NULL WHERE id = ?', [id])
}
