// Tarifas por millón de tokens, en USD, y coste por búsqueda web.
// Son valores CONFIGURABLES, no un dato en vivo de cada proveedor: sirven para
// estimar el coste cuando el proveedor no lo da. Por OpenRouter se apunta el
// coste real de cada llamada (usage.cost), así que esto solo cuenta en las
// llamadas directas a cada API. Tarifas de OpenRouter comprobadas el 18-10-2026.

export const TOKEN_RATES: Record<string, { in: number; out: number }> = {
  'gpt-5.6-sol': { in: 4, out: 20 },
  'gpt-5.6-luna': { in: 0.2, out: 1.2 },
  'gpt-5.4': { in: 2.5, out: 15 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-nano': { in: 0.2, out: 1.25 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  sonar: { in: 1, out: 1 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'grok-4': { in: 3, out: 15 },
  'grok-4.3': { in: 1.25, out: 2.5 },
}

/** USD por búsqueda web hecha por el modelo (no por respuesta). */
export const SEARCH_RATES: Record<string, number> = {
  openai: 0.01,
  anthropic: 0.01,
  perplexity: 0.005,
  google: 0.035,
  xai: 0.025,
}

const DEFAULT_RATE = { in: 1.25, out: 10 }

/** Tarifa de un modelo; admite el nombre de OpenRouter («openai/gpt-5.6-luna», «anthropic/claude-haiku-5.5»). */
function rateOf(model: string): { in: number; out: number } {
  const id = (model.split('/').pop() ?? model).split(':')[0]
  return TOKEN_RATES[id] ?? TOKEN_RATES[id.replace(/(\d)\.(\d)/g, '$1-$2')] ?? DEFAULT_RATE
}

export function tokenCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = rateOf(model)
  return (inputTokens / 1e6) * rate.in + (outputTokens / 1e6) * rate.out
}

export function usd(n: number): string {
  if (n === 0) return '0 $'
  if (n < 0.01) return `${n.toFixed(4)} $`
  return `${n.toFixed(2)} $`
}
