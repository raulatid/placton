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
  // Margen estimado del mes: ingresos recurrentes menos API (30 días) y Stripe (~5 % + 0,30 $ por cobro).
  const stripeFees = paying.length * 0.3 + mrr * 0.05
  const margin = mrr > 0 ? ((mrr - cost30 - stripeFees) / mrr) * 100 : null
  // Analítica propia (sin cookies): visitas de la web pública y del alta.
  const visits = all<{ day: string; v: number; p: number }>(
    'SELECT day, COUNT(DISTINCT visitor) AS v, COUNT(*) AS p FROM page_views WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day',
    [from30, to],
  )
  const visitors30 = one<{ n: number }>('SELECT COUNT(DISTINCT visitor) AS n FROM page_views WHERE day BETWEEN ? AND ?', [from30, to])?.n ?? 0
  const topPages = all<{ path: string; n: number }>('SELECT path, COUNT(*) AS n FROM page_views WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY n DESC LIMIT 8', [from30, to])
  const topRefs = all<{ ref: string; n: number }>(
    "SELECT CASE WHEN utmSource <> '' THEN 'utm: ' || utmSource WHEN refHost <> '' THEN refHost ELSE 'Directo' END AS ref, COUNT(DISTINCT visitor) AS n FROM page_views WHERE day BETWEEN ? AND ? GROUP BY ref ORDER BY n DESC LIMIT 8",
    [from30, to],
  )
  const signups30 = one<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE createdAt >= ?', [`${from30}T00:00:00Z`])?.n ?? 0
  const everTrial = spaces.filter((w) => w.onboarded && !w.billingOwnerId).length
  const conversion = everTrial ? (paying.filter((w) => !w.billingOwnerId).length / everTrial) * 100 : 0
  const signupsByDay = new Map(all<{ day: string; n: number }>("SELECT substr(createdAt, 1, 10) AS day, COUNT(*) AS n FROM users WHERE createdAt >= ? GROUP BY day", [`${from30}T00:00:00Z`]).map((r) => [r.day, r.n]))
  const days: string[] = []
  for (let d = from30; d <= to; d = addDays(d, 1)) days.push(d)
  const maxV = Math.max(1, ...visits.map((v) => v.v), ...[...signupsByDay.values()])
  const serverErrors = all<{ message: string; path: string; n: number; last: string }>(
    'SELECT message, path, COUNT(*) AS n, MAX(createdAt) AS last FROM error_log WHERE createdAt >= ? GROUP BY signature ORDER BY last DESC LIMIT 10',
    [`${addDays(to, -6)}T00:00:00Z`],
  )
  const emails = all<{ toEmail: string; subject: string; kind: string; sent: number; error: string | null; createdAt: string }>('SELECT * FROM email_log ORDER BY id DESC LIMIT 15')

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
            { l: 'Margen estimado', v: margin === null ? 'Sin ingresos' : `${Math.round(margin)} %` },
            { l: 'Visitantes 30 días', v: visitors30.toLocaleString('es-ES') },
            { l: 'Altas 30 días', v: signups30.toLocaleString('es-ES') },
            { l: 'Prueba → pago', v: `${conversion.toFixed(1).replace('.', ',')} %` },
            { l: 'Cobrado 30 días', v: euros(revenue30) },
            { l: 'Medición', v: 'Semanal' },
          ].map((s) => (
            <div key={s.l} className="card p-4">
              <div className="text-[12px] font-semibold text-mute">{s.l}</div>
              <div className="mt-1 text-[22px] font-extrabold num">{s.v}</div>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-mute">
          El margen descuenta el coste de API de 30 días y una comisión de Stripe estimada (5 % + 0,30 $ por cobro). Copias de seguridad del disco: diaria y
          semanal en Railway.
        </p>

        <Card>
          <CardHeader title="Visitantes y altas (30 días)" hint="Barras: visitantes únicos por día. Punto: altas de ese día." />
          <div className="flex h-40 items-end gap-1 px-5 pb-5">
            {days.map((d) => {
              const v = visits.find((x) => x.day === d)?.v ?? 0
              const sgn = signupsByDay.get(d) ?? 0
              return (
                <div key={d} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d}: ${v} visitantes, ${sgn} altas`}>
                  <div className="rounded-t-[3px] bg-[#00a38c]" style={{ height: `${(v / maxV) * 100}%`, minHeight: v ? 2 : 0 }} />
                  {sgn > 0 && <span className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#eb6834]" style={{ bottom: `calc(${(sgn / maxV) * 100}% - 4px)` }} />}
                </div>
              )
            })}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Páginas más vistas" />
            <ul className="divide-y divide-line-2 border-t border-line-2 text-sm">
              {topPages.length ? topPages.map((p) => (
                <li key={p.path} className="flex justify-between px-5 py-2"><span className="truncate font-mono text-[12.5px]">{p.path}</span><span className="num">{p.n}</span></li>
              )) : <li className="px-5 py-3 text-mute">Todavía sin visitas.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="De dónde vienen" />
            <ul className="divide-y divide-line-2 border-t border-line-2 text-sm">
              {topRefs.length ? topRefs.map((r) => (
                <li key={r.ref} className="flex justify-between px-5 py-2"><span className="truncate">{r.ref}</span><span className="num">{r.n}</span></li>
              )) : <li className="px-5 py-3 text-mute">Todavía sin visitas.</li>}
            </ul>
          </Card>
        </div>

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
                  const income = w.billingOwnerId ? 0 : w.plan === 'trial' || !(w.status === 'active' || w.status === 'past_due') ? 0 : w.billingInterval === 'year' ? priceFor(w.plan, 'year') / 12 : priceFor(w.plan, 'month')
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

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Errores del servidor (7 días)" hint="Cada error nuevo se avisa por correo, como mucho una vez por hora." />
            {serverErrors.length ? (
              <ul className="divide-y divide-line-2 border-t border-line-2 text-sm">
                {serverErrors.map((e) => (
                  <li key={e.last + e.message} className="px-5 py-2.5">
                    <div className="truncate font-semibold">{e.message}</div>
                    <div className="text-[12px] text-mute">{e.path || 'servidor'} · {e.n} veces · último {fmtDate(e.last)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-mute">Sin errores.</p>
            )}
          </Card>
          <Card>
            <CardHeader title="Últimos correos enviados" />
            <ul className="divide-y divide-line-2 border-t border-line-2 text-sm">
              {emails.length ? emails.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{m.subject}</div>
                    <div className="truncate text-[12px] text-mute">{m.toEmail} · {m.kind} · {fmtDate(m.createdAt)}</div>
                  </div>
                  {m.sent ? <Badge tone="good">Enviado</Badge> : <Badge tone="bad">{m.error ? 'Error' : 'Sin enviar'}</Badge>}
                </li>
              )) : <li className="px-5 py-3 text-mute">Ninguno todavía.</li>}
            </ul>
          </Card>
        </div>

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
