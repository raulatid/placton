'use client'

import { createContext, useContext } from 'react'
import { makeT, type Lang, type T } from '@/lib/i18n-shared'

const Ctx = createContext<Lang>('en')

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>
}

export function useLang(): Lang {
  return useContext(Ctx)
}

export function useT(): T {
  return makeT(useContext(Ctx))
}
