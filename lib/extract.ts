import 'server-only'
import { structured } from './engines/openai'
import { tokenCost } from './pricing'
import { brandKeys, containsKey, key, rootDomain } from './norm'
import type { Sentiment, TrackedBrand } from './types'

// Leer una respuesta y sacar quién sale, en qué orden y cómo se habla de ellos.
// Dos capas: la IA lee (tono, nombre canónico) y el código decide (identidad y
// orden), comprobando contra el texto, que no opina. Heredado de GEO Radar.
//
// Directa = la respuesta nombra a la marca.
// Indirecta = no la nombra, pero cita como fuente una página de su dominio.

const MODEL = process.env.PLACTON_EXTRACT_MODEL || 'gpt-5.4-mini'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['companies'],
  properties: {
    companies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'asWritten', 'sentiment', 'quote'],
        properties: {
          name: { type: 'string', description: 'Nombre comercial canónico de la empresa, marca o producto' },
          asWritten: { type: 'string', description: 'Literal exacto tal y como aparece escrito en la respuesta' },
          sentiment: { type: 'string', enum: ['positivo', 'neutro', 'negativo'] },
          quote: { type: 'string', description: 'Frase literal de la respuesta donde se habla de ella (máx. 200 caracteres)' },
        },
      },
    },
  },
}

const INSTRUCTIONS = `Extraes datos de la respuesta de un asistente de IA a la pregunta de una persona.

Devuelve SOLO las entidades que son una respuesta posible a lo que se pregunta: empresas, marcas, productos o servicios concretos que esa persona podría acabar eligiendo, contratando o comprando.

Criterio para incluir o descartar, en orden:
1. ¿Podría quien pregunta elegir, contratar o comprar eso? Si no, fuera.
2. Descarta plataformas, canales y herramientas que se citan como MEDIO y no como opción (si alguien pregunta por una agencia, Google Ads o Instagram no son competidores de esa agencia). Lo mismo con directorios, marketplaces y medios citados solo como fuente.
3. Descarta categorías genéricas ("una agencia local", "un freelance") y organismos públicos.
4. Si la respuesta solo explica un concepto y no nombra opciones concretas, devuelve la lista vacía.

Además:
- "name" es el nombre comercial, no una URL: si aparece "seomurcia.com", el nombre es "SEO Murcia".
- "asWritten" se copia carácter a carácter de la respuesta, sin negritas ni numeración.
- El orden de la lista es el orden en que aparecen en el texto.
- Sé severo con el tono: "negativo" solo si hay una pega explícita; "positivo" solo si hay elogio o recomendación clara.`

interface ExtractedCompany {
  name: string
  asWritten: string
  sentiment: Sentiment
  quote: string
}

export interface ExtractedMention {
  brandKey: string
  name: string
  kind: 'marca' | 'competidor' | 'otro'
  competitorId: number | null
  direct: boolean
  rank: number | null
  sentiment: Sentiment
  quote: string
}

export interface Extraction {
  mentions: ExtractedMention[]
  citations: { url: string; domain: string; title: string; brandKey: string | null }[]
  costUsd: number
}

