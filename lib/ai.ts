import 'server-only'
import { structured } from './engines/openai'
import { COUNTRIES, canonicalCountry, countryFromDomain } from './countries'
import { domainKey } from './norm'
import { publicFetch, readCapped } from './netguard'

// Ayudas con IA para el alta y las sugerencias. Nada de esto mide: solo
// prepara. La medición vive en engines + extract y no se contamina con esto.

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

/** Tipo de pregunta: solo sirve para intercalarlas; no se guarda. */
const PROMPT_KINDS = ['categoria', 'calificativo', 'comparativa'] as const

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
        required: ['text', 'kind', 'topic', 'why'],
        properties: {
          text: { type: 'string', description: 'Pregunta corta y general (de 3 a 10 palabras) tal cual la escribe mucha gente en un chat de IA' },
          kind: { type: 'string', enum: [...PROMPT_KINDS], description: 'categoria: la categoría a secas; calificativo: la categoría con un calificativo o un servicio concreto; comparativa: «X vs Y» o alternativas a un líder' },
          topic: { type: 'string', description: 'Tema de 1 a 3 palabras para agrupar: la categoría, un tipo de cliente, precio, comparativas, alternativas o la ciudad' },
          why: { type: 'string', description: 'En una línea, por qué importa aparecer en esta respuesta' },
        },
      },
    },
  },
}

// Lo que más se pregunta al buscar proveedores es corto y general («What is the
// best CRM software?»). Las preguntas largas y de nicho las hace poca gente y la
// medición dice poco de la marca, así que se piden cortas, y en código se
// intercalan los tipos y se mandan al final las que se alarguen: el alta
// preselecciona las primeras y tienen que traer de todo.
const SUGGEST_INSTRUCTIONS = `Escribes las preguntas que MÁS GENTE hace a ChatGPT, Claude, Gemini o Google cuando busca proveedores de lo que vende una empresa. Vigilaremos qué marcas recomienda la IA en cada respuesta, así que valen las búsquedas frecuentes y generales, nunca los casos raros.

Cómo son:
- CORTAS: de 3 a 10 palabras, una sola idea, sin subordinadas ni listas de requisitos.
- GENERALES: la categoría con el nombre que usa la gente («CRM software», «project management tools», «personal injury lawyer», «gafas de sol»), no el eslogan ni la jerga de la marca.
- Su respuesta natural es una lista de marcas o empresas: «best…», «top…», «which… should I use?», «alternatives to…», «X vs Y».
- Más o menos la mitad como pregunta completa («What is the best CRM software?», «Which payroll software is best for small businesses?») y el resto como búsqueda corta («Best project management tools for small teams»).

Tipos («kind») y reparto aproximado para el número que se pida:
1. «categoria», como mucho 3: la categoría principal a secas, de formas de verdad distintas: «What is the best CRM software?», «Top payroll companies».
2. «calificativo», casi la mitad: la categoría con UN calificativo de los más buscados (para pequeñas empresas, para startups, para agencias, barato, gratis, para empresas grandes, para mujer, de lujo…) o un servicio concreto de la categoría: «Best project management tools for small teams», «Cheap CRM for startups», «Best car accident lawyers in Houston».
3. «comparativa», unas 3 de cada 10: «X vs Y» y alternativas, solo con líderes que todo el mundo conoce en el país (software, productos, marcas o cadenas grandes; de la lista de competidores o no): «Best Jira alternatives», «Asana vs Monday.com», «Is ClickUp better than Asana?». Nadie busca alternativas a una empresa pequeña ni a un despacho o tienda de barrio. En servicios locales (abogados, clínicas, agencias, reformas…) nadie compara por nombre: ahí ninguna «comparativa», haz más «calificativo».

Lugar: si es un negocio local (atiende en una ciudad o zona), TODAS menos una o dos llevan su ciudad principal (la región, como mucho en una), porque sin ella la IA recomienda a gente de otros sitios: «Who are the best personal injury lawyers in Houston?», «Affordable car accident lawyer in Houston», «Top marketing agencies in San Diego». Si vende en todo un país, nombra el país como mucho en una o dos y solo si suena natural. Software o tienda online sin zona: sin lugar.

Prohibido:
- Preguntas largas o con varias condiciones («…for a 50-person team with SSO and GitHub integration»).
- Nicho extremo, casos personales, cifras concretas, funciones técnicas, migraciones, dudas de cómo se hace algo y cualquier pregunta cuya respuesta no recomiende proveedores.
- Comparativas o alternativas entre negocios locales («Arash Law vs Wilshire Law Firm», «Alternatives to Smith Dental Clinic»): con despachos, clínicas, agencias o tiendas de una ciudad, cero «comparativa».
- Mencionar la marca analizada: contaminaría la medición. Los competidores sí, en comparativas y alternativas.
- Duplicados o variantes triviales: cambiar solo un sinónimo («lawyers», «attorneys», «law firms») o el orden no cuenta como otra pregunta.
- Rayas largas (—).

Antes de responder, repasa la lista: si dos preguntas piden lo mismo con otras palabras (un sinónimo, la ciudad por su región o su provincia, otro orden), cambia una por otro servicio u otro calificativo.
Dentro de cada tipo, de la más buscada a la menos; la primera «categoria» es la categoría principal a secas (con la ciudad si es local).
Escribe «text» en el idioma indicado, como lo escribiría alguien de ese mercado (en español: «¿Cuál es el mejor CRM?», «Mejores abogados de accidentes en Madrid», «Alternativas a Holded»).`

