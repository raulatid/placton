'use client'

import { BrandAvatar, PlatformDot, cx } from '../ui'
import { ENGINE_IDS } from './shared'

// La diatomea de la marca (public/icon.svg) en grande, para la primera medición.
// Todo en % del lado: anillo exterior a 47, cuentas a 22, IA a 37 y núcleo de 26.
const C = 50
const RING = 47
const BEADS = 22
const AI = 37
const CORE = 13
const ANGLES = [-90, -18, 54, 126, 198]
const rad = (deg: number) => (deg * Math.PI) / 180
const at = (r: number, deg: number) => ({ x: C + r * Math.cos(rad(deg)), y: C + r * Math.sin(rad(deg)) })

/** Cuatro arcos (uno por paso) con un hueco de 10,8° entre ellos. */
const arcAngle = (k: number) => -90 + 5.4 + k * 90

export function RunDiatom({
  name,
  domain,
  byEngine,
  current,
  done,
  total,
  leaving,
}: {
  name: string
  domain?: string
  byEngine: Record<string, number>
  current?: string
  done: number
  total: number
  leaving: boolean
}) {
  const p = leaving ? 1 : total ? Math.min(1, done / total) : 0
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-[220px] sm:w-[260px]">
      <span className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle,rgba(110,240,210,.12),transparent_68%)]" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" fill="none">
        {/* Anillo exterior: los 4 pasos */}
        {[0, 1, 2].map((k) => (
          <circle key={k} cx={C} cy={C} r={RING} pathLength={100} strokeDasharray="22 78" stroke="rgba(110,240,210,.55)" strokeWidth={0.9} strokeLinecap="round" transform={`rotate(${arcAngle(k)} ${C} ${C})`} />
        ))}
        <circle cx={C} cy={C} r={RING} pathLength={100} strokeDasharray="22 78" stroke="rgba(255,255,255,.12)" strokeWidth={0.9} strokeLinecap="round" transform={`rotate(${arcAngle(3)} ${C} ${C})`} />
        <circle
          cx={C}
          cy={C}
          r={RING}
          pathLength={100}
          strokeDasharray="22 100"
          strokeDashoffset={22 * (1 - p)}
          stroke="#6ef0d2"
          strokeWidth={0.9}
          strokeLinecap="round"
          transform={`rotate(${arcAngle(3)} ${C} ${C})`}
          className="ob-arc"
          opacity={p > 0 ? 1 : 0}
        />

        {/* Espinas del núcleo a cada IA: punteadas y, con la primera respuesta, dibujadas */}
        {ENGINE_IDS.map((id, i) => {
          const a = at(CORE + 1, ANGLES[i])
          const b = at(AI - 7, ANGLES[i])
          return (
            <g key={id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,.14)" strokeWidth={0.45} strokeDasharray="1 2" />
              {(byEngine[id] ?? 0) > 0 && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1200} stroke="#6ef0d2" strokeWidth={0.7} strokeLinecap="round" className="anim-draw" />}
            </g>
          )
        })}

        {/* Las 8 cuentas, quietas */}
        {Array.from({ length: 8 }, (_, k) => {
          const pt = at(BEADS, -90 + k * 45)
          return <circle key={k} cx={pt.x} cy={pt.y} r={k % 2 === 0 ? 1.6 : 1.15} fill="#6ef0d2" opacity={0.8} />
        })}

        {leaving && <circle cx={C} cy={C} r={RING} stroke="#6ef0d2" strokeWidth={1.4} className="ob-flash" />}
      </svg>

      {/* Núcleo con el logo de la marca */}
      <span className="absolute left-1/2 top-1/2 flex h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-deep-2 ring-1 ring-glow/40">
        <span className="sm:scale-[1.15]">
          <BrandAvatar name={name} domain={domain} size={40} />
        </span>
      </span>

      {/* Las 5 IA en pentágono: en gris hasta que contestan */}
      {ENGINE_IDS.map((id, i) => {
        const pt = at(AI, ANGLES[i])
        const n = byEngine[id] ?? 0
        return (
          <span key={id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${pt.x}%`, top: `${pt.y}%` }}>
            <span className={cx('relative block rounded-full transition-[opacity,filter] duration-500 sm:scale-[1.133]', n ? 'opacity-100' : 'opacity-35 grayscale')}>
              {current === id && <span className="live-dot absolute inset-0 rounded-full" />}
              <PlatformDot id={id} size={30} />
              {n > 0 && <span className="absolute -bottom-1 -right-2 rounded-full bg-white px-1 text-[10.5px] font-bold leading-[15px] text-deep num">{n}</span>}
            </span>
          </span>
        )
      })}
    </div>
  )
}
