import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { publicFetch, readCapped } from './netguard'

// Logos de marca «tipo icono de app», como los de Lima: el icono grande de la
// web de la marca (apple-touch-icon o un icono de 96 px o más) a sangre en un
// cuadrado. Si la web solo tiene un favicon pequeño o un logo con fondo
// transparente, se centra sobre blanco (o sobre tinta, si el logo es blanco).
// Todo se guarda en data/logos para no volver a pedirlo.

// Junto a la base de datos: en producción, en el volumen persistente.
const DIR = path.join(process.env.PLACTON_DATA_DIR || path.join(process.cwd(), 'data'), 'logos')
const TILE = 128
const HIT_DAYS = 30
const MISS_DAYS = 3
const MAX_BYTES = 2_000_000
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

/** Marcas del panel de ejemplo de la portada: se sirven también sin sesión. */
export const PUBLIC_LOGO_DOMAINS = new Set(['asana.com', 'notion.so', 'monday.com', 'clickup.com', 'trello.com'])

export function cleanDomain(raw: string | null | undefined): string | null {
  const d = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^www\./, '')
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : null
}

// ─── Descargas seguras: solo webs públicas, nunca la red interna ───

async function safeFetch(url: string, accept: string): Promise<{ body: Buffer; type: string; url: string } | null> {
  const got = await publicFetch(url, { headers: { 'user-agent': UA, accept }, timeoutMs: 7000 })
  if (!got || !got.res.ok) return null
  const body = await readCapped(got.res, MAX_BYTES + 1)
  if (!body || body.length > MAX_BYTES) return null
  return { body, type: got.res.headers.get('content-type') ?? '', url: got.url }
}

// ─── Dónde buscar el icono ───

function iconLinks(html: string, base: string): string[] {
  const out: { url: string; size: number; apple: boolean }[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x !== undefined)
    const rel = (attr('rel') ?? '').toLowerCase()
    const href = attr('href')
    if (!href || !/\bicon\b|apple-touch-icon/.test(rel)) continue
    const sizes = (attr('sizes') ?? '').toLowerCase()
    const size = sizes === 'any' || /\.svg(\?|$)/i.test(href) ? 512 : Math.max(0, ...sizes.split(/\s+/).map((s) => Number(s.split('x')[0]) || 0))
    const apple = rel.includes('apple-touch-icon')
    try {
      out.push({ url: new URL(href, base).toString(), size: apple ? Math.max(size, 180) : size, apple })
    } catch {}
  }
  return out
    .filter((c) => c.apple || c.size >= 96)
    .sort((a, b) => Number(b.apple) - Number(a.apple) || b.size - a.size)
    .map((c) => c.url)
}

