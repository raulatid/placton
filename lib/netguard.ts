import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Las descargas que pide un usuario (auditoría de su web, análisis del alta,
// logos) solo pueden ir a webs públicas: nunca a la red interna del servidor
// (127.0.0.1, 10.x, 169.254.169.254, nombres internos de Railway…).

export function privateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  const v6 = ip.toLowerCase()
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')
}

export async function publicHost(host: string): Promise<boolean> {
  if (isIP(host) || !host.includes('.') || /\.(internal|local|localhost)$/i.test(host)) return false
  try {
    const addrs = await lookup(host, { all: true })
    return addrs.length > 0 && addrs.every((a) => !privateAddress(a.address))
  } catch {
    return false
  }
}

/** Lee el cuerpo hasta un máximo, sin cargar en memoria respuestas enormes. */
export async function readCapped(res: Response, maxBytes: number): Promise<Buffer | null> {
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes * 4) return null
  const reader = res.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    if (size >= maxBytes) {
      await reader.cancel().catch(() => {})
      break
    }
  }
  return Buffer.concat(chunks).subarray(0, maxBytes)
}

/**
 * fetch con redirecciones a mano: en cada salto se comprueba que el destino es
 * una web pública. Devuelve la última respuesta (también 4xx/5xx) o null.
 */
export async function publicFetch(url: string, init: { headers: Record<string, string>; timeoutMs: number }): Promise<{ res: Response; url: string } | null> {
  let current = url
  const signal = AbortSignal.timeout(init.timeoutMs)
  for (let hop = 0; hop < 5; hop++) {
    let u: URL
    try {
      u = new URL(current)
    } catch {
      return null
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || (u.port && !['80', '443', '8080', '8443'].includes(u.port)) || !(await publicHost(u.hostname))) return null
    let res: Response
    try {
      res = await fetch(u, { redirect: 'manual', headers: init.headers, signal })
    } catch {
      return null
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, u).toString()
      await res.body?.cancel().catch(() => {})
      continue
    }
    return { res, url: u.toString() }
  }
  return null
}
