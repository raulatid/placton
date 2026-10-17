import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { DEFAULT_LANG, isLang, LANG_COOKIE, makeT, type Lang, type T } from './i18n-shared'

export * from './i18n-shared'

/** Idioma de la petición: cookie elegida por la persona; si no, inglés. */
export const getLang = cache(async (): Promise<Lang> => {
  const store = await cookies()
  const v = store.get(LANG_COOKIE)?.value
  if (isLang(v)) return v
  // Sin elección previa, el inglés manda (es el idioma por defecto del producto).
  void (await headers())
  return DEFAULT_LANG
})

export async function getT(): Promise<{ lang: Lang; t: T }> {
  const lang = await getLang()
  return { lang, t: makeT(lang) }
}
