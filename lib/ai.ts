import 'server-only'
import { structured } from './engines/openai'
import { COUNTRIES, canonicalCountry, countryFromDomain } from './countries'
import { domainKey } from './norm'
import { publicFetch, readCapped } from './netguard'

// Ayudas con IA para el alta y las sugerencias. Nada de esto mide: solo
// prepara. La medición vive en engines + extract y no se contamina con esto.

const SMART = process.env.PLACTON_SMART_MODEL || 'gpt-5.6-sol'
// Luna: con búsqueda en internet cumple el «Zero Data Retention» de la cuenta de
// OpenRouter (gpt-5.4-mini con búsqueda no, y el onboarding fallaba en producción).
const FAST = process.env.PLACTON_FAST_MODEL || 'gpt-5.6-luna'

export interface SitePeek {
  url: string
  title: string
  description: string
  h1: string
  lang: string
  text: string
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PlactonBot/1.0'

export function normalizeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Descarga una página pública (nunca la red interna), con un máximo de 1,5 MB. */
export async function fetchPage(url: string, timeoutMs = 12000): Promise<{ status: number; html: string; finalUrl: string; ms: number; headers: Headers } | null> {
  const started = Date.now()
  try {
    const got = await publicFetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6' },
      timeoutMs,
    })
    if (!got) return null
    const body = await readCapped(got.res, 1_500_000)
    return { status: got.res.status, html: (body ?? Buffer.alloc(0)).toString('utf8'), finalUrl: got.url, ms: Date.now() - started, headers: got.res.headers }
  } catch {
    return null
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

export function pageText(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function metaContent(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  return decode(tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim()
}

export async function peekSite(rawUrl: string): Promise<SitePeek | null> {
  const url = normalizeUrl(rawUrl)
  if (!url) return null
  const page = await fetchPage(url)
  if (!page || page.status >= 400) return null
  const html = page.html
  return {
    url: page.finalUrl,
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim(),
    description: metaContent(html, 'description') || metaContent(html, 'og:description'),
    h1: pageText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ''),
    lang: (html.match(/<html[^>]*\blang=["']?([a-zA-Z-]+)/i)?.[1] ?? '').slice(0, 2).toLowerCase(),
    text: pageText(html).slice(0, 6000),
  }
}

/* ───────────── Alta: entender la marca ───────────── */

export interface BrandProfile {
  brandName: string
  description: string
  country: string
  language: string
  competitors: { name: string; domain: string }[]
}

const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brandName', 'description', 'country', 'language', 'competitors'],
  properties: {
    brandName: { type: 'string', description: 'Nombre comercial de la marca, tal y como lo usa ella' },
    description: { type: 'string', description: 'Qué vende y a quién, en una o dos frases sencillas' },
    country: { type: 'string', description: `País principal donde vende, uno de: ${COUNTRIES.map((c) => c.value).join(', ')}` },
    language: { type: 'string', description: 'Código ISO de dos letras del idioma de sus clientes' },
    competitors: {
      type: 'array',
      description: 'Entre 4 y 6 competidores directos reales: empresas que un cliente compararía con esta marca',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'domain'],
        properties: {
          name: { type: 'string', description: 'Solo el nombre comercial, sin enlaces, sin dominio y sin markdown' },
          domain: { type: 'string', description: 'Dominio web, sin https ni rutas' },
        },
      },
    },
  },
}

/**
 * La búsqueda web a veces devuelve el nombre con su cita pegada en markdown:
 * «Páginas Amarillas ([paginasamarillas.es](https://…))». Se queda solo el nombre.
 */
export function cleanName(raw: string): string {
  return raw
    .replace(/\(\s*\[[^\]]*\]\([^)]*\)\s*\)?/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\(?https?:\/\/\S+\)?/g, '')
    .replace(/\(\s*(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\s*\)/gi, '')
    .replace(/[()\[\]]/g, (m, i, str) => (/\([^)]*\)/.test(str) ? m : ''))
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;:·-]+$/, '')
    .trim()
}