async function candidates(domain: string): Promise<string[]> {
  const list: string[] = []
  const page = (await safeFetch(`https://${domain}/`, 'text/html')) ?? (await safeFetch(`https://www.${domain}/`, 'text/html'))
  if (page && /html/i.test(page.type)) list.push(...iconLinks(page.body.toString('utf8').slice(0, 400_000), page.url))
  const origin = page ? new URL(page.url).origin : `https://${domain}`
  list.push(`${origin}/apple-touch-icon.png`)
  // Servicio de iconos de Google: el mayor que tenga de la web, y si no, el favicon.
  list.push(`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`)
  list.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`)
  return [...new Set(list)]
}

// ─── Cuadrado de 128 px, como un icono de app ───

type Px = { r: number; g: number; b: number; a: number }
const near = (p: Px, q: Px) => Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b) < 60
const whiteish = (p: Px) => p.r > 240 && p.g > 240 && p.b > 240

/** Quita el margen transparente o blanco de alrededor (no el fondo de color de un icono). */
async function trimMargin(input: Buffer): Promise<Buffer> {
  const png = await sharp(input, { density: 300 }).ensureAlpha().png().toBuffer()
  const { data } = await sharp(png).resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const corner = { r: data[0], g: data[1], b: data[2], a: data[3] }
  if (corner.a > 20 && !whiteish(corner)) return png
  try {
    return await sharp(png).trim({ threshold: 14 }).png().toBuffer()
  } catch {
    return png
  }
}

async function toTile(raw: Buffer, OUT = TILE): Promise<Buffer | null> {
  let input: Buffer
  let meta: sharp.Metadata
  try {
    input = await trimMargin(raw)
    meta = await sharp(input).metadata()
  } catch {
    return null
  }
  if (!meta.width || !meta.height || Math.max(meta.width, meta.height) < 12) return null

  // Muestra de 64 px para decidir cómo pintarlo.
  const probe = await sharp(input)
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const px = (x: number, y: number): Px => {
    const o = (y * 64 + x) * 4
    return { r: probe.data[o], g: probe.data[o + 1], b: probe.data[o + 2], a: probe.data[o + 3] }
  }
  // A sangre si es un bloque de un color (no blanco) que llena el cuadrado: opaco
  // y del mismo tono en el centro de los bordes y cerca de las esquinas. Un
  // cuadrado con esquinas redondeadas pasa; un logo suelto o redondo, no.
  const probes = [px(32, 1), px(1, 32), px(62, 32), px(32, 62), px(9, 9), px(54, 9), px(9, 54), px(54, 54)]
  const edge = probes[0]
  const fullBleed = Math.max(meta.width, meta.height) >= 64 && probes.every((p) => p.a > 235 && near(p, edge)) && !whiteish(edge)

  if (fullBleed) {
    return sharp(input)
      .resize(OUT, OUT, { fit: 'cover' })
      .flatten({ background: { r: edge.r, g: edge.g, b: edge.b } })
      .png()
      .toBuffer()
  }

  // Logo suelto: centrado sobre blanco, salvo que sea un logo blanco y fino (entonces sobre tinta).
  let lum = 0
  let n = 0
  for (let i = 0; i < probe.data.length; i += 4) {
    if (probe.data[i + 3] < 128) continue
    lum += 0.2126 * probe.data[i] + 0.7152 * probe.data[i + 1] + 0.0722 * probe.data[i + 2]
    n++
  }
  const light = n > 0 && lum / n > 240 && n / (64 * 64) < 0.55
  const bg = light ? { r: 11, g: 29, b: 33, alpha: 1 } : { r: 255, g: 255, b: 255, alpha: 1 }
  const inner = Math.round(OUT * 0.64)
  const logo = await sharp(input)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer()
  return sharp({ create: { width: OUT, height: OUT, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: 'center' }])
    .flatten({ background: bg })
    .png()
    .toBuffer()
}

/** Logo subido por el cliente: el mismo tratamiento, a 256 px para pantallas retina. */
export function uploadedLogoTile(raw: Buffer): Promise<Buffer | null> {
  return toTile(raw, 256)
}

async function fresh(file: string, days: number): Promise<boolean> {
  try {
    const s = await stat(file)
    return Date.now() - s.mtimeMs < days * 86_400_000
  } catch {
    return false
  }
}

const inflight = new Map<string, Promise<Buffer | null>>()

/** PNG de 128 px del logo de la marca, o null si su web no tiene ninguno usable. */
export async function brandLogo(domain: string, opts: { cachedOnly?: boolean } = {}): Promise<Buffer | null> {
  const file = path.join(DIR, `${domain}.png`)
  const miss = path.join(DIR, `${domain}.none`)
  if (await fresh(file, HIT_DAYS)) return readFile(file)
  if (opts.cachedOnly || (await fresh(miss, MISS_DAYS))) return null

  const running = inflight.get(domain)
  if (running) return running
  const job = (async () => {
    await mkdir(DIR, { recursive: true })
    for (const url of await candidates(domain)) {
      const got = await safeFetch(url, 'image/*')
      if (!got || /html|json|text\/plain/i.test(got.type)) continue
      const tile = await toTile(got.body).catch(() => null)
      if (!tile) continue
      await writeFile(file, tile)
      return tile
    }
    await writeFile(miss, '')
    return null
  })().finally(() => inflight.delete(domain))
  inflight.set(domain, job)
  return job
}
