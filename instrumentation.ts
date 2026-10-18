// Programador interno: cada hora lanza la medición semanal de los espacios que
// la tengan pendiente (a partir de las 7:00 de Madrid), envía los avisos de la
// prueba gratis y vigila el DNS; cada 2 minutos mueve la campaña de correo.
// Va apagado en desarrollo para no gastar API sin
// querer: PLACTON_SCHEDULER=1 lo enciende.

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
  const { runLifecycle } = await import('./lib/lifecycle')
  const { watchProcess } = await import('./lib/monitor')
  watchProcess()
  let busy = false
  const tick = async () => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date()))
    // Avisos de la prueba y vigilancia del DNS: a cualquier hora.
    void runLifecycle()
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
  // Tras un despliegue, las mediciones que el reinicio cortó se completan solas.
  setTimeout(async () => {
    try {
      const { resumeInterrupted } = await import('./lib/tracking')
      const ws = resumeInterrupted()
      if (ws.length) console.log(`[placton] mediciones reanudadas tras reiniciar: ${ws.join(', ')}`)
    } catch (err) {
      console.error('[placton] reanudar', err)
    }
  }, 5_000).unref()
  // unref: los temporizadores no mantienen vivo un proceso que quiere terminar.
  setTimeout(tick, 60_000).unref()
  setInterval(tick, 60 * 60 * 1000).unref()
  // Campaña de correo: cada 2 minutos (no envía nada mientras esté parada en el panel).
  const { outreachTick } = await import('./lib/outreach/engine')
  setInterval(() => void outreachTick(), 2 * 60 * 1000).unref()
}

/** Errores de cualquier página o API: se guardan y se avisa al administrador. */
export async function onRequestError(err: unknown, request: { path: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { reportError } = await import('./lib/monitor')
  reportError(err, request.path)
}
