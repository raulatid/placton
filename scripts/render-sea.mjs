// Renderiza la superficie del mar de la portada (public/landing/sea-N.webp):
// océano en perspectiva con horizonte, reflejo del cielo (Fresnel), brillos del
// sol y bruma en la distancia. Arriba del horizonte es transparente para que se
// vea el degradado de la portada. Uso: node scripts/render-sea.mjs
// Al cambiarlo, sube SEA_VERSION aquí y en components/marketing/SeaScene.tsx
// (el nombre nuevo obliga al navegador a bajarlo otra vez).
import sharp from 'sharp'

const SEA_VERSION = 2

const W = 3200
const H = 760
const SS = 2 // supermuestreo por eje
const HORIZON = Math.round(H * 0.2)
const F = W * 0.9 // focal
const CAM_H = 2.6

// Colores a juego con el degradado de la portada a esa altura
const HORIZON_COL = [178, 228, 231]
const ZENITH_COL = [96, 176, 222]
const WATER_COL = [38, 150, 178]
const DEEP_COL = [22, 112, 150]

let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)

// Olas: la marejada larga viene hacia la cámara; las ondas cortas van en todas
// direcciones, como el rizo que levanta el viento.
const WAVES = []
const N = 44
for (let i = 0; i < N; i++) {
  const L = 42 * Math.pow(0.86, i) // longitud de onda
  const k = (2 * Math.PI) / L
  const spread = 0.9 + (i / N) * 5.4
  const theta = (rnd() - 0.5) * spread
  const steep = 0.065 * (0.6 + rnd() * 0.7)
  WAVES.push({ L, k, dx: Math.sin(theta), dz: Math.cos(theta), a: steep / k, phi: rnd() * Math.PI * 2 })
}

const sun = (() => {
  const v = [0.08, 0.22, 1]
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
})()

const mix = (a, b, t) => a + (b - a) * t
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

const out = Buffer.alloc(W * H * 4)
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    let r = 0, g = 0, b = 0, al = 0
    for (let oy = 0; oy < SS; oy++) {
      for (let ox = 0; ox < SS; ox++) {
        const sx = px + (ox + 0.5) / SS
        const sy = py + (oy + 0.5) / SS
        const yv = (sy - HORIZON) / F
        if (yv <= 0) continue
        const xv = (sx - W / 2) / F
        const t = CAM_H / yv
        const X = xv * t
        const Z = t
        const foot = t / F // tamaño del píxel en el agua
        let hx = 0, hz = 0
        for (const w of WAVES) {
          const fade = smooth(2.5, 7, w.L / foot) // sin ondas más finas que el píxel
          if (fade <= 0) continue
          const c = Math.cos(w.k * (w.dx * X + w.dz * Z) + w.phi) * w.a * w.k * fade
          hx += c * w.dx
          hz += c * w.dz
        }
        // normal
        let nx = -hx, ny = 1, nz = -hz
        const nl = Math.hypot(nx, ny, nz)
        nx /= nl; ny /= nl; nz /= nl
        // rayo de la cámara
        let dx = xv, dy = -yv, dz = 1
        const dl = Math.hypot(dx, dy, dz)
        dx /= dl; dy /= dl; dz /= dl
        const dn = dx * nx + dy * ny + dz * nz
        const rx = dx - 2 * dn * nx, ry = Math.max(0, dy - 2 * dn * ny), rz = dz - 2 * dn * nz
        const fres = 0.02 + 0.98 * Math.pow(1 - clamp(-dn), 5)
        const sk = Math.pow(clamp(ry), 0.55)
        const sky = [0, 1, 2].map((i) => mix(HORIZON_COL[i], ZENITH_COL[i], sk))
        const depth = clamp(ny * 1.2 - 0.2)
        const water = [0, 1, 2].map((i) => mix(DEEP_COL[i], WATER_COL[i], depth))
        let col = [0, 1, 2].map((i) => mix(water[i], sky[i], fres))
        const rs = clamp(rx * sun[0] + ry * sun[1] + rz * sun[2])
        const spec = Math.pow(rs, 900) * 2.2 + Math.pow(rs, 80) * 0.12
        col = col.map((c) => c + 255 * spec)
        const haze = 1 - Math.exp(-t * 0.0105)
        col = col.map((c, i) => mix(c, HORIZON_COL[i], haze * 0.9))
        const a = clamp((sy - HORIZON) / 2.5)
        r += col[0] * a; g += col[1] * a; b += col[2] * a; al += a
      }
    }
    const n = SS * SS
    const o = (py * W + px) * 4
    // color premultiplicado → normal
    out[o] = al ? Math.min(255, r / al) : 0
    out[o + 1] = al ? Math.min(255, g / al) : 0
    out[o + 2] = al ? Math.min(255, b / al) : 0
    out[o + 3] = Math.round((al / n) * 255)
  }
}

const file = new URL(`../public/landing/sea-${SEA_VERSION}.webp`, import.meta.url).pathname
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 82, alphaQuality: 90 }).toFile(file)
console.log('ok', file, { W, H, HORIZON })