export async function extract(
  promptText: string,
  answerText: string,
  rawCitations: { url: string; title: string }[],
  brands: TrackedBrand[],
  signal?: AbortSignal,
): Promise<Extraction> {
  let companies: ExtractedCompany[] = []
  let costUsd = 0

  if (answerText.trim()) {
    try {
      const res = await structured<{ companies: ExtractedCompany[] }>({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: `PREGUNTA:\n${promptText}\n\nRESPUESTA DEL ASISTENTE:\n${answerText.slice(0, 14000)}`,
        effort: 'low',
        schema: { name: 'mentions', schema: SCHEMA },
        maxOutputTokens: 4000,
        signal,
      })
      companies = res.data.companies ?? []
      costUsd = tokenCost(MODEL, res.inputTokens, res.outputTokens)
    } catch {
      // Sin matices de la IA seguimos detectando las marcas seguidas contra el
      // texto: el dato duro nunca se pierde.
      companies = []
    }
  }

  const lowered = answerText.toLowerCase()
  const brandKeySets = brands.map((b) => ({ brand: b, keys: brandKeys(b.name, b.domain, b.aliases) }))
  const matchBrand = (name: string): TrackedBrand | null => {
    const k = key(name)
    if (!k) return null
    return brandKeySets.find((s) => s.keys.includes(k))?.brand ?? null
  }

  // Posición en el texto de cada entidad: el orden lo manda el texto.
  type Pending = { brandKey: string; name: string; tracked: TrackedBrand | null; at: number; sentiment: Sentiment; quote: string }
  const pending: Pending[] = []
  const seen = new Set<string>()

  for (const c of companies) {
    const canonical = (c.name || c.asWritten || '').trim()
    if (!canonical) continue
    const tracked = matchBrand(canonical) ?? matchBrand(c.asWritten || '')
    const bKey = tracked ? tracked.key : key(canonical)
    if (!bKey || seen.has(bKey)) continue
    seen.add(bKey)
    const literal = (c.asWritten || canonical).toLowerCase()
    const at = lowered.indexOf(literal)
    pending.push({
      brandKey: bKey,
      name: tracked ? tracked.name : canonical,
      tracked,
      at: at >= 0 ? at : Number.MAX_SAFE_INTEGER - pending.length,
      sentiment: c.sentiment ?? 'neutro',
      quote: (c.quote ?? '').slice(0, 300),
    })
  }

  // Red de seguridad: una marca seguida que aparece en el texto cuenta aunque la
  // IA no la haya listado.
  for (const { brand, keys } of brandKeySets) {
    if (seen.has(brand.key)) continue
    const hit = containsKey(answerText, keys)
    if (!hit) continue
    seen.add(brand.key)
    const at = lowered.indexOf(brand.name.toLowerCase())
    pending.push({
      brandKey: brand.key,
      name: brand.name,
      tracked: brand,
      at: at >= 0 ? at : Number.MAX_SAFE_INTEGER - 1,
      sentiment: 'neutro',
      quote: snippet(answerText, at),
    })
  }

  pending.sort((a, b) => a.at - b.at)
  const mentions: ExtractedMention[] = pending.map((p, i) => ({
    brandKey: p.brandKey,
    name: p.name,
    kind: p.tracked ? (p.tracked.own ? 'marca' : 'competidor') : 'otro',
    competitorId: p.tracked?.competitorId ?? null,
    direct: true,
    rank: i + 1,
    sentiment: p.sentiment,
    quote: p.quote,
  }))

  // Citas: a qué marca seguida pertenece cada URL.
  const domainOwner = new Map<string, TrackedBrand>()
  for (const b of brands) if (b.domain) domainOwner.set(rootDomain(b.domain), b)
  const urlSeen = new Set<string>()
  const citations = rawCitations
    .filter((c) => c.url && !urlSeen.has(c.url) && urlSeen.add(c.url))
    .map((c) => {
      const domain = rootDomain(c.url)
      return { url: c.url, domain, title: c.title.slice(0, 300), brandKey: domainOwner.get(domain)?.key ?? null }
    })

  // Menciones indirectas: marca seguida citada como fuente pero no nombrada.
  for (const b of brands) {
    if (seen.has(b.key)) continue
    if (!citations.some((c) => c.brandKey === b.key)) continue
    seen.add(b.key)
    mentions.push({
      brandKey: b.key,
      name: b.name,
      kind: b.own ? 'marca' : 'competidor',
      competitorId: b.competitorId,
      direct: false,
      rank: null,
      sentiment: 'neutro',
      quote: '',
    })
  }

  return { mentions, citations, costUsd }
}

function snippet(text: string, at: number): string {
  if (at < 0) return ''
  return text.slice(Math.max(0, at - 80), at + 160).trim()
}
