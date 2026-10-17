import 'server-only'
import { resolve4 } from 'node:dns/promises'
import { all, nowIso, one, run, today } from './db'
import { appUrl, sendEmail } from './email'
import { reportError } from './monitor'
import * as repo from './repo'

// Tareas de cada hora además de la medición:
// 1) avisos de la prueba gratis (2 días antes y el día que termina);
// 2) vigilancia del DNS: la raíz placton.tech apunta con un registro A a la IP
//    de Railway (un CNAME ocultaba los MX del correo). Si Railway cambia esa IP,
//    se corrige sola en Cloudflare.

export async function runLifecycle() {
  try {
    trialEmails()
  } catch (err) {
    reportError(err, 'lifecycle:prueba')
  }
  try {
    await dnsGuard()
  } catch (err) {
    reportError(err, 'lifecycle:dns')
  }
  try {
    const { fillMissingDomains } = await import('./brandDomain')
    await fillMissingDomains()
  } catch (err) {
    reportError(err, 'lifecycle:webs de competidores')
  }
  try {
    await costSnapshots()
  } catch (err) {
    reportError(err, 'lifecycle:gasto')
  }
  try {
    retention()
  } catch (err) {
    reportError(err, 'lifecycle:retención')
  }
}

/** Plazos de la política de privacidad: lo que caduca se borra. */
function retention() {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
  run('DELETE FROM page_views WHERE createdAt < ?', [ago(365)])
  run('DELETE FROM error_log WHERE createdAt < ?', [ago(365)])
  run('DELETE FROM email_log WHERE createdAt < ?', [ago(365)])
  run('DELETE FROM contact_messages WHERE createdAt < ?', [ago(730)])
  run('DELETE FROM signup_log WHERE createdAt < ?', [ago(30)])
  run('DELETE FROM sessions WHERE expiresAt < ?', [new Date().toISOString()])
  run('DELETE FROM password_resets WHERE expiresAt < ?', [new Date().toISOString()])
}

/**
 * Foto del gasto real cada hora: lo acumulado por la clave de OpenRouter (la
 * diferencia entre días es el gasto real de cada día, para el panel de
 * administración) y el saldo de DataForSEO, con un aviso al día si baja de 10 $
 * (sin saldo, la medición de Google AI se queda sin datos).
 */
async function costSnapshots() {
  const { dataForSeoBalance, openRouterData } = await import('./admin/external')
  const day = today()
  const save = (source: string, value: number) =>
    run('INSERT INTO cost_snapshots (day, source, value, updatedAt) VALUES (?, ?, ?, ?) ON CONFLICT (day, source) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt', [day, source, value, nowIso()])
  const or = await openRouterData(true)
  if (or) save('openrouter', or.total)
  const dfs = await dataForSeoBalance(true)
  if (!dfs) return
  save('dataforseo', dfs.balance)
  const LOW = Number(process.env.PLACTON_DATAFORSEO_LOW || 10)
  if (dfs.balance >= LOW || one('SELECT 1 AS x FROM cost_snapshots WHERE day = ? AND source = ?', [day, 'aviso-dataforseo'])) return
  save('aviso-dataforseo', dfs.balance)
  for (const to of (process.env.PLACTON_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    await sendEmail({
      to,
      subject: `Placton: saldo bajo en DataForSEO (${dfs.balance.toFixed(2)} $)`,
      kind: 'aviso-saldo',
      title: 'Queda poco saldo en DataForSEO',
      body: `Quedan ${dfs.balance.toFixed(2)} $. Sin saldo, la medición de Google AI Overviews se queda sin datos. Recarga en app.dataforseo.com.`,
      cta: { label: 'Ver el panel de administración', url: `${appUrl()}/admin` },
      lang: 'es',
    })
  }
}

function ownerOf(wsId: number) {
  return repo.membersOf(wsId).find((m) => m.role === 'owner')
}

function trialEmails() {
  const now = Date.now()
  const rows = all<{ id: number; trialEndsAt: string | null; trialReminderAt: string | null; trialEndedMailAt: string | null; language: string; brandName: string; name: string }>(
    "SELECT id, trialEndsAt, trialReminderAt, trialEndedMailAt, language, brandName, name FROM workspaces WHERE plan = 'trial' AND onboarded = 1 AND billingOwnerId IS NULL AND trialEndsAt IS NOT NULL",
  )
  for (const w of rows) {
    const ends = new Date(w.trialEndsAt!).getTime()
    const owner = ownerOf(w.id)
    if (!owner) continue
    const es = w.language === 'es'
    const brand = w.brandName || w.name
    const cta = { label: es ? 'Elegir un plan' : 'Choose a plan', url: `${appUrl()}/dashboard/plans` }
    if (!w.trialReminderAt && ends > now && ends - now <= 2 * 86_400_000) {
      run('UPDATE workspaces SET trialReminderAt = ? WHERE id = ?', [nowIso(), w.id])
      void sendEmail({
        to: owner.email,
        subject: es ? 'Tu prueba de Placton termina en 2 días' : 'Your Placton trial ends in 2 days',
        kind: 'prueba-2d',
        title: es ? `Hola, ${owner.firstName || ''}`.trim() : `Hi ${owner.firstName || 'there'}`,
        body: es
          ? `Tu prueba gratis de Placton para ${brand} termina en 2 días. Elige un plan para seguir midiendo cada semana qué dicen las IA de tu marca y de tu competencia. No perderás nada de lo medido.`
          : `Your free Placton trial for ${brand} ends in 2 days. Choose a plan to keep tracking every week what AI says about your brand and your competitors. You won't lose any of your data.`,
        cta,
        lang: es ? 'es' : 'en',
      })
    } else if (!w.trialEndedMailAt && ends <= now) {
      run('UPDATE workspaces SET trialEndedMailAt = ? WHERE id = ?', [nowIso(), w.id])
      void sendEmail({
        to: owner.email,
        subject: es ? 'Tu prueba de Placton ha terminado' : 'Your Placton trial has ended',
        kind: 'prueba-fin',
        title: es ? 'Tu prueba ha terminado' : 'Your trial has ended',
        body: es
          ? `La prueba gratis de ${brand} ha terminado y hemos parado las mediciones. Tus datos siguen guardados: elige un plan y volvemos a medir enseguida.`
          : `The free trial for ${brand} has ended and tracking is paused. Your data is safe: choose a plan and tracking starts again right away.`,
        cta,
        lang: es ? 'es' : 'en',
      })
    }
  }
}

async function dnsGuard() {
  const token = process.env.CLOUDFLARE_DNS_TOKEN
  const target = process.env.PLACTON_RAILWAY_TARGET // p. ej. 0xycth5e.up.railway.app
  const host = new URL(process.env.PLACTON_URL || 'http://localhost').hostname
  if (!token || !target || host === 'localhost') return
  const ips = await resolve4(target)
  if (!ips.length) return
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const zone = (await (await fetch(`https://api.cloudflare.com/client/v4/zones?name=${host}`, { headers: H })).json()).result?.[0]
  if (!zone) return
  const rec = (await (await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?type=A&name=${host}`, { headers: H })).json()).result?.[0]
  if (!rec || ips.includes(rec.content)) return
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${rec.id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ content: ips[0] }),
  })
  reportError(new Error(`DNS: ${host} apuntaba a ${rec.content} y Railway ahora usa ${ips[0]}. ${res.ok ? 'Corregido en Cloudflare.' : 'No se pudo corregir.'}`), 'dns')
}
