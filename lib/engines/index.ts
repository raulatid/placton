import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { responses } from './openai'
import { openRouter, openRouterReady } from './openrouter'
import { SEARCH_RATES, tokenCost } from '../pricing'

// Una «plataforma» es la IA que pregunta un usuario de verdad. Cada adaptador
// imita a ese usuario. REGLA DE ORO (heredada de GEO Radar): al lanzar el prompt
// no se menciona jamás la marca del cliente ni se pide formato. Cualquier
// instrucción contaminaría la medición y la dejaría sin valor.

export type PlatformId = 'chatgpt' | 'claude' | 'google' | 'perplexity' | 'grok'

export interface Platform {
  id: PlatformId
  name: string
  short: string
  /** Color de la marca en gráficas e insignias. */
  color: string
  model: string
  available: boolean
  /** Por dónde se pregunta: API directa del proveedor u OpenRouter. */
  via: 'directo' | 'openrouter' | 'dataforseo'
  /** Qué hace falta para activarla, si no está disponible. */
  missing?: string
}

export interface AskResult {
  text: string
  citations: { url: string; title: string }[]
  searchQueries: string[]
  model: string
  costUsd: number
  /** true si la plataforma no dio respuesta (p. ej. Google sin AI Overview). */
  empty: boolean
}

export interface AskContext {
  country: string
  language: string
  signal?: AbortSignal
}

const env = (k: string) => (process.env[k] ?? '').trim()

// Modelos en OpenRouter (slug «proveedor/modelo»). Configurables por entorno.
const OR_MODELS = {
  chatgpt: () => env('PLACTON_OR_CHATGPT_MODEL') || 'openai/gpt-5.6-luna',
  claude: () => env('PLACTON_OR_CLAUDE_MODEL') || 'anthropic/claude-haiku-5.5',
  google: () => env('PLACTON_OR_GEMINI_MODEL') || 'google/gemini-2.5-flash',
  perplexity: () => env('PLACTON_OR_PERPLEXITY_MODEL') || 'perplexity/sonar',
  grok: () => env('PLACTON_OR_GROK_MODEL') || 'x-ai/grok-4.3',
}

/** PLACTON_PROVIDER=openrouter fuerza a pasar todo por OpenRouter. */
function forceOpenRouter(): boolean {
  return env('PLACTON_PROVIDER') === 'openrouter' && openRouterReady()
}

export function platforms(): Platform[] {
  const or = openRouterReady()
  const dataforseo = Boolean(env('DATAFORSEO_LOGIN') && env('DATAFORSEO_PASSWORD'))
  const gemini = Boolean(env('GEMINI_API_KEY'))
  const openaiDirect = Boolean(env('OPENAI_API_KEY')) && !forceOpenRouter()
  const anthropicDirect = Boolean(env('ANTHROPIC_API_KEY')) && !forceOpenRouter()
  return [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      short: 'GPT',
      color: '#10a37f',
      model: openaiDirect ? env('PLACTON_CHATGPT_MODEL') || 'gpt-5.6-luna' : OR_MODELS.chatgpt(),
      via: openaiDirect ? 'directo' : 'openrouter',
      available: openaiDirect || or,
      missing: 'OPENAI_API_KEY u OPENROUTER_API_KEY',
    },
    {
      id: 'claude',
      name: 'Claude',
      short: 'Cl',
      color: '#d97757',
      model: anthropicDirect ? env('PLACTON_CLAUDE_MODEL') || 'claude-haiku-5-5' : OR_MODELS.claude(),
      via: anthropicDirect ? 'directo' : 'openrouter',
      available: anthropicDirect || or,
      missing: 'ANTHROPIC_API_KEY u OPENROUTER_API_KEY',
    },
    {
      id: 'google',
      name: 'Google AI',
      short: 'G',
      color: '#4285f4',
      // El AI Overview real (DataForSEO) es lo más fiel; Gemini con búsqueda es el respaldo.
      model: dataforseo ? 'ai-overview' : gemini && !forceOpenRouter() ? 'gemini-2.5-flash' : OR_MODELS.google(),
      via: dataforseo ? 'dataforseo' : gemini && !forceOpenRouter() ? 'directo' : 'openrouter',
      available: dataforseo || gemini || or,
      missing: 'DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD, GEMINI_API_KEY u OPENROUTER_API_KEY',
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      short: 'Px',
      color: '#20808d',
      model: env('PERPLEXITY_API_KEY') && !forceOpenRouter() ? env('PLACTON_PERPLEXITY_MODEL') || 'sonar' : OR_MODELS.perplexity(),
      via: env('PERPLEXITY_API_KEY') && !forceOpenRouter() ? 'directo' : 'openrouter',
      available: Boolean(env('PERPLEXITY_API_KEY')) || or,
      missing: 'PERPLEXITY_API_KEY u OPENROUTER_API_KEY',
    },
    {
      id: 'grok',
      name: 'Grok',
      short: 'Gk',
      color: '#111111',
      model: env('XAI_API_KEY') && !forceOpenRouter() ? env('PLACTON_GROK_MODEL') || 'grok-4' : OR_MODELS.grok(),
      via: env('XAI_API_KEY') && !forceOpenRouter() ? 'directo' : 'openrouter',
      available: Boolean(env('XAI_API_KEY')) || or,
      missing: 'XAI_API_KEY u OPENROUTER_API_KEY',
    },
  ]
}