export async function analyzeBrand(site: SitePeek, hintName: string, uiLang: 'en' | 'es' = 'en'): Promise<BrandProfile> {
  const input = [
    `Web: ${site.url}`,
    hintName ? `Nombre indicado por el cliente: ${hintName}` : '',
    `Título: ${site.title}`,
    `Descripción: ${site.description}`,
    `H1: ${site.h1}`,
    `Idioma declarado: ${site.lang || 'desconocido'}`,
    '',
    `Texto de la portada:\n${site.text}`,
  ]
    .filter(Boolean)
    .join('\n')

  const { data } = await structured<BrandProfile>({
    model: FAST,
    instructions: `Eres analista de mercado. A partir de la portada de una web, identifica la marca, qué vende, dónde vende y quiénes son sus competidores directos. Busca en internet para confirmar competidores reales del mismo mercado y tamaño parecido; no inventes empresas. Si es un negocio local, los competidores son de su misma zona. Escribe «description» en ${uiLang === 'es' ? 'español' : 'inglés'} y «country» en español (p. ej. «España», «Estados Unidos»).`,
    input,
    webSearch: true,
    effort: 'low',
    schema: { name: 'brand_profile', schema: PROFILE_SCHEMA },
    maxOutputTokens: 3000,
  })
  const own = domainKey(site.url)
  return {
    brandName: (data.brandName || hintName || own).trim().slice(0, 80),
    description: (data.description ?? '').trim().slice(0, 400),
    country: canonicalCountry(data.country) ?? countryFromDomain(domainKey(site.url), data.language || site.lang || ''),
    language: (data.language || site.lang || 'es').trim().slice(0, 2).toLowerCase(),
    competitors: (data.competitors ?? [])
      .map((c) => ({ name: cleanName(c.name).slice(0, 80), domain: domainKey(c.domain ?? '') }))
      .filter((c) => c.name && c.domain !== own)
      .slice(0, 6),
  }
}

/* ───────────── Prompts sugeridos ───────────── */

export interface SuggestedPrompt {
  text: string
  topic: string
  why: string
}

const PROMPTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prompts'],
  properties: {
    prompts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'topic', 'why'],
        properties: {
          text: { type: 'string', description: 'La pregunta tal cual la escribiría una persona en un chat de IA' },
          topic: { type: 'string', description: 'Tema corto de 1 a 3 palabras para agrupar (p. ej. «Precios», «Comparativas», «Cerca de mí»)' },
          why: { type: 'string', description: 'En una línea, por qué importa aparecer en esta respuesta' },
        },
      },
    },
  },
}

export async function suggestPrompts(
  ctx: { brandName: string; domain: string; description: string; country: string; language: string; competitors: string[]; existing: string[] },
  count: number,
  uiLang: 'en' | 'es' = 'en',
): Promise<SuggestedPrompt[]> {
  const input = [
    `Marca: ${ctx.brandName}${ctx.domain ? ` (${ctx.domain})` : ''}`,
    `Qué vende: ${ctx.description}`,
    `Mercado: ${ctx.country}. Idioma de las preguntas («text»): ${ctx.language}`,
    `Idioma de «topic» y «why»: ${uiLang === 'es' ? 'español' : 'inglés'}`,
    ctx.competitors.length ? `Competidores: ${ctx.competitors.join(', ')}` : '',
    ctx.existing.length ? `Ya se siguen estas preguntas (no repitas ni hagas variantes):\n- ${ctx.existing.join('\n- ')}` : '',
    '',
    `Genera exactamente ${count} preguntas distintas.`,
  ]
    .filter(Boolean)
    .join('\n')

  const { data } = await structured<{ prompts: SuggestedPrompt[] }>({
    model: SMART,
    instructions: `Reconstruyes cómo pregunta la GENTE REAL a ChatGPT, Claude o Google cuando busca lo que vende una empresa. Son las preguntas cuya respuesta queremos vigilar.

Reglas:
- Escribe como un humano con prisa: frases naturales, sin jerga de marketing ni palabras clave apelmazadas.
- Cubre todo el recorrido de compra: descubrir opciones («mejores…», «recomiéndame…»), comparar («X o Y», «alternativas a…»), decidir (precio, contratar, cerca de mí) y problemas previos a la compra.
- NO menciones nunca la marca analizada: contaminaría la medición. Sí puedes nombrar competidores en preguntas de comparación.
- Ancla al país o la ciudad cuando tenga sentido, pero no en todas.
- Nada de duplicados ni variantes triviales.`,
    input,
    effort: 'medium',
    schema: { name: 'prompt_set', schema: PROMPTS_SCHEMA },
    maxOutputTokens: 6000,
  })

  const seen = new Set(ctx.existing.map((e) => e.toLowerCase()))
  const brandLower = ctx.brandName.toLowerCase()
  return (data.prompts ?? [])
    .map((p) => ({ text: p.text.trim(), topic: (p.topic || (uiLang === 'es' ? 'General' : 'General')).trim().slice(0, 40), why: (p.why ?? '').trim().slice(0, 200) }))
    .filter((p) => {
      const k = p.text.toLowerCase()
      if (!p.text || seen.has(k)) return false
      if (brandLower.length >= 3 && k.includes(brandLower)) return false
      seen.add(k)
      return true
    })
    .slice(0, count)
}
