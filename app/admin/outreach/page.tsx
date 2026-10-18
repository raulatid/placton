import Link from 'next/link'
import { Columns } from '@/components/admin/Columns'
import { int, percent } from '@/components/admin/format'
import { Flag, Funnel, Kpi, Panel, Section, TEAL } from '@/components/admin/parts'
import { Logo } from '@/components/Logo'
import { cx, inputClass, textareaClass } from '@/components/ui'
import { isAdmin, requireUser } from '@/lib/auth'
import { all, one } from '@/lib/db'
import { outreachGoogleReady, outreachRedirectUri } from '@/lib/outreach/gmail'
import { capFor, inWindow, sentLast24h, settings, type Mailbox } from '@/lib/outreach/engine'
import { mailboxAction, settingsAction, suppressAction, testAction, toggleRunningAction } from './actions'

export const metadata = { title: 'Campaña de correo' }
export const dynamic = 'force-dynamic'

// Panel de la campaña de captación por correo: buzones y su calentamiento,
// envíos, respuestas, rebotes, bajas y el embudo hasta la prueba y el pago.

const AUDIENCE: Record<string, string> = { agency: 'Agencias', local: 'Negocios locales', saas: 'Software', ecommerce: 'Tiendas online', b2b: 'Servicios B2B' }
const STATUS: Record<string, string> = {
  pending: 'En cola',
  sending: 'Enviando',
  active: 'En secuencia',
  done: 'Secuencia terminada',
  replied: 'Han respondido',
  signed_up: 'Se han registrado',
  bounced: 'Rebotados',
  unsubscribed: 'Bajas',
  failed: 'Fallidos',
  skipped: 'Descartados',
}
const DAY_NAMES = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D']

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser('/admin/outreach')
  if (!isAdmin(user)) return <p className="p-10 text-center text-mute">Sin acceso.</p>
  const sp = await searchParams
  const s = settings()
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const boxes = all<Mailbox>('SELECT * FROM outreach_mailboxes ORDER BY createdAt').map((b) => ({
    ...b,
    cap: capFor(b, s),
    sent24: sentLast24h(b.email),
    total: one<{ n: number }>('SELECT COUNT(*) AS n FROM outreach_messages WHERE mailbox = ? AND error IS NULL', [b.email])?.n ?? 0,
    sent7: one<{ n: number }>('SELECT COUNT(*) AS n FROM outreach_messages WHERE mailbox = ? AND error IS NULL AND sentAt > ?', [b.email, since7])?.n ?? 0,
    bounces7: one<{ n: number }>("SELECT COUNT(*) AS n FROM outreach_events WHERE mailbox = ? AND kind = 'bounce' AND createdAt > ?", [b.email, since7])?.n ?? 0,
    replies: one<{ n: number }>("SELECT COUNT(DISTINCT contactId) AS n FROM outreach_events WHERE mailbox = ? AND kind = 'reply'", [b.email])?.n ?? 0,
  }))
  const byStatus = Object.fromEntries(all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outreach_contacts GROUP BY status').map((r) => [r.status, r.n]))
  const totalContacts = Object.values(byStatus).reduce((a, n) => a + n, 0)
  const funnel = all<{ audience: string; total: number; contacted: number; replied: number; signed: number; paid: number }>(
    `SELECT audience, COUNT(*) AS total, SUM(step > 0) AS contacted, SUM(repliedAt IS NOT NULL) AS replied,
       SUM(signedUpAt IS NOT NULL AND step > 0) AS signed, SUM(paidAt IS NOT NULL AND step > 0) AS paid
     FROM outreach_contacts GROUP BY audience ORDER BY total DESC`,
  )
  const sum = (k: 'contacted' | 'replied' | 'signed' | 'paid') => funnel.reduce((a, r) => a + (r[k] ?? 0), 0)
  const sentTotal = one<{ n: number }>('SELECT COUNT(*) AS n FROM outreach_messages WHERE error IS NULL')?.n ?? 0
  const bounces = one<{ n: number }>("SELECT COUNT(*) AS n FROM outreach_events WHERE kind = 'bounce'")?.n ?? 0
  const unsubs = one<{ n: number }>("SELECT COUNT(DISTINCT contactId) AS n FROM outreach_events WHERE kind = 'unsubscribe'")?.n ?? 0
  const blocks = one<{ n: number }>("SELECT COUNT(*) AS n FROM outreach_events WHERE kind = 'block'")?.n ?? 0
  const bySegment = all<{ audience: string; hook: string; contacted: number; replied: number; signed: number }>(
    `SELECT audience, hook, SUM(step > 0) AS contacted, SUM(repliedAt IS NOT NULL) AS replied, SUM(signedUpAt IS NOT NULL AND step > 0) AS signed
     FROM outreach_contacts GROUP BY audience, hook HAVING contacted > 0 ORDER BY contacted DESC`,
  )
  const byStep = all<{ step: number; n: number }>('SELECT step, COUNT(*) AS n FROM outreach_messages WHERE error IS NULL GROUP BY step ORDER BY step')
  const repliesByStep = all<{ step: number; n: number }>(
    `SELECT c.step AS step, COUNT(*) AS n FROM outreach_contacts c WHERE c.repliedAt IS NOT NULL GROUP BY c.step ORDER BY c.step`,
  )
  const days = all<{ day: string; n: number }>("SELECT substr(sentAt, 1, 10) AS day, COUNT(*) AS n FROM outreach_messages WHERE error IS NULL AND sentAt > ? GROUP BY day ORDER BY day", [
    new Date(Date.now() - 30 * 86_400_000).toISOString(),
  ])
  const replies = all<{ id: number; fromEmail: string; subject: string; snippet: string; threadId: string; mailbox: string; createdAt: string; company: string; domain: string; audience: string }>(
    `SELECT e.id, e.fromEmail, e.subject, e.snippet, e.threadId, e.mailbox, e.createdAt, c.company, c.domain, c.audience
     FROM outreach_events e LEFT JOIN outreach_contacts c ON c.id = e.contactId WHERE e.kind = 'reply' ORDER BY e.createdAt DESC LIMIT 25`,
  )
  const problems = all<{ id: number; kind: string; fromEmail: string; subject: string; snippet: string; createdAt: string; email: string }>(
    `SELECT e.id, e.kind, e.fromEmail, e.subject, e.snippet, e.createdAt, c.email FROM outreach_events e LEFT JOIN outreach_contacts c ON c.id = e.contactId
     WHERE e.kind IN ('bounce', 'block', 'unsubscribe') ORDER BY e.createdAt DESC LIMIT 15`,
  )
  const errors = all<{ mailbox: string; error: string; sentAt: string }>('SELECT mailbox, error, sentAt FROM outreach_messages WHERE error IS NOT NULL ORDER BY id DESC LIMIT 6')

  const capToday = boxes.filter((b) => !b.paused).reduce((a, b) => a + b.cap, 0)
  const zones = all<{ tz: string; n: number }>("SELECT tz, COUNT(*) AS n FROM outreach_contacts WHERE status = 'pending' GROUP BY tz ORDER BY n DESC")
  const openNow = zones.filter((z) => inWindow(z.tz, s)).reduce((a, z) => a + z.n, 0)
  const avgSteps = one<{ n: number }>('SELECT AVG(json_array_length(steps)) AS n FROM outreach_contacts')?.n ?? 3
  const pendingSends = (byStatus.pending ?? 0) * avgSteps + (one<{ n: number }>("SELECT SUM(json_array_length(steps) - step) AS n FROM outreach_contacts WHERE status = 'active'")?.n ?? 0)
  const fullCap = boxes.filter((b) => !b.paused).length * (s.ramp[s.ramp.length - 1] ?? 0) * (s.days.length / 7)
  const weeks = fullCap ? Math.ceil(pendingSends / fullCap / 7) : null

  const steps = [
    { done: outreachGoogleReady(), label: 'Acceso de Google con la API de Gmail', hint: `Mismo cliente que el acceso de Placton (proyecto «placton» de Google Cloud), con la API de Gmail activada. Vuelta: ${outreachRedirectUri()}` },
    { done: boxes.length > 0, label: 'Buzones conectados', hint: boxes.length ? `${boxes.length} conectados.` : 'Conecta al menos uno con el botón de abajo.' },
    { done: totalContacts > 0, label: 'Contactos importados', hint: totalContacts ? `${int(totalContacts)} contactos.` : 'Se cargan desde placton-outreach (sender/importar.mjs).' },
    { done: s.running, label: 'Campaña en marcha', hint: s.running ? 'Enviando en horario laboral de cada destinatario.' : 'Parada: no sale ningún correo.' },
  ]

  return (
    <div className="min-h-screen bg-[#f3f5f4]">
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/dashboard" />
            <span className="h-5 w-px bg-line" />
            <Link href="/admin" className="text-[13px] font-semibold text-mute hover:text-ink">
              Administración
            </Link>
            <span className="text-faint">/</span>
            <span className="text-[13px] font-bold text-ink-2">Campaña de correo</span>
          </div>
          <form action={toggleRunningAction}>
            <button className={cx('h-10 rounded-full px-5 text-[14px] font-semibold', s.running ? 'border border-line bg-white text-ink-2 hover:border-faint' : 'bg-deep text-white hover:bg-deep-2')}>
              {s.running ? 'Parar la campaña' : 'Poner en marcha'}
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] space-y-12 px-4 py-8 sm:px-6">
        {sp.ok && <Flag tone="ok">{sp.ok}</Flag>}
        {sp.error && <Flag tone="bad">{sp.error}</Flag>}

        <Section id="resumen" title="Resumen" hint="Del primer correo al pago. Una respuesta, un rebote o una baja paran la secuencia de esa empresa.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi big label="Empresas contactadas" value={int(sum('contacted'))} foot={`${int(sentTotal)} correos enviados`} />
            <Kpi big label="Tasa de respuesta" value={sum('contacted') ? percent(sum('replied') / sum('contacted')) : 'Sin envíos'} foot={`${int(sum('replied'))} respuestas`} />
            <Kpi big label="Pruebas gratis" value={int(sum('signed'))} foot={sum('contacted') ? `${percent(sum('signed') / sum('contacted'), 2)} de las contactadas` : 'Por dominio de la cuenta o del espacio'} />
            <Kpi big label="Clientes de pago" value={int(sum('paid'))} foot={sum('signed') ? `${percent(sum('paid') / sum('signed'))} de las pruebas` : 'Aún sin pruebas'} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Rebotes" value={sentTotal ? percent(bounces / sentTotal) : 'Sin envíos'} info={`Por encima del ${percent(s.maxBounce)} en 7 días, el buzón se para solo.`} foot={`${int(bounces)} en total · ${int(blocks)} rechazos por spam`} />
            <Kpi label="Bajas" value={sum('contacted') ? percent(unsubs / sum('contacted')) : 'Sin envíos'} foot={`${int(unsubs)} empresas`} />
            <Kpi label="Capacidad hoy" value={`${int(capToday)} correos`} info="Suma del tope de calentamiento de los buzones activos." foot={`${int(openNow)} contactos en horario laboral ahora`} />
            <Kpi label="Para acabar la lista" value={weeks === null ? 'Sin buzones' : `${int(weeks)} semanas`} info="Correos que faltan (pendientes × pasos de la secuencia) entre la capacidad con todos los buzones ya calentados." foot={`${int(Math.round(pendingSends))} correos por enviar`} />
          </div>
        </Section>

        <Section id="puesta" title="Puesta en marcha">
          <Panel>
            <ol className="space-y-3">
              {steps.map((st, i) => (
                <li key={st.label} className="flex items-start gap-3">
                  <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold', st.done ? 'bg-[#e6f6f2] text-[#00806d]' : 'bg-line-2 text-mute')}>{st.done ? '✓' : i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink">{st.label}</div>
                    <div className="break-words text-[12.5px] text-mute">{st.hint}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </Section>

        <Section
          id="buzones"
          title="Buzones"
          hint="Cada buzón sube su tope semana a semana desde que se conecta. Los seguimientos salen siempre del mismo buzón que el primer correo."
          right={
            <form action="/api/admin/outreach/connect" className="flex flex-wrap items-center gap-2">
              <input name="name" placeholder="Nombre del remitente (Raúl Díaz (Placton))" className={cx(inputClass, 'h-10 w-60 text-[14px]')} />
              <button className="h-10 rounded-full bg-deep px-5 text-[14px] font-semibold text-white hover:bg-deep-2">Conectar buzón</button>
            </form>
          }
        >
          <Panel pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">
                    <th className="py-2.5 pl-5 text-left">Buzón</th>
                    <th className="py-2.5 text-right">Hoy</th>
                    <th className="py-2.5 text-right">Total</th>
                    <th className="py-2.5 text-right">Rebotes 7 días</th>
                    <th className="py-2.5 text-right">Respuestas</th>
                    <th className="py-2.5 pl-4 text-left">Estado</th>
                    <th className="py-2.5 pr-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((b) => (
                    <tr key={b.email} className="border-b border-line-2 align-top last:border-0">
                      <td className="py-3 pl-5">
                        <div className="font-semibold text-ink">{b.email}</div>
                        <form action={mailboxAction} className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-mute">
                          <input type="hidden" name="email" value={b.email} />
                          <input type="hidden" name="op" value="edit" />
                          <input name="name" defaultValue={b.name} className="h-7 w-32 rounded-lg border border-line px-2 text-[12px]" aria-label="Nombre del remitente" />
                          <span>calentando desde</span>
                          <input type="date" name="warmupFrom" defaultValue={b.warmupFrom.slice(0, 10)} className="h-7 rounded-lg border border-line px-2 text-[12px]" aria-label="Inicio del calentamiento" />
                          <button className="h-7 rounded-lg border border-line bg-white px-2 font-semibold text-ink-2 hover:border-faint">Guardar</button>
                        </form>
                      </td>
                      <td className="py-3 text-right num">
                        {int(b.sent24)} / {int(b.cap)}
                      </td>
                      <td className="py-3 text-right num">{int(b.total)}</td>
                      <td className={cx('py-3 text-right num', b.sent7 >= 20 && b.bounces7 / b.sent7 > s.maxBounce && 'font-semibold text-bad')}>
                        {b.sent7 ? percent(b.bounces7 / b.sent7) : 'Sin envíos'}
                      </td>
                      <td className="py-3 text-right num">{int(b.replies)}</td>
                      <td className="max-w-[260px] py-3 pl-4 text-[12px]">
                        {b.paused ? <span className="font-semibold text-bad">Parado</span> : <span className="font-semibold text-[#00806d]">Activo</span>}
                        {(b.pausedReason || b.lastError) && <div className="mt-0.5 text-mute">{b.pausedReason || b.lastError}</div>}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <form action={mailboxAction}>
                            <input type="hidden" name="email" value={b.email} />
                            <input type="hidden" name="op" value={b.paused ? 'resume' : 'pause'} />
                            <button className="h-8 rounded-full border border-line bg-white px-3 text-[12px] font-semibold text-ink-2 hover:border-faint">{b.paused ? 'Reanudar' : 'Parar'}</button>
                          </form>
                          <a href={`/api/admin/outreach/connect?hint=${encodeURIComponent(b.email)}`} className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-[12px] font-semibold text-ink-2 hover:border-faint">
                            Reconectar
                          </a>
                          <form action={mailboxAction}>
                            <input type="hidden" name="email" value={b.email} />
                            <input type="hidden" name="op" value="remove" />
                            <button className="h-8 rounded-full border border-line bg-white px-3 text-[12px] font-semibold text-bad hover:border-faint">Quitar</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!boxes.length && (
                    <tr>
                      <td colSpan={7} className="px-5 py-6 text-center text-mute">
                        Ningún buzón conectado todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          {errors.length > 0 && (
            <Panel title="Últimos fallos de envío" pad={false}>
              <ul className="divide-y divide-line-2">
                {errors.map((e, i) => (
                  <li key={i} className="px-5 py-2.5 text-[12.5px]">
                    <span className="font-semibold text-ink">{e.mailbox}</span> <span className="text-mute">{new Date(e.sentAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</span>
                    <div className="text-bad">{e.error}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </Section>

        <Section id="resultados" title="Resultados">
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Embudo" hint="Contactadas, respuestas, pruebas (por dominio) y pagos.">
              <Funnel
                steps={[
                  { label: 'Contactadas', n: sum('contacted'), hint: 'Empresas que han recibido al menos un correo.' },
                  { label: 'Han respondido', n: sum('replied'), hint: 'Cualquier respuesta escrita por una persona (las bajas no cuentan).' },
                  { label: 'Prueba gratis', n: sum('signed'), hint: 'Se registraron en Placton con un correo o una web de su dominio.' },
                  { label: 'De pago', n: sum('paid'), hint: 'Su espacio (o su agencia) tiene suscripción.' },
                ]}
              />
            </Panel>
            <Panel title="Correos al día" hint="Últimos 30 días.">
              <Columns labels={days.map((d) => d.day.slice(5))} bars={[{ name: 'Enviados', color: TEAL, values: days.map((d) => d.n) }]} empty="Todavía no ha salido ningún correo." />
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Por público" pad={false} className="xl:col-span-2">
              <SimpleTable
                head={['Público', 'Contactos', 'Contactadas', 'Respuesta', 'Prueba', 'Pago']}
                rows={funnel.map((r) => [
                  AUDIENCE[r.audience] ?? r.audience,
                  int(r.total),
                  int(r.contacted),
                  r.contacted ? percent(r.replied / r.contacted) : 'Sin envíos',
                  r.contacted ? `${int(r.signed)} (${percent(r.signed / r.contacted, 2)})` : 'Sin envíos',
                  int(r.paid),
                ])}
              />
              {bySegment.length > 0 && (
                <SimpleTable
                  head={['Público y gancho', 'Contactadas', 'Respuesta', 'Prueba']}
                  rows={bySegment.map((r) => [
                    `${AUDIENCE[r.audience] ?? r.audience} · ${r.hook === 'named' ? 'la IA la nombra' : r.hook === 'not-named' ? 'la IA no la nombra' : 'genérico'}`,
                    int(r.contacted),
                    percent(r.replied / r.contacted),
                    percent(r.signed / r.contacted, 2),
                  ])}
                />
              )}
            </Panel>
            <Panel title="Estado de los contactos" pad={false}>
              <ul className="divide-y divide-line-2">
                {Object.entries(STATUS).map(([k, label]) => (
                  <li key={k} className="flex justify-between px-5 py-2 text-[13px]">
                    <span className="text-ink-2">{label}</span>
                    <span className="font-semibold num text-ink">{int(byStatus[k] ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-3 text-[12px] text-mute">
                Envíos por paso: {byStep.map((r) => `${r.step + 1}.º ${int(r.n)}`).join(' · ') || 'ninguno'}. Respuestas tras el paso: {repliesByStep.map((r) => `${r.step}.º ${int(r.n)}`).join(' · ') || 'ninguna'}.
              </div>
            </Panel>
          </div>
        </Section>

        <Section id="respuestas" title="Respuestas" hint="Contesta desde el propio buzón: el enlace abre el hilo en Gmail. Cada respuesta también te llega por correo.">
          <Panel pad={false}>
            {replies.length ? (
              <ul className="divide-y divide-line-2">
                {replies.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">
                        {r.company || r.domain} <span className="font-normal text-mute">· {r.fromEmail} · {AUDIENCE[r.audience] ?? r.audience}</span>
                      </span>
                      <a href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(r.mailbox)}#all/${r.threadId}`} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold text-brand hover:underline">
                        Abrir en Gmail
                      </a>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.snippet}</p>
                    <div className="mt-1 text-[11.5px] text-faint">{new Date(r.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-[13px] text-mute">Todavía no ha respondido nadie.</p>
            )}
          </Panel>
          <Panel title="Rebotes y bajas" pad={false}>
            {problems.length ? (
              <ul className="divide-y divide-line-2">
                {problems.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 px-5 py-2.5 text-[12.5px]">
                    <span className="truncate text-ink-2">
                      <b className={p.kind === 'unsubscribe' ? 'text-ink' : 'text-bad'}>{p.kind === 'bounce' ? 'Rebote' : p.kind === 'block' ? 'Rechazo por spam' : 'Baja'}</b> · {p.email ?? p.fromEmail}
                      {p.kind === 'unsubscribe' && p.snippet && <span className="text-mute"> · «{p.snippet.slice(0, 120)}»</span>}
                    </span>
                    <span className="shrink-0 text-faint">{new Date(p.createdAt).toLocaleDateString('es-ES')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-[13px] text-mute">Ni rebotes ni bajas.</p>
            )}
          </Panel>
        </Section>

        <Section id="ajustes" title="Ajustes y pruebas">
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Ritmo de envío" hint="El tope de cada buzón sube por semanas desde que empezó a calentar; la última cifra se mantiene.">
              <form action={settingsAction} className="grid gap-3 text-[13px] sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="font-semibold text-ink-2">Envíos al día por buzón, semana a semana</span>
                  <input name="ramp" defaultValue={s.ramp.join(', ')} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                </label>
                <label>
                  <span className="font-semibold text-ink-2">Días (1 = lunes)</span>
                  <input name="days" defaultValue={s.days.join(', ')} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                  <span className="text-[11.5px] text-faint">Ahora: {s.days.map((d) => DAY_NAMES[d]).join(' ')}</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="font-semibold text-ink-2">Desde (hora local)</span>
                    <input name="fromHour" type="number" min={0} max={23} defaultValue={s.fromHour} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                  </label>
                  <label>
                    <span className="font-semibold text-ink-2">Hasta</span>
                    <input name="toHour" type="number" min={1} max={24} defaultValue={s.toHour} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="font-semibold text-ink-2">Hueco mínimo (min)</span>
                    <input name="gapMin" type="number" min={1} defaultValue={s.gapMin} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                  </label>
                  <label>
                    <span className="font-semibold text-ink-2">Máximo</span>
                    <input name="gapMax" type="number" min={1} defaultValue={s.gapMax} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                  </label>
                </div>
                <label>
                  <span className="font-semibold text-ink-2">Tope de rebotes (%)</span>
                  <input name="maxBounce" type="number" step="0.1" min={0.1} max={20} defaultValue={+(s.maxBounce * 100).toFixed(1)} className={cx(inputClass, 'mt-1 h-10 text-[14px]')} />
                </label>
                <label className="sm:col-span-2">
                  <span className="font-semibold text-ink-2">Pie legal de cada correo</span>
                  <textarea name="footer" rows={3} defaultValue={s.footer} className={cx(textareaClass, 'mt-1 text-[13px]')} />
                  <span className="text-[11.5px] text-faint">Sale pequeño y en gris al final. Obligatorio: empresa, dirección postal, de dónde sale su correo y cómo darse de baja.</span>
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" name="listUnsubscribe" defaultChecked={s.listUnsubscribe} />
                  <span className="text-ink-2">Baja en un clic por https (pone placton.tech en la cabecera de cada correo; la baja por correo va siempre)</span>
                </label>
                <div className="sm:col-span-2">
                  <button className="h-10 rounded-full bg-deep px-5 text-[14px] font-semibold text-white hover:bg-deep-2">Guardar ajustes</button>
                </div>
              </form>
            </Panel>
            <div className="space-y-4">
              <Panel title="Enviar una prueba" hint="Manda a tu dirección (o a la de mail-tester.com) un paso de la secuencia de un contacto de ejemplo, tal cual lo recibiría.">
                <form action={testAction} className="grid gap-2 text-[13px] sm:grid-cols-2">
                  <select name="mailbox" className={cx(inputClass, 'h-10 text-[14px]')} aria-label="Buzón">
                    {boxes.map((b) => (
                      <option key={b.email}>{b.email}</option>
                    ))}
                  </select>
                  <input name="to" placeholder="Enviar a…" className={cx(inputClass, 'h-10 text-[14px]')} />
                  <select name="audience" className={cx(inputClass, 'h-10 text-[14px]')} aria-label="Público">
                    <option value="">Cualquier público</option>
                    {Object.entries(AUDIENCE).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select name="step" className={cx(inputClass, 'h-10 text-[14px]')} aria-label="Paso">
                    {[0, 1, 2, 3].map((i) => (
                      <option key={i} value={i}>
                        Correo {i + 1}
                      </option>
                    ))}
                  </select>
                  <div className="sm:col-span-2">
                    <button disabled={!boxes.length} className="h-10 rounded-full border border-line bg-white px-5 text-[14px] font-semibold text-ink-2 hover:border-faint disabled:opacity-50">
                      Enviar prueba
                    </button>
                  </div>
                </form>
              </Panel>
              <Panel title="Excluir a mano" hint="Un correo o un dominio entero que no debe recibir nada (clientes, socios, quien lo pida por otra vía).">
                <form action={suppressAction} className="flex gap-2">
                  <input name="value" placeholder="persona@empresa.com o empresa.com" className={cx(inputClass, 'h-10 text-[14px]')} />
                  <button className="h-10 shrink-0 rounded-full border border-line bg-white px-5 text-[14px] font-semibold text-ink-2 hover:border-faint">Excluir</button>
                </form>
              </Panel>
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">
            {head.map((h, i) => (
              <th key={h} className={cx('py-2.5 font-semibold', i === 0 ? 'pl-5 text-left' : 'text-right', i === head.length - 1 && 'pr-5')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-line-2 last:border-0">
              {row.map((c, i) => (
                <td key={i} className={cx('py-2.5 num', i === 0 ? 'pl-5 text-left text-ink' : 'text-right text-ink-2', i === row.length - 1 && 'pr-5')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={head.length} className="px-5 py-6 text-center text-mute">
                Sin datos todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
