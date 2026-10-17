import 'server-only'
import { createHash } from 'node:crypto'
import { nowIso, one, run } from './db'
import { appUrl, sendEmail } from './email'

// Errores del servidor: se guardan en error_log (los ve el panel de
// administración) y se avisa por correo a las direcciones de administración,
// como mucho una vez por hora por cada error distinto.

export function reportError(err: unknown, path = '') {
  try {
    const e = err as { message?: string; stack?: string; digest?: string }
    const message = String(e?.message ?? err).slice(0, 1000)
    const firstFrame = (e?.stack ?? '').split('\n').slice(0, 2).join(' ')
    const signature = createHash('sha1').update(`${message}|${firstFrame}`).digest('hex').slice(0, 16)
    const recent = one<{ n: number }>('SELECT COUNT(*) AS n FROM error_log WHERE signature = ? AND createdAt > ?', [
      signature,
      new Date(Date.now() - 3_600_000).toISOString(),
    ])?.n
    run('INSERT INTO error_log (signature, message, path, createdAt) VALUES (?, ?, ?, ?)', [signature, message, path.slice(0, 300), nowIso()])
    if (recent) return
    for (const to of (process.env.PLACTON_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      void sendEmail({
        to,
        subject: `Placton: error en ${path || 'el servidor'}`,
        kind: 'error',
        title: 'Ha habido un error en Placton',
        body: `${message}\n\n${path ? `Ruta: ${path}` : ''}`,
        cta: { label: 'Ver el panel de administración', url: `${appUrl()}/admin` },
        lang: 'es',
      })
    }
  } catch {
    // Nunca dejar que el aviso de un error provoque otro.
  }
}

/** Promesas rechazadas sin capturar en cualquier parte del servidor. */
export function watchProcess() {
  process.on('unhandledRejection', (reason) => reportError(reason, 'unhandledRejection'))
}
