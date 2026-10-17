// Cliente mínimo de OpenRouter (chat completions, compatible con OpenAI).
// Una sola clave da acceso a ChatGPT, Claude, Gemini, Perplexity y Grok, cada
// uno con su búsqueda web nativa (plugin «web» con engine «native»), y devuelve
// el coste real de cada llamada en usage.cost.

export interface OpenRouterOptions {
  model: string
  input: string
  instructions?: string
  webSearch?: boolean
  /** Buscador: el nativo del proveedor (por defecto) o Exa, mucho más barato. */
  searchEngine?: 'native' | 'exa'
  /** Código de país ISO para ubicar la búsqueda (si el proveedor lo admite). */
  country?: string
  schema?: { name: string; schema: Record<string, unknown> }
  maxOutputTokens?: number
  effort?: 'low' | 'medium' | 'high'
  signal?: AbortSignal
}

export interface OpenRouterResult {
  text: string
  citations: { url: string; title: string }[]
  inputTokens: number
  outputTokens: number
  /** Coste en USD según OpenRouter (incluye búsqueda). */
  costUsd: number
  model: string
}

export function openRouterReady(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

function retryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500
}

interface ORResponse {
  model?: string
  choices?: {
    message?: {
      content?: string | null
      annotations?: { type: string; url_citation?: { url?: string; title?: string } }[]
    }
  }[]
  citations?: string[]
  search_results?: { url?: string; title?: string }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  error?: { message?: string }
}

export async function openRouter(opts: OpenRouterOptions): Promise<OpenRouterResult> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('Falta OPENROUTER_API_KEY')

  const messages: { role: 'system' | 'user'; content: string }[] = []
  if (opts.instructions) messages.push({ role: 'system', content: opts.instructions })
  messages.push({ role: 'user', content: opts.input })

  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    usage: { include: true },
  }
  if (opts.maxOutputTokens) body.max_tokens = opts.maxOutputTokens
  if (opts.effort) body.reasoning = { effort: opts.effort }
  if (opts.webSearch) {
    const engine = opts.searchEngine ?? 'native'
    body.plugins = [{ id: 'web', engine, max_results: engine === 'exa' ? 5 : 6 }]
    if (engine === 'native') {
      body.web_search_options = {
        search_context_size: 'medium',
        ...(opts.country ? { user_location: { type: 'approximate', approximate: { country: opts.country } } } : {}),
      }
    }
  }
  if (opts.schema) {
    body.response_format = { type: 'json_schema', json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema } }
  }

  let last: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    let res: Response
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.PLACTON_URL || 'http://localhost:3490',
          'X-Title': 'Placton',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
    } catch (err) {
      if (opts.signal?.aborted) throw err
      last = new Error(`OpenRouter red: ${(err as Error).message}`)
      continue
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400)
      last = new Error(`OpenRouter ${res.status}: ${detail}`)
      if (!retryable(res.status)) throw last
      continue
    }
    const json = (await res.json()) as ORResponse
    if (json.error) throw new Error(`OpenRouter: ${json.error.message ?? 'error'}`)
    const msg = json.choices?.[0]?.message
    const citations: { url: string; title: string }[] = []
    const seen = new Set<string>()
    const add = (url?: string, title?: string) => {
      if (url && !seen.has(url)) {
        seen.add(url)
        citations.push({ url, title: title ?? '' })
      }
    }
    for (const a of msg?.annotations ?? []) if (a.type === 'url_citation') add(a.url_citation?.url, a.url_citation?.title)
    for (const r of json.search_results ?? []) add(r.url, r.title)
    for (const u of json.citations ?? []) add(u)
    return {
      text: (msg?.content ?? '').trim(),
      citations,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      costUsd: json.usage?.cost ?? 0,
      model: json.model ?? opts.model,
    }
  }
  throw last ?? new Error('OpenRouter no respondió')
}
