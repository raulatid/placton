// Programador interno: cada hora comprueba si algún espacio aún no tiene la
// medición del día y la lanza (a partir de las 7:00 de Madrid). Va apagado en
// desarrollo para no gastar API sin querer: PLACTON_SCHEDULER=1 lo enciende.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Nunca durante `next build`: compilar no debe lanzar mediciones (cuestan API).
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const on = process.env.PLACTON_SCHEDULER ? process.env.PLACTON_SCHEDULER === '1' : process.env.NODE_ENV === 'production'
  if (!on) return
  const g = globalThis as unknown as { __plactonScheduler?: boolean }
  if (g.__plactonScheduler) return
  g.__plactonScheduler = true

  const { runDaily } = await import('./lib/tracking')
  let busy = false
  const tick = async () => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date()))
    if (busy || hour < 7) return
    busy = true
    try {
      const res = await runDaily()
      if (res.started.length) console.log(`[placton] medición diaria lanzada en ${res.started.length} espacios`)
    } catch (err) {
      console.error('[placton] programador', err)
    } finally {
      busy = false
    }
  }
  // unref: los temporizadores no mantienen vivo un proceso que quiere terminar.
  setTimeout(tick, 60_000).unref()
  setInterval(tick, 60 * 60 * 1000).unref()
}