export function platformById(id: string): Platform | undefined {
  return platforms().find((p) => p.id === id)
}

export function availablePlatformIds(): PlatformId[] {
  return platforms()
    .filter((p) => p.available)
    .map((p) => p.id)
}

/** Las plataformas que mide un espacio: las que eligió y además están activas. */
export function enginesFor(selected: string[]): PlatformId[] {
  const avail = availablePlatformIds()
  const chosen = selected.filter((id): id is PlatformId => (avail as string[]).includes(id))
  return chosen.length ? chosen : avail
}

export async function ask(platform: Platform, prompt: string, ctx: AskContext): Promise<AskResult> {
  if (!platform.available) throw new Error(`${platform.name} no está activada (falta ${platform.missing})`)
  if (platform.via === 'openrouter') return askViaOpenRouter(platform, prompt, ctx)
  switch (platform.id) {
    case 'chatgpt':
      return askChatGPT(platform, prompt, ctx)
    case 'claude':
      return askClaude(platform, prompt, ctx)
    case 'google':
      return platform.model === 'ai-overview' ? askGoogleOverview(prompt, ctx) : askGemini(prompt, ctx)
    case 'perplexity':
      return askPerplexity(platform, prompt, ctx)
    case 'grok':
      return askGrok(platform, prompt, ctx)
  }
}

/* ───────────── Cualquier plataforma vía OpenRouter ───────────── */

async function askViaOpenRouter(p: Platform, prompt: string, ctx: AskContext): Promise<AskResult> {
  const res = await openRouter({
    model: p.model,
    input: prompt,
    // Perplexity busca siempre por su cuenta; al resto se le activa su búsqueda nativa.
    webSearch: p.id !== 'perplexity',
    // La búsqueda nativa de Grok lee ~100.000 tokens por pregunta (0,19-0,23 $ medidos el
    // 16-10-2026); con Exa son ~0,02 $. PLACTON_GROK_SEARCH=native vuelve a la nativa.
    searchEngine: p.id === 'grok' && env('PLACTON_GROK_SEARCH') !== 'native' ? 'exa' : 'native',
    country: countryCode(ctx.country),
    maxOutputTokens: p.id === 'claude' ? 16000 : 4000,
    // ChatGPT razonando a fondo costaba 0,027 $ por respuesta; en «low» responde igual
    // de bien a preguntas de recomendación y cuesta bastante menos.
    effort: p.id === 'chatgpt' ? 'low' : undefined,
    signal: ctx.signal,
  })
  const text = p.id === 'perplexity' ? res.text.replace(/\[\d+\]/g, '').trim() : res.text
  return { text, citations: res.citations, searchQueries: [], model: res.model, costUsd: res.costUsd, empty: !text }
}

/* ───────────── ChatGPT (OpenAI Responses + búsqueda web) ───────────── */

async function askChatGPT(p: Platform, prompt: string, ctx: AskContext): Promise<AskResult> {
  const res = await responses({
    model: p.model,
    input: prompt,
    webSearch: true,
    country: countryCode(ctx.country),
    effort: 'low',
    maxOutputTokens: 2000,
    signal: ctx.signal,
  })
  const searches = Math.max(1, res.searchQueries.length)
  return {
    text: res.text,
    citations: res.citations,
    searchQueries: res.searchQueries,
    model: p.model,
    costUsd: tokenCost(p.model, res.inputTokens, res.outputTokens) + searches * SEARCH_RATES.openai,
    empty: !res.text.trim(),
  }
}

/* ───────────── Claude (Messages API + web search del servidor) ───────────── */

let anthropicClient: Anthropic | null = null
function anthropic(): Anthropic {
  anthropicClient ??= new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 2 })
  return anthropicClient
}

