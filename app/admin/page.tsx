import Link from 'next/link'
import { Columns } from '@/components/admin/Columns'
import { int, percent, usd } from '@/components/admin/format'
import { BarList, Flag, Funnel, Heatmap, Kpi, NEUTRAL, ORANGE, Panel, PnlLine, Section, TEAL } from '@/components/admin/parts'
import { Logo } from '@/components/Logo'
import { cx, fmtDate, PLATFORM_META, PlatformDot, segmentItem, segmentWrap } from '@/components/ui'
import { dataForSeoBalance, openRouterData, stripeData } from '@/lib/admin/external'
import { buildReport, period, planLabel, RANGES, type RangeId } from '@/lib/admin/stats'
import { isAdmin, requireUser } from '@/lib/auth'
import { addDays, all, one, today } from '@/lib/db'
import { platforms } from '@/lib/engines'
import { stripeMode } from '@/lib/stripe'
import { logoutAction } from '../(auth)/actions'

export const metadata = { title: 'Administración' }
export const dynamic = 'force-dynamic'

// Panel interno de Placton: ingresos, captación, costes y márgenes, clientes,
// uso y sistema. Las cifras de dinero salen de Stripe y OpenRouter en vivo
// (caché de 5 minutos; «Actualizar» las vuelve a pedir).

