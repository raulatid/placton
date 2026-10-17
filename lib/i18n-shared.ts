// Idiomas de Placton. Inglés por defecto; español con el selector. Los textos
// van en pares (inglés, español) junto al código que los usa: así ninguna
// pantalla se queda a medio traducir.

export type Lang = 'en' | 'es'
export const LANGS: Lang[] = ['en', 'es']
export const DEFAULT_LANG: Lang = 'en'
export const LANG_COOKIE = 'placton_lang'

export type T = (en: string, es: string) => string

export function makeT(lang: Lang): T {
  return (en, es) => (lang === 'es' ? es : en)
}

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'es'
}

export function locale(lang: Lang): string {
  return lang === 'es' ? 'es-ES' : 'en-US'
}

/** Texto guardado en los dos idiomas (ideas, auditorías). */
export interface Bi {
  en: string
  es: string
}

export function bi(en: string, es: string): Bi {
  return { en, es }
}

export function pick(v: Bi | string | null | undefined, lang: Lang): string {
  if (!v) return ''
  if (typeof v === 'string') {
    if (v.startsWith('{')) {
      try {
        const o = JSON.parse(v) as Bi
        return o[lang] ?? o.en ?? ''
      } catch {
        return v
      }
    }
    return v
  }
  return v[lang] ?? v.en
}
