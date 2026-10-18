import Link from 'next/link'
import { Flag, Panel, Section } from '@/components/admin/parts'
import { Logo } from '@/components/Logo'
import { cx, fmtDate, inputClass } from '@/components/ui'
import { isAdmin, requireUser } from '@/lib/auth'
import { all } from '@/lib/db'
import { AGENCY_PROMPTS_MIN, PLANS } from '@/lib/plans'
import * as repo from '@/lib/repo'
import type { Workspace } from '@/lib/types'
import { grantAction, revokeAction } from './actions'

export const metadata = { title: 'Planes a mano' }
export const dynamic = 'force-dynamic'

// Planes dados a mano: buscar a un usuario por su correo y darle (o quitarle) cualquier
// plan sin pasar por Stripe, con fecha de fin o sin ella.

const PAID = ['inicial', 'crecimiento', 'escala', 'agencia'] as const

function state(w: Workspace): string {
  const a = repo.accessOf(w)
  if (w.manualPlan) return a.ok ? `${PLANS[w.plan].nameEs} a mano${w.manualUntil ? ` hasta el ${fmtDate(w.manualUntil, 'es')}` : ', sin fin'}` : `${PLANS[w.plan].nameEs} a mano, terminado`
  if (w.plan === 'trial') return a.ok ? `Prueba (${repo.trialDaysLeft(w)} días)` : 'Prueba terminada'
  if (w.billingOwnerId && w.billingOwnerId !== w.id) return 'Cliente de una agencia'
  return `${PLANS[w.plan]?.nameEs ?? w.plan} de pago (${w.status})`
}

