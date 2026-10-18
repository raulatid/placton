import 'server-only'

// Personas en vivo para el panel de administración: cada pestaña abierta manda un
// latido cada 20 segundos (/api/live). Todo vive en memoria: nada se guarda en la base
// de datos y un reinicio lo vacía (el tráfico histórico sigue en page_views).

export interface LiveEntry {
  key: string
  kind: 'web' | 'app'
  path: string
  ref: string
  utm: string
  lang: string
  device: string
  firstSeen: number
  lastSeen: number
  pages: number
  email?: string
  workspace?: string
}

const ACTIVE_MS = 60_000
const KEEP_MS = 30 * 60_000
const g = globalThis as unknown as { __plactonLive?: Map<string, LiveEntry>; __plactonLiveMin?: Map<number, Set<string>> }
const live = (g.__plactonLive ??= new Map())
// Quién estuvo activo en cada minuto, para la gráfica de los últimos 30 minutos.
const byMinute = (g.__plactonLiveMin ??= new Map())

function prune(now: number) {
  for (const [k, e] of live) if (now - e.lastSeen > KEEP_MS) live.delete(k)
  const oldest = Math.floor((now - KEEP_MS) / 60_000)
  for (const m of byMinute.keys()) if (m < oldest) byMinute.delete(m)
}

export function beat(e: Omit<LiveEntry, 'firstSeen' | 'lastSeen' | 'pages'>) {
  const now = Date.now()
  const prev = live.get(e.key)
  // Una visita nueva si llevaba más de 30 minutos sin dar señales.
  const same = prev && now - prev.lastSeen < KEEP_MS
  live.set(e.key, {
    ...e,
    ref: (same && prev.ref) || e.ref,
    utm: (same && prev.utm) || e.utm,
    firstSeen: same ? prev.firstSeen : now,
    lastSeen: now,
    pages: same ? prev.pages + (prev.path === e.path ? 0 : 1) : 1,
  })
  const minute = Math.floor(now / 60_000)
  if (!byMinute.has(minute)) byMinute.set(minute, new Set())
  byMinute.get(minute)!.add(e.key)
  if (Math.random() < 0.05) prune(now)
}

/** Cerró la pestaña: deja de contar al momento. */
export function leave(key: string) {
  const e = live.get(key)
  if (e) e.lastSeen = Date.now() - ACTIVE_MS - 1
}

export function snapshot(): { now: LiveEntry[]; series: { minute: number; web: number; app: number }[] } {
  const t = Date.now()
  prune(t)
  const now = [...live.values()].filter((e) => t - e.lastSeen <= ACTIVE_MS).sort((a, b) => a.firstSeen - b.firstSeen)
  const current = Math.floor(t / 60_000)
  const series = Array.from({ length: 30 }, (_, i) => {
    const minute = current - 29 + i
    const keys = [...(byMinute.get(minute) ?? [])]
    return { minute, web: keys.filter((k) => !k.startsWith('u:')).length, app: keys.filter((k) => k.startsWith('u:')).length }
  })
  return { now, series }
}
