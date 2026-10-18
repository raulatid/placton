'use client'

import { useEffect, useState } from 'react'
import { cx } from '../ui'

// «En vivo» del panel de administración: quién está ahora mismo en la web y en la
// aplicación, qué página mira, de dónde viene y cuánto lleva. Se actualiza cada 5 s.

interface Person {
  kind: 'web' | 'app'
  path: string
  ref: string
  utm: string
  lang: string
  device: string
  seconds: number
  pages: number
  email?: string
  workspace?: string
}
interface Data {
  at: number
  now: Person[]
  series: { minute: number; web: number; app: number }[]
  last30: { visitors: number; views: number; pages: { path: string; n: number }[]; signups: number }
}

const DEVICE: Record<string, string> = { movil: 'Móvil', tablet: 'Tableta', ordenador: 'Ordenador' }
const APP_BLUE = '#2a78d6'
const WEB_GREEN = '#00a38c'

function duration(s: number): string {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

function country(lang: string): string {
  const region = lang.split('-')[1]?.toUpperCase()
  if (!region) return lang || 'Sin dato'
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(region) ?? region
  } catch {
    return region
  }
}

export function LiveNow() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/admin/live', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const d = (await res.json()) as Data
        if (alive) {
          setData(d)
          setError(false)
        }
      } catch {
        if (alive) setError(true)
      }
    }
    void load()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 5_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [])

  const people = data?.now ?? []
  const web = people.filter((p) => p.kind === 'web')
  const app = people.filter((p) => p.kind === 'app')
  const max = Math.max(1, ...(data?.series ?? []).map((s) => s.web + s.app))
  const signing = web.filter((p) => /^\/(signup|login)/.test(p.path)).length

  return (
    <div className="card overflow-hidden">
      <div className="grid gap-px bg-line-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div className="bg-white p-5">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-mute">
            <span className="relative flex h-2.5 w-2.5">
              <span className={cx('absolute inline-flex h-full w-full rounded-full opacity-60', people.length > 0 && 'animate-ping')} style={{ background: WEB_GREEN }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: people.length ? WEB_GREEN : '#cfdad7' }} />
            </span>
            Personas ahora
          </div>
          <div className="mt-2 text-[40px] font-extrabold leading-none tracking-[-0.04em] text-ink num">{data ? people.length : '·'}</div>
          <div className="mt-2 text-[12px] text-mute">{error ? 'Sin conexión con el servidor; reintentando…' : 'Activas en el último minuto. Se actualiza cada 5 segundos.'}</div>
        </div>
        <Mini label="En la web" value={web.length} dot={WEB_GREEN} foot={signing ? `${signing} en el alta o el acceso` : 'Web pública, alta y acceso'} />
        <Mini label="En la aplicación" value={app.length} dot={APP_BLUE} foot="Clientes con sesión iniciada" />
        <Mini label="Últimos 30 minutos" value={data?.last30.visitors ?? 0} foot={`${data?.last30.views ?? 0} páginas vistas · ${data?.last30.signups ?? 0} registros`} />
      </div>

      {/* Actividad por minuto */}
      <div className="border-t border-line-2 px-5 pb-4 pt-4">
        <div className="mb-2 flex items-center justify-between text-[12px] text-mute">
          <span>Personas activas por minuto (últimos 30)</span>
          <span className="flex items-center gap-3">
            <Legend color={WEB_GREEN} label="Web" />
            <Legend color={APP_BLUE} label="Aplicación" />
          </span>
        </div>
        <div className="flex h-16 items-end gap-[3px]">
          {(data?.series ?? Array.from({ length: 30 }, (_, i) => ({ minute: i, web: 0, app: 0 }))).map((s) => (
            <div key={s.minute} className="flex h-full flex-1 flex-col justify-end" title={`${s.web} en la web · ${s.app} en la aplicación`}>
              <div style={{ height: `${(s.app / max) * 100}%`, background: APP_BLUE }} className="rounded-t-[2px]" />
              <div style={{ height: `${(s.web / max) * 100}%`, background: WEB_GREEN }} className={cx(!s.app && 'rounded-t-[2px]')} />
              {!s.web && !s.app && <div className="h-[2px] rounded bg-[#e6ecea]" />}
            </div>
          ))}
        </div>
      </div>

      {/* Quién está ahora */}
      <div className="border-t border-line-2">
        {people.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">
                  <th className="py-2.5 pl-5 text-left font-semibold">Dónde</th>
                  <th className="py-2.5 pl-3 text-left font-semibold">Quién o de dónde viene</th>
                  <th className="py-2.5 pl-3 text-left font-semibold">Dispositivo</th>
                  <th className="py-2.5 pl-3 text-left font-semibold">País</th>
                  <th className="py-2.5 pl-3 text-right font-semibold">Páginas</th>
                  <th className="py-2.5 pl-3 pr-5 text-right font-semibold">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={i} className="border-b border-line-2 last:border-0">
                    <td className="max-w-[280px] py-2.5 pl-5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.kind === 'app' ? APP_BLUE : WEB_GREEN }} />
                        <span className="truncate font-medium text-ink">{p.path}</span>
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate py-2.5 pl-3 text-ink-2">
                      {p.kind === 'app' ? (
                        <>
                          {p.email}
                          {p.workspace && <span className="text-mute"> · {p.workspace}</span>}
                        </>
                      ) : p.utm ? (
                        `Campaña: ${p.utm}`
                      ) : (
                        p.ref || 'Directo'
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-ink-2">{DEVICE[p.device] ?? p.device}</td>
                    <td className="py-2.5 pl-3 text-ink-2">{country(p.lang)}</td>
                    <td className="py-2.5 pl-3 text-right num text-ink-2">{p.pages}</td>
                    <td className="py-2.5 pl-3 pr-5 text-right num text-ink-2">{duration(p.seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-5 text-center text-[13px] text-mute">{data ? 'Ahora mismo no hay nadie en la web ni en la aplicación.' : 'Cargando…'}</p>
        )}
      </div>

      {!!data?.last30.pages.length && (
        <div className="border-t border-line-2 px-5 py-3 text-[12px] text-mute">
          Más vistas en 30 minutos: {data.last30.pages.map((p) => `${p.path} (${p.n})`).join(' · ')}
        </div>
      )}
    </div>
  )
}

function Mini({ label, value, foot, dot }: { label: string; value: number; foot: string; dot?: string }) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-mute">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      <div className="mt-2 text-[28px] font-extrabold leading-none tracking-[-0.035em] text-ink num">{value}</div>
      <div className="mt-2 text-[12px] text-mute">{foot}</div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