export default async function PlansAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  const user = await requireUser('/admin/planes')
  if (!isAdmin(user)) return <p className="p-10 text-center text-mute">Sin acceso.</p>
  const sp = await searchParams
  const q = (sp.q ?? '').trim().toLowerCase()

  // Usuarios que coinciden (por correo, nombre o dominio de su espacio) y sus espacios propios.
  const users = q
    ? all<{ id: number; email: string; firstName: string; lastName: string; createdAt: string }>(
        `SELECT DISTINCT u.id, u.email, u.firstName, u.lastName, u.createdAt FROM users u
         LEFT JOIN members m ON m.userId = u.id LEFT JOIN workspaces w ON w.id = m.workspaceId
         WHERE lower(u.email) LIKE ? OR lower(u.firstName || ' ' || u.lastName) LIKE ? OR lower(w.domain) LIKE ? OR lower(w.name) LIKE ?
         ORDER BY u.createdAt DESC LIMIT 20`,
        [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`],
      )
    : []
  const found = users.map((u) => ({ ...u, spaces: repo.workspacesOf(u.id).filter((w) => w.role === 'owner') }))
  const manual = repo.allWorkspaces().filter((w) => w.manualPlan)
  const ownerOf = (id: number) => repo.membersOf(id).find((m) => m.role === 'owner')?.email ?? ''

  return (
    <div className="min-h-screen bg-[#f3f5f4]">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Logo href="/dashboard" />
          <span className="h-5 w-px bg-line" />
          <Link href="/admin" className="text-[13px] font-semibold text-mute hover:text-ink">
            Administración
          </Link>
          <span className="text-faint">/</span>
          <span className="text-[13px] font-bold text-ink-2">Planes a mano</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-10 px-4 py-8 sm:px-6">
        {sp.ok && <Flag tone="ok">{sp.ok}</Flag>}
        {sp.error && <Flag tone="bad">{sp.error}</Flag>}

        <Section id="buscar" title="Dar un plan" hint="Busca por correo, nombre, empresa o web. El plan no pasa por Stripe ni se cobra, y no cuenta como ingreso en las estadísticas. Si un día empieza a pagar con tarjeta, Stripe toma el relevo solo.">
          <form className="flex gap-2">
            <input name="q" defaultValue={sp.q ?? ''} placeholder="persona@empresa.com, nombre o empresa.com" className={cx(inputClass, 'h-11')} autoFocus />
            <button className="h-11 shrink-0 rounded-full bg-deep px-6 text-[14px] font-semibold text-white hover:bg-deep-2">Buscar</button>
          </form>

          {q && !found.length && <p className="text-[14px] text-mute">Nadie coincide con «{sp.q}».</p>}

          {found.map((u) => (
            <Panel key={u.id} title={u.email} hint={`${[u.firstName, u.lastName].filter(Boolean).join(' ') || 'Sin nombre'} · cuenta desde el ${fmtDate(u.createdAt, 'es')}`}>
              {!u.spaces.length && <p className="text-[13px] text-mute">Aún no ha creado su espacio: termina el alta y aparecerá aquí.</p>}
              <div className="space-y-4">
                {u.spaces.map((w) => (
                  <div key={w.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-[14px] font-semibold text-ink">
                        {w.name} <span className="font-normal text-mute">{w.domain}</span>
                      </div>
                      <div className="text-[12.5px] font-semibold text-ink-2">{state(w)}</div>
                    </div>
                    {w.billingOwnerId && w.billingOwnerId !== w.id ? (
                      <p className="mt-2 text-[12.5px] text-mute">Su plan es el de la agencia que lo paga.</p>
                    ) : (
                      <form action={grantAction} className="mt-3 grid gap-2 text-[13px] sm:grid-cols-[1fr_1fr_auto]">
                        <input type="hidden" name="workspaceId" value={w.id} />
                        <input type="hidden" name="q" value={sp.q ?? ''} />
                        <label>
                          <span className="font-semibold text-ink-2">Plan</span>
                          <select name="plan" defaultValue={w.plan === 'trial' ? 'crecimiento' : w.plan} className={cx(inputClass, 'mt-1 h-10 text-[14px]')}>
                            {PAID.map((p) => (
                              <option key={p} value={p}>
                                {PLANS[p].nameEs} ({p === 'agencia' ? 'clientes y prompts abajo' : `${PLANS[p].prompts} prompts`})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="font-semibold text-ink-2">Hasta (vacío = sin fin)</span>
                          <input type="date" name="until" defaultValue={w.manualUntil ? w.manualUntil.slice(0, 10) : ''} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                        </label>
                        <div className="flex items-end">
                          <button className="h-10 w-full rounded-full bg-deep px-5 text-[14px] font-semibold text-white hover:bg-deep-2">{w.manualPlan ? 'Cambiar' : 'Dar plan'}</button>
                        </div>
                        <label>
                          <span className="font-semibold text-ink-2">Agencia: clientes</span>
                          <input type="number" name="seats" min={1} max={100} defaultValue={w.plan === 'agencia' ? w.seats : 5} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                        </label>
                        <label>
                          <span className="font-semibold text-ink-2">Agencia: prompts en total</span>
                          <input type="number" name="prompts" min={AGENCY_PROMPTS_MIN} step={10} defaultValue={w.plan === 'agencia' && w.promptPool ? w.promptPool : 100} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                        </label>
                        <div />
                        <label className="sm:col-span-2">
                          <span className="font-semibold text-ink-2">Nota interna (por qué)</span>
                          <input name="note" defaultValue={w.manualNote ?? ''} placeholder="Socio, cliente de Vértigo, prueba ampliada…" className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                        </label>
                        <label className="flex items-end gap-2 pb-2">
                          <input type="checkbox" name="notify" defaultChecked={!w.manualPlan} />
                          <span className="text-ink-2">Avisarle por correo</span>
                        </label>
                      </form>
                    )}
                    {w.manualPlan && (
                      <form action={revokeAction} className="mt-2">
                        <input type="hidden" name="workspaceId" value={w.id} />
                        <input type="hidden" name="q" value={sp.q ?? ''} />
                        <button className="text-[12.5px] font-semibold text-bad hover:underline">Quitar el plan</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </Section>

        <Section id="activos" title="Planes dados a mano" hint="Todos los espacios con un plan sin cobro, activos o ya terminados.">
          <Panel pad={false}>
            {manual.length ? (
              <ul className="divide-y divide-line-2">
                {manual.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">
                        {w.name} <span className="font-normal text-mute">· {ownerOf(w.id)}</span>
                      </div>
                      <div className="text-[12px] text-mute">
                        {state(w)}
                        {w.plan === 'agencia' ? ` · ${w.seats} clientes, ${w.promptPool} prompts` : ''}
                        {w.manualNote ? ` · ${w.manualNote}` : ''}
                      </div>
                    </div>
                    <Link href={`/admin/planes?q=${encodeURIComponent(ownerOf(w.id))}`} className="shrink-0 font-semibold text-brand hover:underline">
                      Cambiar
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-[13px] text-mute">Todavía no hay ninguno.</p>
            )}
          </Panel>
        </Section>
      </main>
    </div>
  )
}