const COUNTRY_CODES: Record<string, string> = {
  España: 'ES',
  México: 'MX',
  Argentina: 'AR',
  Colombia: 'CO',
  Chile: 'CL',
  Perú: 'PE',
  'Estados Unidos': 'US',
  'Reino Unido': 'GB',
  Francia: 'FR',
  Alemania: 'DE',
  Italia: 'IT',
  Portugal: 'PT',
}

export function countryCode(country: string): string {
  return COUNTRY_CODES[country] ?? 'ES'
}

async function askClaude(p: Platform, prompt: string, ctx: AskContext): Promise<AskResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }]
  let text = ''
  const citations: AskResult['citations'] = []
  const seen = new Set<string>()
  const searchQueries: string[] = []
  const consulted: AskResult['citations'] = []
  let costUsd = 0

  // La búsqueda web corre en el servidor de Anthropic; si su bucle interno se
  // alarga devuelve `pause_turn` y basta con reenviar el turno para que siga.
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await anthropic().beta.messages.create(
      {
        model: p.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        tools: [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 4,
            user_location: { type: 'approximate', country: countryCode(ctx.country) },
          },
        ],
        messages,
      },
      { signal: ctx.signal },
    )

    const usage = response.usage
    costUsd += tokenCost(p.model, usage.input_tokens, usage.output_tokens)
    costUsd += (usage.server_tool_use?.web_search_requests ?? 0) * SEARCH_RATES.anthropic

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text
        for (const c of block.citations ?? []) {
          if (c.type === 'web_search_result_location' && c.url && !seen.has(c.url)) {
            seen.add(c.url)
            citations.push({ url: c.url, title: c.title ?? '' })
          }
        }
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === 'web_search_result' && r.url) consulted.push({ url: r.url, title: r.title ?? '' })
        }
      } else if (block.type === 'server_tool_use' && block.name === 'web_search') {
        const q = (block.input as { query?: string })?.query
        if (q) searchQueries.push(q)
      }
    }

    if (response.stop_reason === 'refusal') break
    if (response.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] })
  }

  // Claude no siempre ancla citas en el texto; entonces cuentan las páginas que
  // leyó para responder (las primeras de cada búsqueda), sin repetir.
  if (!citations.length) {
    for (const c of consulted) {
      if (!seen.has(c.url)) {
        seen.add(c.url)
        citations.push(c)
      }
      if (citations.length >= 10) break
    }
  }
  return { text: text.trim(), citations, searchQueries, model: p.model, costUsd, empty: !text.trim() }
}

/* ───────────── Google AI Overviews (DataForSEO) ───────────── */

const LOCATION_CODES: Record<string, number> = {
  ES: 2724,
  MX: 2484,
  AR: 2032,
  CO: 2170,
  CL: 2152,
  PE: 2604,
  US: 2840,
  GB: 2826,
  FR: 2250,
  DE: 2276,
  IT: 2380,
  PT: 2620,
}

interface DfsReference {
  url?: string
  title?: string
}
interface DfsItem {
  type: string
  markdown?: string
  text?: string
  references?: DfsReference[]
  items?: DfsItem[]
}

async function askGoogleOverview(prompt: string, ctx: AskContext): Promise<AskResult> {
  try {
    return await askGoogleOverviewOnce(prompt, ctx)
  } catch (err) {
    // DataForSEO devuelve a veces «Internal SE Server Error»: un segundo intento suele bastar.
    await new Promise((r) => setTimeout(r, 3000))
    if (ctx.signal?.aborted) throw err
    return askGoogleOverviewOnce(prompt, ctx)
  }
}

