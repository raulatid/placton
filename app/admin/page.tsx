import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { Badge, Card, CardHeader, fmtDate } from '@/components/ui'
import { isAdminEmail, requireUser } from '@/lib/auth'
import { addDays, all, one, today } from '@/lib/db'
import { platforms } from '@/lib/engines'
import { apiCost } from '@/lib/metrics'
import { euros, PLANS, priceFor } from '@/lib/plans'
import { usd } from '@/lib/pricing'
import * as repo from '@/lib/repo'
import { stripeMode } from '@/lib/stripe'

export const metadata = { title: 'Administración' }
export const dynamic = 'force-dynamic'

// Panel interno: clientes, ingresos recurrentes, coste de API y margen.
export default async function AdminPage() {
  const user = await requireUser()
  if (!isAdminEmail(user.email)) notFound()
  const to = today()
  const from30 = addDays(to, -29)
  const spaces = repo.allWorkspaces()
  const users = one<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0
  const paying = spaces.filter((w) => w.plan !== 'trial' && (w.status === 'active' || w.status === 'past_due'))
  const trials = spaces.filter((w) => w.plan === 'trial' && repo.accessOf(w).ok)
  const mrr = paying.reduce((s, w) => s + (w.billingInterval === 'year' ? priceFor(w.plan as 'inicial', 'year') / 12 : priceFor(w.plan as 'inicial', 'month')), 0)
  const cost30 = apiCost(null, from30, to)
  const byPlatform = all<{ engine: string; n: number; c: number }>('SELECT engine, COUNT(*) AS n, SUM(costUsd) AS c FROM answers WHERE day BETWEEN ? AND ? GROUP BY engine', [from30, to])
  const errors = all<{ engine: string; n: number; last: string }>(
    'SELECT engine, COUNT(*) AS n, MAX(error) AS last FROM answers WHERE error IS NOT NULL AND day BETWEEN ? AND ? GROUP BY engine',
    [addDays(to, -6), to],
  )
  const contacts = all<{ id: number; name: string; email: string; topic: string; message: string; createdAt: string }>('SELECT * FROM contact_messages ORDER BY createdAt DESC LIMIT 20')
  const revenue30 = (one<{ s: number }>("SELECT COALESCE(SUM(amount), 0) AS s FROM billing_events WHERE type = 'invoice.paid' AND createdAt >= ?", [`${from30}T00:00:00Z`])?.s ?? 0) / 100

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <Logo href="/dashboard" />
        <div className="flex items-center gap-3 text-[13px]">
          <Badge tone={stripeMode() === 'live' ? 'good' : 'warn'}>Stripe {stripeMode()}</Badge>
          <Link href="/dashboard" className="font-semibold text-brand">
            Volver al panel
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] space-y-4 px-6 py-8">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">Administración</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { l: 'Usuarios', v: users.toLocaleString('es-ES') },
            { l: 'Espacios', v: spaces.length.toLocaleString('es-ES') },
            { l: 'En prueba', v: trials.length.toLocaleString('es-ES') },
            { l: 'De pago', v: paying.length.toLocaleString('es-ES') },
            { l: 'Ingreso mensual recurrente', v: euros(Math.round(mrr * 100) / 100) },
            { l: 'Coste API 30 días', v: usd(cost30) },
          ].map((s) => (
            <div key={s.l} className="card p-4">
              <div className="text-[12px] font-semibold text-mute">{s.l}</div>
              <div className="mt-1 text-[22px] font-extrabold num">{s.v}</div>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-mute">Cobrado en los últimos 30 días según Stripe: {euros(revenue30)}. El coste de API es una estimación con las tarifas de lib/pricing.ts.</p>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Plataformas (30 días)" />
            <table className="w-full text-sm">
              <tbody>
                {platforms().map((p) => {
                  const r = byPlatform.find((b) => b.engine === p.id)
                  return (
                    <tr key={p.id} className="border-t border-line-2">
                      <td className="py-2.5 pl-5 font-semibold">{p.name}</td>
                      <td className="py-2.5">{p.available ? <Badge tone="good">Activa · {p.model}</Badge> : <Badge>Falta {p.missing}</Badge>}</td>
                      <td className="py-2.5 text-right num">{r?.n ?? 0} resp.</td>
                      <td className="py-2.5 pr-5 text-right num">{usd(r?.c ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
          <Card>
            <CardHeader title="Errores de la última semana" />
            {errors.length ? (
              <ul className="divide-y divide-line-2 border-t border-line-2 text-sm">
                {errors.map((e) => (
                  <li key={e.engine} className="px-5 py-2.5">
                    <div className="font-semibold">
                      {e.engine}: {e.n}
                    </div>
                    <div className="truncate text-[12px] text-mute">{e.last}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-mute">Sin errores.</p>
            )}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader title="Espacios" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-y border-line-2 bg-[#fafcfb] text-left text-[12px] font-semibold text-mute">
                  <th className="py-2.5 pl-5">Espacio</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th className="text-right">Prompts</th>
                  <th className="text-right">Miembros</th>
                  <th className="text-right">Ingreso/mes</th>
                  <th className="text-right">API 30 d</th>
                  <th className="pr-5 text-right">Alta</th>
                </tr>
              </thead>
              <tbody>
                {spaces.map((w) => {
                  const income = w.plan === 'trial' || !(w.status === 'active' || w.status === 'past_due') ? 0 : w.billingInterval === 'year' ? priceFor(w.plan, 'year') / 12 : priceFor(w.plan, 'month')
                  const cost = apiCost(w.id, from30, to)
                  return (
                    <tr key={w.id} className="border-b border-line-2">
                      <td className="py-2.5 pl-5">
                        <div className="font-semibold">{w.name}</div>
                        <div className="text-[12px] text-mute">{w.domain}</div>
                      </td>
                      <td>{PLANS[w.plan].name}</td>
                      <td>{w.plan === 'trial' ? (repo.accessOf(w).ok ? `Prueba, ${repo.trialDaysLeft(w)} d` : 'Prueba terminada') : w.status}</td>
                      <td className="text-right num">{repo.activePromptCount(w.id)}</td>
                      <td className="text-right num">{repo.membersOf(w.id).length}</td>
                      <td className="text-right num">{euros(Math.round(income * 100) / 100)}</td>
                      <td className="text-right num">{usd(cost)}</td>
                      <td className="pr-5 text-right text-[12px] text-mute">{fmtDate(w.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Mensajes de contacto" />
          {contacts.length ? (
            <ul className="divide-y divide-line-2 border-t border-line-2">
              {contacts.map((c) => (
                <li key={c.id} className="px-5 py-3 text-sm">
                  <div className="font-semibold">
                    {c.name} · {c.email} <Badge>{c.topic}</Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-ink-2">{c.message}</p>
                  <div className="mt-1 text-[12px] text-mute">{fmtDate(c.createdAt)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-mute">Sin mensajes.</p>
          )}
        </Card>
      </main>
    </div>
  )
}
