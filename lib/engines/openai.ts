// Cliente mínimo de la Responses API por fetch. Sin SDK: una dependencia menos
// y control total sobre timeouts y reintentos.

export interface ResponsesOptions {
  model: string
  input: string
  instructions?: string
  webSearch?: boolean
  /** Código de país ISO para que la búsqueda web responda como desde allí. */
  country?: string
  effort?: 'none' | 'low' | 'medium' | 'high'
  /** Esquema JSON estricto para respuesta estructurada. */
  schema?: { name: string; schema: Record<string, unknown> }
  maxOutputTokens?: number
  signal?: AbortSignal
}

export interface UrlCitation {
  url: string
  title: string
}

export interface ResponsesResult {
  text: string
  inputTokens: number
  outputTokens: number
  citations: UrlCitation[]
  searchQueries: string[]
  model: string
  /** Coste real en USD cuando lo da el proveedor (OpenRouter). Por la API directa no viene y se estima con tokenCost. */
  costUsd?: number
}

export class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new OpenAIError('Falta OPENAI_API_KEY en .env.local', 0)
  return key
}

/** Errores que merecen otro intento: límite de cuota y caídas puntuales. */
function retryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500
}

export async function responses(opts: ResponsesOptions): Promise<ResponsesResult> {
  // Sin clave de OpenAI (o forzado), la misma petición va por OpenRouter.
  if ((!process.env.OPENAI_API_KEY || process.env.PLACTON_PROVIDER === 'openrouter') && process.env.OPENROUTER_API_KEY) {
    const { openRouter } = await import('./openrouter')
    const r = await openRouter({
      model: opts.model.includes('/') ? opts.model : `openai/${opts.model}`,
      input: opts.input,
      instructions: opts.instructions,
      webSearch: opts.webSearch,
      country: opts.country,
      schema: opts.schema,
      maxOutputTokens: opts.maxOutputTokens,
      effort: opts.effort,
      signal: opts.signal,
    })
    return { text: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens, citations: r.citations, searchQueries: [], model: r.model, costUsd: r.costUsd }
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    input: opts.input,
  }
  if (opts.instructions) body.instructions = opts.instructions
  if (opts.webSearch) body.tools = [opts.country ? { type: 'web_search', user_location: { type: 'approximate', country: opts.country } } : { type: 'web_search' }]
  if (opts.effort) body.reasoning = { effort: opts.effort }
  if (opts.maxOutputTokens) body.max_output_tokens = opts.maxOutputTokens
  if (opts.schema) {
    body.text = {
      format: {
        type: 'json_schema',
        name: opts.schema.name,
        strict: true,
        schema: opts.schema.schema,
      },
    }
  }

  let lastError: OpenAIError | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    let res: Response
    try {
      res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
    } catch (err) {
      if (opts.signal?.aborted) throw err
      lastError = new OpenAIError(`Red: ${(err as Error).message}`, 0)
      continue
    }

    if (!res.ok) {
      const detail = await res.text()
      lastError = new OpenAIError(`OpenAI ${res.status}: ${detail.slice(0, 400)}`, res.status)
      if (!retryable(res.status)) throw lastError
      continue
    }

    const json = (await res.json()) as OpenAIResponse
    return parse(json, opts.model)
  }
  throw lastError ?? new OpenAIError('OpenAI no respondió', 0)
}

interface OpenAIResponse {
  usage?: { input_tokens?: number; output_tokens?: number }
  output?: {
    type: string
    action?: { type?: string; query?: string }
    content?: {
      type: string
      text?: string
      annotations?: { type: string; url?: string; title?: string }[]
    }[]
  }[]
}

function parse(json: OpenAIResponse, model: string): ResponsesResult {
  let text = ''
  const citations: UrlCitation[] = []
  const searchQueries: string[] = []
  const seen = new Set<string>()

  for (const item of json.output ?? []) {
    if (item.type === 'web_search_call' && item.action?.query) {
      searchQueries.push(item.action.query)
    }
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) text += part.text
      for (const ann of part.annotations ?? []) {
        if (ann.type !== 'url_citation' || !ann.url || seen.has(ann.url)) continue
        seen.add(ann.url)
        citations.push({ url: ann.url, title: ann.title ?? '' })
      }
    }
  }

  return {
    text: text.trim(),
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    citations,
    searchQueries,
    model,
  }
}

/** Igual que `responses` pero devolviendo el JSON ya parseado del esquema. */
export async function structured<T>(
  opts: ResponsesOptions & { schema: { name: string; schema: Record<string, unknown> } },
): Promise<{ data: T; inputTokens: number; outputTokens: number; costUsd?: number }> {
  const res = await responses(opts)
  let data: T
  try {
    data = JSON.parse(res.text) as T
  } catch {
    throw new OpenAIError(`Respuesta no era JSON válido: ${res.text.slice(0, 200)}`, 0)
  }
  return { data, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsd: res.costUsd }
}