async function askGoogleOverviewOnce(prompt: string, ctx: AskContext): Promise<AskResult> {
  const auth = Buffer.from(`${env('DATAFORSEO_LOGIN')}:${env('DATAFORSEO_PASSWORD')}`).toString('base64')
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      {
        keyword: prompt.slice(0, 700),
        location_code: LOCATION_CODES[countryCode(ctx.country)] ?? 2724,
        language_code: ctx.language || 'es',
        device: 'desktop',
        depth: 10,
        load_async_ai_overview: true,
      },
    ]),
    signal: ctx.signal,
  })
  if (!res.ok) throw new Error(`DataForSEO ${res.status}`)
  const json = (await res.json()) as {
    cost?: number
    tasks?: { status_code: number; status_message: string; result?: { items?: DfsItem[] }[] }[]
  }
  const task = json.tasks?.[0]
  if (!task || task.status_code !== 20000) throw new Error(`DataForSEO: ${task?.status_message ?? 'sin respuesta'}`)
  const overview = task.result?.[0]?.items?.find((i) => i.type === 'ai_overview')
  const costUsd = json.cost ?? 0.004
  if (!overview) {
    return { text: '', citations: [], searchQueries: [prompt], model: 'ai-overview', costUsd, empty: true }
  }

  const citations: AskResult['citations'] = []
  const seen = new Set<string>()
  const addRef = (r: DfsReference) => {
    if (r.url && !seen.has(r.url)) {
      seen.add(r.url)
      citations.push({ url: r.url, title: r.title ?? '' })
    }
  }
  overview.references?.forEach(addRef)
  overview.items?.forEach((it) => it.references?.forEach(addRef))

  const raw = overview.markdown || overview.items?.map((i) => i.markdown || i.text || '').join('\n\n') || ''
  // Los enlaces de cita en línea ([[1]](url)) solo meten ruido en el texto.
  const text = raw.replace(/\[\[\d+\]\]\([^)]*\)/g, '').replace(/`/g, '').trim()
  return { text, citations, searchQueries: [prompt], model: 'ai-overview', costUsd, empty: !text }
}

/* ───────────── Google Gemini con búsqueda (alternativa) ───────────── */

async function askGemini(prompt: string, ctx: AskContext): Promise<AskResult> {
  const model = 'gemini-2.5-flash'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
    signal: ctx.signal,
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] }
      groundingMetadata?: { webSearchQueries?: string[]; groundingChunks?: { web?: { uri?: string; title?: string } }[] }
    }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const cand = json.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  const citations = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ url: c.web?.uri ?? '', title: c.web?.title ?? '' }))
    .filter((c) => c.url)
  const queries = cand?.groundingMetadata?.webSearchQueries ?? []
  return {
    text,
    citations,
    searchQueries: queries,
    model,
    costUsd:
      tokenCost(model, json.usageMetadata?.promptTokenCount ?? 0, json.usageMetadata?.candidatesTokenCount ?? 0) +
      (queries.length ? SEARCH_RATES.google : 0),
    empty: !text,
  }
}

/* ───────────── Perplexity (Sonar) ───────────── */

async function askPerplexity(p: Platform, prompt: string, ctx: AskContext): Promise<AskResult> {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('PERPLEXITY_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: 'user', content: prompt }],
      web_search_options: { user_location: { country: countryCode(ctx.country) } },
    }),
    signal: ctx.signal,
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    citations?: string[]
    search_results?: { url?: string; title?: string }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = (json.choices?.[0]?.message?.content ?? '').replace(/\[\d+\]/g, '').trim()
  const fromResults = (json.search_results ?? []).filter((r) => r.url).map((r) => ({ url: r.url!, title: r.title ?? '' }))
  const citations = fromResults.length ? fromResults : (json.citations ?? []).map((url) => ({ url, title: '' }))
  return {
    text,
    citations,
    searchQueries: [],
    model: p.model,
    costUsd: tokenCost(p.model, json.usage?.prompt_tokens ?? 0, json.usage?.completion_tokens ?? 0) + SEARCH_RATES.perplexity,
    empty: !text,
  }
}

/* ───────────── Grok (xAI, Responses con búsqueda web) ───────────── */

async function askGrok(p: Platform, prompt: string, ctx: AskContext): Promise<AskResult> {
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('XAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: p.model, input: prompt, tools: [{ type: 'web_search' }] }),
    signal: ctx.signal,
  })
  if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as {
    output?: { type: string; content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[] }[]
    citations?: string[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  let text = ''
  const citations: AskResult['citations'] = []
  const seen = new Set<string>()
  let searches = 0
  for (const item of json.output ?? []) {
    if (item.type === 'web_search_call') searches++
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) text += part.text
      for (const a of part.annotations ?? []) {
        if (a.url && !seen.has(a.url)) {
          seen.add(a.url)
          citations.push({ url: a.url, title: a.title ?? '' })
        }
      }
    }
  }
  for (const url of json.citations ?? []) {
    if (!seen.has(url)) {
      seen.add(url)
      citations.push({ url, title: '' })
    }
  }
  return {
    text: text.trim(),
    citations,
    searchQueries: [],
    model: p.model,
    costUsd: tokenCost(p.model, json.usage?.input_tokens ?? 0, json.usage?.output_tokens ?? 0) + searches * SEARCH_RATES.xai,
    empty: !text.trim(),
  }
}