const NAV = [
  ['resumen', 'Resumen'],
  ['ingresos', 'Ingresos'],
  ['captacion', 'Captación'],
  ['costes', 'Costes y márgenes'],
  ['clientes', 'Clientes'],
  ['uso', 'Uso'],
  ['sistema', 'Sistema'],
] as const

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ r?: string; fresh?: string }> }) {
  const user = await requireUser('/admin')
  if (!isAdmin(user)) return <NoAccess email={user.email} />

  const sp = await searchParams
  const p = period(sp.r)
  const fresh = sp.fresh === '1'
  const [S, OR, DFS] = await Promise.all([stripeData(fresh), openRouterData(fresh), dataForSeoBalance(fresh)])
  const r = buildReport(p, { stripe: S, openrouter: OR })
  const to = today()

  // Sistema
  const serverErrors = all<{ message: string; path: string; n: number; last: string }>(
    'SELECT message, path, COUNT(*) AS n, MAX(createdAt) AS last FROM error_log WHERE createdAt >= ? GROUP BY signature ORDER BY last DESC LIMIT 10',
    [`${addDays(to, -6)}T00:00:00Z`],
  )
  const engineErrors = all<{ engine: string; n: number; total: number; last: string }>(
    'SELECT engine, SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS n, COUNT(*) AS total, MAX(error) AS last FROM answers WHERE day BETWEEN ? AND ? GROUP BY engine',
    [addDays(to, -6), to],
  )
  const runsLive = all<{ id: number; name: string; done: number; total: number; startedAt: string }>(
    "SELECT r.id, w.name, r.done, r.total, r.startedAt FROM runs r JOIN workspaces w ON w.id = r.workspaceId WHERE r.status = 'corriendo' ORDER BY r.startedAt DESC LIMIT 10",
  )
  const lastRuns = all<{ id: number; name: string; status: string; trigger: string; total: number; costUsd: number; startedAt: string; error: string | null }>(
    'SELECT r.id, w.name, r.status, r.trigger, r.total, r.costUsd, r.startedAt, r.error FROM runs r JOIN workspaces w ON w.id = r.workspaceId ORDER BY r.startedAt DESC LIMIT 8',
  )
  const emails = all<{ toEmail: string; subject: string; kind: string; sent: number; error: string | null; createdAt: string }>('SELECT * FROM email_log ORDER BY id DESC LIMIT 12')
  const emailStats = one<{ ok: number; bad: number }>('SELECT SUM(CASE WHEN sent = 1 THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN sent = 0 THEN 1 ELSE 0 END) AS bad FROM email_log WHERE createdAt >= ?', [`${p.from}T00:00:00Z`])
  const contacts = all<{ id: number; name: string; email: string; topic: string; message: string; createdAt: string }>('SELECT * FROM contact_messages ORDER BY createdAt DESC LIMIT 10')

  const href = (q: Record<string, string>) => `/admin?${new URLSearchParams({ r: p.id, ...q }).toString()}`
  const orBalance = OR ? OR.credits - OR.used : null
  const stamp = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })

  return (
    <div className="min-h-screen bg-[#f3f5f4]">
      {/* Cabecera fija: secciones, periodo y estado de las fuentes */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/dashboard" />
            <span className="h-5 w-px bg-line" />
            <span className="text-[13px] font-bold tracking-[-0.01em] text-ink-2">Administración</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav className={segmentWrap} aria-label="Periodo">
              {(Object.keys(RANGES) as RangeId[]).map((id) => (
                <Link key={id} href={`/admin?r=${id}`} className={segmentItem(p.id === id)} scroll={false}>
                  {RANGES[id].label}
                </Link>
              ))}
            </nav>
            <Link href={href({ fresh: '1' })} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:border-faint hover:text-ink" scroll={false}>
              Actualizar
            </Link>
            <Link href="/admin/outreach" className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:border-faint hover:text-ink">
              Campaña de correo
            </Link>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 overflow-x-auto px-4 pb-2.5 sm:px-6">
          <nav className="flex shrink-0 gap-1 text-[13px] font-semibold">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full px-3 py-1 text-mute transition-colors hover:bg-line-2 hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden shrink-0 items-center gap-3 text-[12px] text-mute xl:flex">
            <Source ok={r.live.stripe} label={`Stripe ${stripeMode() === 'live' ? 'en vivo' : stripeMode()}`} />
            <Source ok={r.live.openrouter} label="OpenRouter" />
            <Source ok={Boolean(DFS)} label="DataForSEO" />
            <span className="text-faint">Datos de las {stamp}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] space-y-12 px-4 py-8 sm:px-6">
        {/* ───────── Resumen ───────── */}
        <Section id="resumen" title="Resumen" hint={`Del ${fmtDate(p.from, 'es')} al ${fmtDate(p.to, 'es')}. Las variaciones comparan con los ${RANGES[p.id].label} anteriores.`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi big label="Ingresos recurrentes (MRR)" value={usd(r.mrr, 0)} info="Suma de las cuotas activas en Stripe, pasadas a su equivalente mensual (las anuales, entre 12)." foot={`${usd(r.arr, 0)} al año (ARR)`} />
            <Kpi big label="Clientes de pago" value={int(r.customers)} info="Suscripciones activas o con un cobro pendiente de reintento." foot={r.newCustomers ? plural(r.newCustomers, 'nuevo en el periodo', 'nuevos en el periodo') : 'Sin clientes nuevos en el periodo'} />
            <Kpi big label="Ticket medio mensual (ARPA)" value={r.customers ? usd(r.arpa, 2) : 'Sin clientes'} info="Ingresos recurrentes divididos entre los clientes de pago." foot={r.avgTicket !== null ? `${usd(r.avgTicket, 2)} por cobro en el periodo` : 'Sin cobros en el periodo'} />
            <Kpi
              big
              label="Margen mensual"
              value={r.runRate.margin === null ? 'Sin ingresos' : percent(r.runRate.margin)}
              info="(Ingresos recurrentes − coste de API de los clientes de pago en 30 días − comisiones de Stripe − alojamiento) ÷ ingresos recurrentes."
              foot={`Beneficio de ${usd(r.runRate.profit, 0)} al mes`}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Cobrado en el periodo" value={usd(r.revenue.value ?? 0)} now={r.revenue.value} prev={r.revenue.prev} info="Facturas pagadas en Stripe menos reembolsos." foot={plural(r.invoices, 'cobro', 'cobros')} />
            <Kpi label="Beneficio del periodo" value={usd(r.profit)} info="Cobrado − todo el coste de API (también pruebas gratis) − comisiones de Stripe − alojamiento." foot={r.margin === null ? 'Sin cobros todavía' : `Margen neto ${percent(r.margin)}`} />
            <Kpi
              label="Bajas al mes (churn)"
              value={r.churn.monthlyLogo === null ? 'Sin datos' : percent(r.churn.monthlyLogo)}
              info="Clientes que dejaron de pagar en el periodo sobre los que había al empezar, llevado a un mes."
              foot={r.churn.base ? `${int(r.churn.lost)} de ${int(r.churn.base)} clientes · ${usd(r.churn.lostMrr, 0)} de MRR perdido` : 'Aún no había clientes al empezar el periodo'}
            />
            <Kpi
              label="Valor de vida del cliente (LTV)"
              value={r.ltv === null ? 'Sin datos' : usd(r.ltv, 0)}
              info="Ticket medio × margen ÷ bajas mensuales. Mientras casi no haya bajas, se limita a 36 meses de vida."
              foot={r.ltv === null ? 'Hace falta algún cliente de pago' : r.ltvCapped ? 'Calculado a 36 meses (sin bajas suficientes)' : `Con ${percent(r.churn.monthlyLogo)} de bajas al mes`}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Visitantes" value={int(r.visitors.value ?? 0)} now={r.visitors.value} prev={r.visitors.prev} info="Visitantes únicos por día en la web pública (analítica propia, sin cookies)." foot={`${int(r.pageviews.value ?? 0)} páginas vistas`} />
            <Kpi label="Registros" value={int(r.signups.value ?? 0)} now={r.signups.value} prev={r.signups.prev} info="Cuentas nuevas en el periodo." />
            <Kpi label="Tasa de registro" value={percent(r.signupRate.value)} now={r.signupRate.value} prev={r.signupRate.prev} info="Registros ÷ visitantes del mismo periodo." />
            <Kpi
              label="Prueba → pago"
              value={percent(r.trialToPaid.rate)}
              info="De los espacios cuya prueba gratis ya terminó (o que ya pagan), cuántos pagan o han pagado."
              foot={r.trialToPaid.trials ? `${int(r.trialToPaid.paid)} de ${int(r.trialToPaid.trials)} pruebas terminadas` : 'Ninguna prueba ha terminado todavía'}
            />
          </div>
          <Alerts r={r} orBalance={orBalance} dfs={DFS} />
        </Section>

        {/* ───────── Ingresos ───────── */}
        <Section id="ingresos" title="Ingresos" hint={r.live.stripe ? 'Datos en vivo de Stripe: suscripciones, facturas pagadas, reembolsos y comisiones reales.' : 'Stripe no responde: cifras calculadas con los planes guardados en Placton.'}>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Ingresos recurrentes por mes" hint="MRR al cierre de cada mes y clientes de pago." info="Cuotas activas al final de cada mes, en su equivalente mensual.">
              <Columns
                labels={r.mrrMonths.map((m) => m.label)}
                bars={[{ name: 'MRR', color: TEAL, values: r.mrrMonths.map((m) => m.mrr) }]}
                line={{ name: 'Clientes', color: '#0b1d21', values: r.mrrMonths.map((m) => m.customers) }}
                format="usd"
                lineFormat="int"
                empty="Aún no hay suscripciones."
              />
            </Panel>
            <Panel title="Altas y bajas de MRR" hint="Cuota de las suscripciones que empiezan (arriba) y de las que terminan (abajo).">
              <Columns
                labels={r.mrrMonths.map((m) => m.label)}
                bars={[
                  { name: 'Nuevo MRR', color: TEAL, values: r.mrrMonths.map((m) => m.added) },
                  { name: 'MRR perdido', color: ORANGE, values: r.mrrMonths.map((m) => -m.lost) },
                ]}
                line={{ name: 'Neto', color: '#0b1d21', values: r.mrrMonths.map((m) => m.added - m.lost), axis: 'left' }}
                format="usd"
                empty="Aún no hay movimientos."
              />
            </Panel>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Planes" hint="Clientes y cuota mensual por plan y forma de pago." className="lg:col-span-2" pad={false}>
              <Table
                head={['Plan', 'Pago', 'Clientes', 'MRR', '% del MRR']}
                rows={r.planMix.map((m) => [planLabel(m.plan), m.interval === 'year' ? 'Anual' : 'Mensual', int(m.n), usd(m.mrr), percent(r.mrr ? m.mrr / r.mrr : null, 0)])}
                empty="Todavía no hay clientes de pago."
                align={['left', 'left', 'right', 'right', 'right']}
              />
            </Panel>
            <Panel title="Cobros del periodo">
              <PnlLine label="Facturas pagadas" value={int(r.invoices)} />
              <PnlLine label="Ticket medio por cobro" value={r.avgTicket === null ? 'Sin cobros' : usd(r.avgTicket)} />
              <PnlLine label="Reembolsos" value={usd(r.refunds)} />
              <PnlLine label="Comisiones de Stripe" value={usd(r.fees.value ?? 0)} hint={r.live.stripe ? 'Comisiones reales de Stripe, pasadas a dólares con el cambio de cada cobro.' : 'Estimadas: 5 % + 0,30 $ por cobro.'} />
              <PnlLine strong label="Cobrado neto" value={usd((r.revenue.value ?? 0) - (r.fees.value ?? 0))} />
              {S && <p className="mt-2 text-[12px] text-faint">Saldo en Stripe: {S.balance.available.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {S.balance.currency.toUpperCase()} disponible, {S.balance.pending.toLocaleString('es-ES', { maximumFractionDigits: 2 })} pendiente.</p>}
            </Panel>
          </div>
          {r.retention.length > 0 && (
            <Panel title="Retención de clientes de pago" hint="Por mes de inicio: qué parte sigue pagando cada mes después." pad={false}>
              <Retention rows={r.retention} />
            </Panel>
          )}
        </Section>

        {/* ───────── Captación ───────── */}
        <Section id="captacion" title="Captación y conversión" hint="Analítica propia sin cookies en la web pública y en el alta; las personas se cuentan una vez por día.">
          <Panel title="Visitas y registros" hint={p.days > 90 ? 'Por semana.' : 'Por día.'}>
            <Columns
              labels={r.traffic.map((t) => t.label)}
              bars={[{ name: 'Visitantes', color: NEUTRAL, values: r.traffic.map((t) => t.visitors) }]}
              line={{ name: 'Registros', color: TEAL, values: r.traffic.map((t) => t.signups) }}
              format="int"
              height={220}
              empty="Todavía no hay visitas registradas."
            />
          </Panel>
          <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
            <Panel title="Embudo del periodo" hint="De la visita al pago, con la conversión de cada paso.">
              <Funnel steps={r.funnel} />
              <p className="mt-4 text-[12px] text-mute">
                Conversión total de visita a pago: <b className="font-semibold text-ink">{percent(r.funnel[0].n ? r.funnel[4].n / r.funnel[0].n : null, 2)}</b>
              </p>
            </Panel>
            <Panel title="Cohortes por mes de registro" hint="Cuántos de los que se registraron cada mes llegan a cada paso." pad={false}>
              <Table
                head={['Mes', 'Registros', 'Configuran', 'Miden', 'Pagan']}
                rows={r.cohorts
                  .slice()
                  .reverse()
                  .map((c) => [c.label, int(c.signups), share(c.activated, c.signups), share(c.measured, c.signups), share(c.paid, c.signups)])}
                align={['left', 'right', 'right', 'right', 'right']}
                empty="Todavía no hay registros."
              />
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Mapa de calor de visitas" hint="Páginas vistas por día de la semana y hora (Madrid).">
              <Heatmap values={r.heatVisits} unit="páginas vistas" unitOne="página vista" />
            </Panel>
            <Panel title="Mapa de calor de registros" hint="Cuentas nuevas por día de la semana y hora (Madrid).">
              <Heatmap values={r.heatSignups} unit="registros" unitOne="registro" />
            </Panel>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Panel title="De dónde vienen" hint="Visitantes por origen.">
              <BarList rows={r.sources} />
            </Panel>
            <Panel title="Páginas más vistas">
              <BarList rows={r.pages} />
            </Panel>
            <Panel title="Países" hint="Según el idioma del navegador.">
              <BarList rows={r.countries} />
            </Panel>
            <Panel title="Dispositivos">
              <BarList rows={r.devices} empty="Se empieza a medir hoy." />
            </Panel>
          </div>
        </Section>

        {/* ───────── Costes y márgenes ───────── */}
        <Section id="costes" title="Costes y márgenes" hint="El coste de cada respuesta se guarda al medir; el gasto real de OpenRouter se lee de su API para comprobar que la estimación cuadra.">
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Panel title="Resultado por mes" hint="Cobrado frente a costes (API, comisiones) y beneficio tras alojamiento.">
              <Columns
                labels={r.monthsPnl.map((m) => m.label)}
                mode="group"
                bars={[
                  { name: 'Cobrado', color: TEAL, values: r.monthsPnl.map((m) => m.revenue) },
                  { name: 'API', color: ORANGE, values: r.monthsPnl.map((m) => m.api) },
                  { name: 'Comisiones', color: '#f2b08f', values: r.monthsPnl.map((m) => m.fees) },
                ]}
                line={{ name: 'Beneficio', color: '#0b1d21', values: r.monthsPnl.map((m) => (m.revenue ? m.profit : null)), axis: 'left' }}
                format="usd"
                empty="Aún no hay cobros ni costes."
              />
            </Panel>
            <Panel title="Cuenta mensual" hint="Al ritmo actual (un mes de cuotas activas).">
              <PnlLine label="Ingresos recurrentes" value={usd(r.runRate.revenue)} />
              <PnlLine label="API de los clientes (30 días)" value={`− ${usd(r.runRate.api)}`} base={r.runRate.revenue ? r.runRate.api / r.runRate.revenue : null} negative />
              <PnlLine label="Comisiones de Stripe" value={`− ${usd(r.runRate.fees)}`} base={r.runRate.revenue ? r.runRate.fees / r.runRate.revenue : null} negative />
              <PnlLine label="Alojamiento (Railway)" value={`− ${usd(r.runRate.hosting)}`} base={r.runRate.revenue ? r.runRate.hosting / r.runRate.revenue : null} negative hint="Coste fijo estimado; se ajusta con PLACTON_HOSTING_USD." />
              <PnlLine strong label="Beneficio al mes" value={usd(r.runRate.profit)} base={r.runRate.margin} />
              <p className="mt-3 text-[12px] leading-relaxed text-mute">
                Pruebas gratis del periodo: {usd(r.apiCostTrial)} de API, que cuentan como coste de captación.
              </p>
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Coste de API del periodo" value={usd(r.apiCost.value ?? 0)} now={r.apiCost.value} prev={r.apiCost.prev} invert info="Suma del coste guardado en cada respuesta medida (OpenRouter y DataForSEO)." foot={`${usd(r.apiCostPaid)} de clientes y ${usd(r.apiCostTrial)} de pruebas`} />
            <Kpi label="Coste de captar un cliente (CAC)" value={r.cac === null ? 'Sin datos' : usd(r.cac)} info="Coste de las pruebas gratis del periodo (y anuncios, si se configuran con PLACTON_ADS_USD_MONTH) ÷ clientes nuevos." foot={r.newCustomers ? plural(r.newCustomers, 'cliente nuevo', 'clientes nuevos') : 'Sin clientes nuevos en el periodo'} />
            <Kpi label="LTV ÷ CAC" value={r.ltv !== null && r.cac ? `${(r.ltv / r.cac).toLocaleString('es-ES', { maximumFractionDigits: 1 })} ×` : 'Sin datos'} info="Cuánto deja un cliente en su vida frente a lo que cuesta conseguirlo. Por encima de 3 es sano." />
            <Kpi label="Recuperación del CAC" value={r.payback === null ? 'Sin datos' : `${r.payback.toLocaleString('es-ES', { maximumFractionDigits: 1 })} meses`} info="Meses de margen que tarda un cliente en pagar lo que costó captarlo." />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Panel title="Coste de API por día y plataforma" hint={p.days > 90 ? 'Por semana.' : 'Por día.'}>
              <Columns
                labels={r.costDays.map((d) => d.label)}
                bars={platforms().map((pl) => ({ name: pl.name, color: PLATFORM_META[pl.id]?.color ?? '#93a3a6', values: r.costDays.map((d) => d.engines[pl.id] ?? 0) }))}
                format="usd"
                empty="Sin mediciones en este periodo."
              />
            </Panel>
            <Panel title="Gasto real frente a estimado" hint="OpenRouter (clave de Placton) frente a la suma del coste guardado por respuesta.">
              <Table
                head={['', 'Real', 'Estimado', 'Diferencia']}
                rows={r.realVsEstimate.map((x) => [x.label, x.real === null ? 'Sin datos' : usd(x.real), usd(x.estimate), x.real === null || !x.estimate ? 'Sin datos' : percent((x.real - x.estimate) / x.estimate, 0)])}
                align={['left', 'right', 'right', 'right']}
                plain
              />
              <p className="mt-3 text-[12px] leading-relaxed text-mute">
                El real incluye también el análisis de webs del alta, las ideas y la búsqueda de webs de competidores, que no van en el coste por respuesta. Google AI se paga en DataForSEO.
              </p>
              {r.realDaily.length > 1 && (
                <div className="mt-4">
                  <Columns labels={r.realDaily.map((d) => d.label)} bars={[{ name: 'Gasto real diario en OpenRouter', color: ORANGE, values: r.realDaily.map((d) => d.real) }]} format="usd" height={110} />
                </div>
              )}
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Plataformas" hint="Respuestas, coste y fiabilidad en el periodo." pad={false}>
              <Table
                head={['Plataforma', 'Respuestas', 'Coste', 'Por respuesta', 'Errores', 'Latencia']}
                rows={r.engines.map((e) => [
                  <span key="n" className="inline-flex items-center gap-2 font-semibold text-ink">
                    <PlatformDot id={e.id} size={18} />
                    {PLATFORM_META[e.id]?.name ?? e.id}
                  </span>,
                  int(e.answers),
                  usd(e.cost),
                  usd(e.perAnswer, 4),
                  percent(e.answers ? e.errors / e.answers : null),
                  `${(e.latency / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`,
                ])}
                align={['left', 'right', 'right', 'right', 'right', 'right']}
                empty="Sin mediciones en este periodo."
              />
            </Panel>
            <Panel title="Rentabilidad por plan" hint="Cuota frente al coste de API de 30 días de sus clientes." pad={false}>
              <Table
                head={['Plan', 'Clientes', 'MRR', 'API por cliente', 'Margen']}
                rows={r.planEconomics.map((x) => [planLabel(x.plan), int(x.customers), usd(x.mrr), usd(x.apiPerCustomer), percent(x.margin)])}
                align={['left', 'right', 'right', 'right', 'right']}
                empty="Todavía no hay clientes de pago."
              />
            </Panel>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Balance label="Saldo en OpenRouter" value={orBalance} low={10} note="Cuenta compartida con otros proyectos; la recarga automática evita quedarse sin saldo." />
            <Balance label="Saldo en DataForSEO" value={DFS?.balance ?? null} low={10} note="Paga la medición de Google AI Overviews. Aviso por correo si baja de 10 $." />
            <Balance label="Gasto de OpenRouter este mes" value={OR?.month ?? null} note={OR ? `Hoy ${usd(OR.today)} · esta semana ${usd(OR.week)} · total ${usd(OR.total)}` : 'Sin conexión con OpenRouter.'} neutral />
          </div>
        </Section>

        {/* ───────── Clientes ───────── */}
        <Section id="clientes" title="Clientes" hint="Todos los espacios terminados: cuota, coste de API de 30 días y margen de cada uno.">
          <Panel pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">
                    <th className="py-3 pl-5 font-semibold">Espacio</th>
                    <th className="font-semibold">Plan</th>
                    <th className="font-semibold">Estado</th>
                    <th className="text-right font-semibold">Cuota/mes</th>
                    <th className="text-right font-semibold">API 30 d</th>
                    <th className="text-right font-semibold">Margen</th>
                    <th className="text-right font-semibold">Prompts</th>
                    <th className="text-right font-semibold">Última medición</th>
                    <th className="pr-5 text-right font-semibold">Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {r.customersTable.map((c) => (
                    <tr key={c.id} className="border-b border-line-2 last:border-0 hover:bg-[#f8faf9]">
                      <td className="py-3 pl-5">
                        <div className="font-semibold text-ink">{c.name}</div>
                        <div className="text-[12px] text-mute">
                          {c.domain || 'Sin web'} · {c.owner}
                        </div>
                      </td>
                      <td>
                        {planLabel(c.plan)}
                        {c.plan !== 'trial' && <span className="text-mute"> · {c.interval === 'year' ? 'anual' : 'mensual'}</span>}
                        {c.agencyClient && <span className="text-mute"> · cliente de agencia</span>}
                      </td>
                      <td className="text-ink-2">{c.status === 'prueba' && c.trialLeft !== null ? `Prueba, ${c.trialLeft} d` : STATUS[c.status] ?? c.status}</td>
                      <td className="text-right num">{c.monthly ? usd(c.monthly) : <span className="text-faint">0 $</span>}</td>
                      <td className="text-right num">{usd(c.api30)}</td>
                      <td className={cx('text-right num', c.margin !== null && c.margin < 0.5 && 'font-bold text-bad')}>{c.margin === null ? <span className="text-faint">Sin cuota</span> : percent(c.margin, 0)}</td>
                      <td className="text-right num">
                        {int(c.prompts)}
                        <span className="text-faint"> / {int(c.promptLimit)}</span>
                      </td>
                      <td className="text-right text-mute num">{c.lastDay ? fmtDate(c.lastDay, 'es') : 'Nunca'}</td>
                      <td className="pr-5 text-right text-mute num">{fmtDate(c.createdAt, 'es')}</td>
                    </tr>
                  ))}
                  {!r.customersTable.length && (
                    <tr>
                      <td colSpan={9} className="px-5 py-6 text-center text-mute">
                        Todavía no hay espacios terminados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </Section>

        {/* ───────── Uso ───────── */}
        <Section id="uso" title="Uso del producto" hint="Qué se usa de Placton en el periodo.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Mini label="Espacios activos" value={int(r.usage.activeSpaces)} hint="Con una medición en los últimos 8 días" />
            <Mini label="Prompts activos" value={int(r.usage.prompts)} />
            <Mini label="Respuestas medidas" value={int(r.usage.answers)} hint={r.usage.reused ? `${int(r.usage.reused)} reutilizadas, ${usd(r.usage.saved)} ahorrados` : 'Ninguna reutilizada todavía'} />
            <Mini label="Menciones encontradas" value={int(r.usage.mentions)} />
            <Mini label="Mediciones" value={int(r.usage.runsOk)} hint={r.usage.runsError ? `${int(r.usage.runsError)} con error` : 'Ninguna con error'} />
            <Mini label="Ideas generadas" value={int(r.usage.ideas)} />
            <Mini label="Auditorías de web" value={int(r.usage.audits)} />
            <Mini label="Miembros invitados" value={int(r.usage.members)} hint="Personas que no son dueñas del espacio" />
            <Mini label="Correos enviados" value={int(emailStats?.ok ?? 0)} hint={emailStats?.bad ? `${int(emailStats.bad)} sin enviar` : 'Todos enviados'} />
            <Mini label="Mensajes de contacto" value={int(contacts.length)} hint="Últimos 10" />
          </div>
        </Section>

        {/* ───────── Sistema ───────── */}
        <Section id="sistema" title="Sistema" hint="Errores, mediciones, correos y mensajes. Copias del disco: diaria y semanal en Railway.">
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Errores del servidor (7 días)" hint="Cada error nuevo se avisa por correo, como mucho una vez por hora." pad={false}>
              <List
                items={serverErrors.map((e) => ({ key: e.last + e.message, title: e.message, sub: `${e.path || 'servidor'} · ${e.n} ${e.n === 1 ? 'vez' : 'veces'} · último ${fmtDate(e.last, 'es')}` }))}
                empty="Sin errores en la última semana."
              />
            </Panel>
            <Panel title="Plataformas (7 días)" hint="Respuestas que fallaron al preguntar." pad={false}>
              <Table
                head={['Plataforma', 'Estado', 'Errores', 'Último error']}
                rows={platforms().map((pl) => {
                  const e = engineErrors.find((x) => x.engine === pl.id)
                  return [
                    <span key="n" className="inline-flex items-center gap-2 font-semibold text-ink">
                      <PlatformDot id={pl.id} size={18} />
                      {pl.name}
                    </span>,
                    pl.available ? <span key="s" className="text-ink-2">Activa · {pl.model}</span> : <span key="s" className="text-bad">Falta {pl.missing}</span>,
                    e ? `${int(e.n)} de ${int(e.total)}` : '0',
                    <span key="l" className="block max-w-[260px] truncate text-mute" title={e?.last ?? ''}>
                      {e?.last ?? 'Ninguno'}
                    </span>,
                  ]
                })}
                align={['left', 'left', 'right', 'left']}
              />
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Mediciones" hint={runsLive.length ? `${runsLive.length} en marcha ahora.` : 'Ninguna en marcha ahora.'} pad={false}>
              <List
                items={[
                  ...runsLive.map((x) => ({ key: `l${x.id}`, title: `${x.name}: en marcha`, sub: `${int(x.done)} de ${int(x.total)} respuestas · empezó ${fmtDate(x.startedAt, 'es')}` })),
                  ...lastRuns
                    .filter((x) => x.status !== 'corriendo')
                    .map((x) => ({
                      key: `r${x.id}`,
                      title: `${x.name}: ${x.status === 'ok' ? 'terminada' : 'con error'}`,
                      sub: `${x.trigger} · ${int(x.total)} respuestas · ${usd(x.costUsd)} · ${fmtDate(x.startedAt, 'es')}${x.error ? ` · ${x.error}` : ''}`,
                    })),
                ]}
                empty="Todavía no hay mediciones."
              />
            </Panel>
            <Panel title="Últimos correos" pad={false}>
              <List
                items={emails.map((m, i) => ({ key: String(i), title: m.subject, sub: `${m.toEmail} · ${m.kind} · ${fmtDate(m.createdAt, 'es')}`, right: m.sent ? 'Enviado' : m.error ? 'Error' : 'Sin enviar', bad: !m.sent }))}
                empty="Ninguno todavía."
              />
            </Panel>
          </div>
          <Panel title="Mensajes de contacto" pad={false}>
            {contacts.length ? (
              <ul className="divide-y divide-line-2">
                {contacts.map((c) => (
                  <li key={c.id} className="px-5 py-4 text-[13px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {c.name} · <a href={`mailto:${c.email}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">{c.email}</a>
                      </span>
                      <span className="text-[12px] text-mute">
                        {c.topic} · {fmtDate(c.createdAt, 'es')}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line leading-relaxed text-ink-2">{c.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-5 text-[13px] text-mute">Sin mensajes.</p>
            )}
          </Panel>
        </Section>
      </main>
    </div>
  )
}

const STATUS: Record<string, string> = {
  active: 'Activa',
  past_due: 'Cobro pendiente',
  canceled: 'Cancelada',
  incomplete: 'Sin completar',
  trialing: 'Activa',
  'prueba terminada': 'Prueba terminada',
}

function plural(n: number, one: string, many: string): string {
  return `${int(n)} ${n === 1 ? one : many}`
}

function share(n: number, of: number): string {
  return of ? `${int(n)} · ${percent(n / of, 0)}` : '0'
}

function Source({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-[2px] w-3 rounded-full" style={{ background: ok ? TEAL : '#c2410c' }} />
      {label}
    </span>
  )
}

function Alerts({ r, orBalance, dfs }: { r: ReturnType<typeof buildReport>; orBalance: number | null; dfs: { balance: number } | null }) {
  const flags: { tone: 'bad' | 'warn'; text: React.ReactNode }[] = []
  if (r.pastDue.n) flags.push({ tone: 'bad', text: `${int(r.pastDue.n)} ${r.pastDue.n === 1 ? 'cliente tiene' : 'clientes tienen'} un cobro fallido (${usd(r.pastDue.mrr)} al mes en riesgo). Stripe lo reintenta solo.` })
  if (r.scheduledCancel.n) flags.push({ tone: 'warn', text: `${int(r.scheduledCancel.n)} ${r.scheduledCancel.n === 1 ? 'baja programada' : 'bajas programadas'} para el final de su periodo (${usd(r.scheduledCancel.mrr)} de MRR).` })
  if (dfs && dfs.balance < 10) flags.push({ tone: 'bad', text: `Quedan ${usd(dfs.balance)} en DataForSEO. Sin saldo, Google AI Overviews se queda sin medir. Recarga en app.dataforseo.com.` })
  if (orBalance !== null && orBalance < 10) flags.push({ tone: 'warn', text: `Quedan ${usd(orBalance)} en OpenRouter. Comprueba que la recarga automática está activa.` })
  const loss = r.customersTable.filter((c) => c.margin !== null && c.margin < 0.5)
  if (loss.length) flags.push({ tone: 'warn', text: `${int(loss.length)} ${loss.length === 1 ? 'cliente deja' : 'clientes dejan'} menos del 50 % de margen: ${loss.map((c) => c.name).slice(0, 4).join(', ')}.` })
  if (!flags.length) return null
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {flags.map((f, i) => (
        <Flag key={i} tone={f.tone}>
          {f.text}
        </Flag>
      ))}
    </div>
  )
}

function Balance({ label, value, low, note, neutral }: { label: string; value: number | null; low?: number; note: string; neutral?: boolean }) {
  const isLow = !neutral && value !== null && low !== undefined && value < low
  return (
    <div className="card p-5">
      <div className="text-[12.5px] font-semibold text-mute">{label}</div>
      <div className={cx('mt-2 text-[24px] font-extrabold leading-none tracking-[-0.03em] num', isLow ? 'text-bad' : 'text-ink')}>{value === null ? 'Sin datos' : usd(value)}</div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-mute">{note}</p>
    </div>
  )
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-semibold text-mute">{label}</div>
      <div className="mt-1.5 text-[22px] font-extrabold leading-none tracking-[-0.03em] text-ink num">{value}</div>
      {hint && <div className="mt-2 text-[11.5px] text-faint">{hint}</div>}
    </div>
  )
}

function Table({ head, rows, align, empty, plain }: { head: string[]; rows: React.ReactNode[][]; align?: ('left' | 'right')[]; empty?: string; plain?: boolean }) {
  const a = (i: number) => (align?.[i] === 'right' ? 'text-right' : 'text-left')
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className={cx('border-b border-line text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint', plain && 'border-line-2')}>
            {head.map((h, i) => (
              <th key={i} className={cx('py-2.5 font-semibold', a(i), !plain && i === 0 && 'pl-5', !plain && i === head.length - 1 && 'pr-5', plain && i > 0 && 'pl-3')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-line-2 last:border-0">
              {row.map((c, i) => (
                <td key={i} className={cx('py-2.5 num', a(i), i === 0 ? 'text-ink' : 'text-ink-2', !plain && i === 0 && 'pl-5', !plain && i === row.length - 1 && 'pr-5', plain && i > 0 && 'pl-3')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={head.length} className="px-5 py-6 text-center text-mute">
                {empty ?? 'Sin datos.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function List({ items, empty }: { items: { key: string; title: string; sub: string; right?: string; bad?: boolean }[]; empty: string }) {
  if (!items.length) return <p className="px-5 py-5 text-[13px] text-mute">{empty}</p>
  return (
    <ul className="divide-y divide-line-2">
      {items.map((it) => (
        <li key={it.key} className="flex items-center justify-between gap-4 px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">{it.title}</div>
            <div className="truncate text-[12px] text-mute">{it.sub}</div>
          </div>
          {it.right && <span className={cx('shrink-0 text-[12px] font-semibold', it.bad ? 'text-bad' : 'text-mute')}>{it.right}</span>}
        </li>
      ))}
    </ul>
  )
}

function Retention({ rows }: { rows: { label: string; start: number; cells: (number | null)[] }[] }) {
  return (
    <div className="overflow-x-auto px-5 pb-5">
      <table className="w-full min-w-[760px] border-separate border-spacing-[3px] text-[12px]">
        <thead>
          <tr className="text-faint">
            <th className="text-left font-semibold">Inicio</th>
            <th className="text-right font-semibold">Clientes</th>
            {Array.from({ length: 12 }, (_, i) => (
              <th key={i} className="font-semibold">
                Mes {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="pr-2 font-semibold text-ink">{r.label}</td>
              <td className="pr-2 text-right num text-ink-2">{int(r.start)}</td>
              {r.cells.map((v, i) => (
                <td key={i} className="h-8 rounded-[5px] text-center num" style={{ background: v === null ? 'transparent' : `rgba(0,163,140,${0.08 + 0.92 * v})`, color: v !== null && v > 0.55 ? '#fff' : '#31464b' }}>
                  {v === null ? '' : `${Math.round(v * 100)} %`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Quien entra con una cuenta sin permiso ve con qué correo está y puede cambiar. */
function NoAccess({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5f4] px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <Logo href="/dashboard" />
        <h1 className="mt-6 text-[22px] font-extrabold tracking-[-0.03em]">Sin acceso a la administración</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-mute">
          Has entrado como <b className="font-semibold text-ink">{email}</b>, que no está en la lista de administradores. Entra con la cuenta de administración para verla.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <form action={logoutAction}>
            <button className="h-10 rounded-full bg-deep px-5 text-[14px] font-semibold text-white hover:bg-deep-2">Cambiar de cuenta</button>
          </form>
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-full border border-line bg-white px-5 text-[14px] font-semibold text-ink-2 hover:border-faint">
            Volver al panel
          </Link>
        </div>
      </div>
    </div>
  )
}
