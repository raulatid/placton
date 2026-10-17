const LEGAL = /\b(s\.?l\.?u?|s\.?a\.?u?|sociedad limitada|inc|llc|ltd|gmbh|bv|srl|corp|company|group|grupo)\b/g

/** Clave canónica para comparar nombres de marca escritos de mil formas. */
export function key(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,·®™©"'`]/g, '')
    .replace(LEGAL, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function domainKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
}

/** Dominio raíz para agrupar fuentes: news.example.co.uk -> example.co.uk */
export function rootDomain(url: string): string {
  const host = domainKey(url)
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const twoLevelTld = /^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'))
  return parts.slice(twoLevelTld ? -3 : -2).join('.')
}

/** Todas las formas con las que una marca puede aparecer en un texto. */
export function brandKeys(name: string, domain: string, aliases: string[]): string[] {
  const out = new Set<string>()
  const add = (v: string) => {
    const k = key(v)
    if (k.length >= 3) out.add(k)
  }
  add(name)
  aliases.forEach(add)
  if (domain) {
    const host = domainKey(domain)
    add(host)
    add(host.replace(/\.[a-z.]+$/, '')) // "vertigomkt.com" -> "vertigomkt"
  }
  return [...out]
}

/** ¿Aparece alguna de esas claves como palabra completa en el texto? */
export function containsKey(text: string, keys: string[]): string | null {
  const hay = ` ${key(text)} `
  for (const k of keys) {
    if (hay.includes(` ${k} `)) return k
    // Nombres compuestos también valen dentro de una palabra pegada (URLs, hashtags).
    if (k.length >= 6 && hay.includes(k)) return k
  }
  return null
}
