import { all, jsonList, nowIso, one, run, tx } from './db'
import { key, domainKey } from './norm'
import { PLANS, TRIAL_DAYS, type Interval, type PlanId } from './plans'
import type {
  Competitor,
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

export function displayName(u: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
  const full = `${u.firstName} ${u.lastName}`.trim()
  return full || u.email
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
    run('DELETE FROM users WHERE id = ?', [userId])
  })
  return { deletedWorkspaces, stripeSubscriptions }
}

/* ───────────── Espacios ───────────── */

interface WorkspaceRow extends Omit<Workspace, 'aliases' | 'engines' | 'onboarded' | 'cancelAtPeriodEnd'> {
  aliases: string
  engines: string
  onboarded: number
  cancelAtPeriodEnd: number
}

function toWorkspace(r: WorkspaceRow | null): Workspace | null {
  if (!r) return null
  return {
    ...r,
    aliases: jsonList(r.aliases),
    engines: jsonList(r.engines),
    onboarded: Boolean(r.onboarded),
    cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd),
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
    run('UPDATE users SET currentWorkspaceId = ? WHERE id = ?', [id, userId])
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
  run('DELETE FROM workspaces WHERE id = ?', [id])
  run('UPDATE users SET currentWorkspaceId = NULL WHERE currentWorkspaceId = ?', [id])
}

/** ¿Puede el espacio medir y usar el panel? */
export function accessOf(ws: Workspace): { ok: boolean; reason: 'trial' | 'active' | 'trial_ended' | 'canceled' | 'past_due' } {
  if (ws.billingOwnerId && ws.billingOwnerId !== ws.id) {
    const owner = workspaceById(ws.billingOwnerId)
    return owner ? accessOf(owner) : { ok: false, reason: 'canceled' }
  }
  if (ws.plan === 'trial') {
    const live = ws.trialEndsAt && new Date(ws.trialEndsAt).getTime() > Date.now()
    return live ? { ok: true, reason: 'trial' } : { ok: false, reason: 'trial_ended' }
  }
  if (ws.status === 'active' || ws.status === 'trialing') return { ok: true, reason: 'active' }
  // Un impago deja unos días de gracia mientras Stripe reintenta el cobro.
  if (ws.status === 'past_due') return { ok: true, reason: 'past_due' }
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
    // Todo el equipo de la agencia entra también en el cliente, con su mismo papel.
    for (const m of membersOf(owner.id)) {
      run('INSERT OR IGNORE INTO members (workspaceId, userId, role, createdAt) VALUES (?, ?, ?, ?)', [id, m.userId, m.role, nowIso()])
    }
    run("INSERT OR IGNORE INTO members (workspaceId, userId, role, createdAt) VALUES (?, ?, 'owner', ?)", [id, userId, nowIso()])
    run('UPDATE users SET currentWorkspaceId = ? WHERE id = ?', [id, userId])
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

export function pendingInvites(workspaceId: number): Invite[] {
  return all<Invite>('SELECT * FROM invites WHERE workspaceId = ? AND acceptedAt IS NULL ORDER BY createdAt DESC', [workspaceId])
}

export function inviteByToken(token: string): Invite | null {
  return one<Invite>('SELECT * FROM invites WHERE token = ?', [token])
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

export function addCompetitor(workspaceId: number, name: string, domain: string, aliases: string[] = []): number | null {
  const clean = name.trim()
  if (!clean) return null
  const exists = competitorsOf(workspaceId).some((c) => key(c.name) === key(clean) || (domain && c.domain === domainKey(domain)))
  if (exists) return null
  return run('INSERT INTO competitors (workspaceId, name, domain, aliases, createdAt) VALUES (?, ?, ?, ?, ?)', [
    workspaceId,
    clean,
    domain ? domainKey(domain) : '',
    JSON.stringify(aliases),
    nowIso(),
  ]).id
}

export function updateCompetitor(workspaceId: number, id: number, name: string, domain: string, aliases: string[]) {
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
    `SELECT * FROM prompts WHERE workspaceId = ? ${onlyActive ? 'AND active = 1' : ''} ORDER BY createdAt ASC, id ASC`,
    [workspaceId],
  ).map((r) => ({ ...r, active: Boolean(r.active) }))
}

export function promptById(workspaceId: number, id: number): Prompt | null {
  const r = one<PromptRow>('SELECT * FROM prompts WHERE id = ? AND workspaceId = ?', [id, workspaceId])
  return r ? { ...r, active: Boolean(r.active) } : null
}

export function activePromptCount(workspaceId: number): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM prompts WHERE workspaceId = ? AND active = 1', [workspaceId])?.n ?? 0
}

export function addPrompt(workspaceId: number, text: string, topic: string, source: 'sugerido' | 'manual'): number | null {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return null
  const dup = one<{ id: number }>('SELECT id FROM prompts WHERE workspaceId = ? AND lower(text) = lower(?)', [workspaceId, clean])
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

export function updatePrompt(workspaceId: number, id: number, text: string, topic: string) {
  run('UPDATE prompts SET text = ?, topic = ? WHERE id = ? AND workspaceId = ?', [text.trim().slice(0, 400), topic.trim().slice(0, 60), id, workspaceId])
}

export function deletePrompt(workspaceId: number, id: number) {
  run('DELETE FROM prompts WHERE id = ? AND workspaceId = ?', [id, workspaceId])
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