/** Más de esto ya no es una pregunta corta: se manda al final de la lista. */
const MAX_SUGGESTED_WORDS = 12

/** Intercala los tipos (categoría, calificativo, comparativa, categoría…) respetando el orden de cada uno. */
function interleaveKinds<T extends { kind?: string }>(items: T[]): T[] {
  const groups = PROMPT_KINDS.map((k) => items.filter((p) => p.kind === k))
  const out: T[] = []
  for (let i = 0; groups.some((g) => i < g.length); i++) for (const g of groups) if (g[i]) out.push(g[i])
  return [...out, ...items.filter((p) => !out.includes(p))]
}

export async function suggestPrompts(
  ctx: { brandName: string; domain: string; description: string; country: string; language: string; competitors: string[]; existing: string[] },
  count: number,
  uiLang: 'en' | 'es' = 'en',
): Promise<SuggestedPrompt[]> {
  const input = [
    `Marca (no la nombres): ${ctx.brandName}${ctx.domain ? ` (${ctx.domain})` : ''}`,
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

  // Luna con razonamiento bajo: con estas reglas cumple igual que con «medium»
  // (probado con 5 webs) y tarda 6 a 8 s en vez de 10 a 20. ≈0,001 $ por tanda.
  const { data } = await structured<{ prompts: (SuggestedPrompt & { kind?: string })[] }>({
    model: FAST,
    instructions: SUGGEST_INSTRUCTIONS,
    input,
    effort: 'low',
    schema: { name: 'prompt_set', schema: PROMPTS_SCHEMA },
    maxOutputTokens: 5000,
  })

  const seen = new Set(ctx.existing.map((e) => e.toLowerCase()))
  const brandLower = ctx.brandName.toLowerCase()
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length
  const clean = (data.prompts ?? [])
    .map((p) => ({
      // Sin rayas largas en lo que se enseña: «Jira or Linear—which…» → «Jira or Linear, which…».
      text: p.text.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim(),
      kind: p.kind,
      topic: (p.topic || 'General').trim().slice(0, 40),
      why: (p.why ?? '').replace(/\s*—\s*/g, ', ').trim().slice(0, 200),
    }))
    .filter((p) => {
      const k = p.text.toLowerCase()
      if (!p.text || seen.has(k)) return false
      if (brandLower.length >= 3 && k.includes(brandLower)) return false
      seen.add(k)
      return true
    })
  // Las cortas primero, con los tipos intercalados; las largas solo rellenan si faltan.
  const short = clean.filter((p) => words(p.text) <= MAX_SUGGESTED_WORDS)
  const long = clean.filter((p) => words(p.text) > MAX_SUGGESTED_WORDS)
  return [...interleaveKinds(short), ...long].slice(0, count).map(({ text, topic, why }) => ({ text, topic, why }))
}
