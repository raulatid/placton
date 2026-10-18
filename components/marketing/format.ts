import { locale, type Lang } from '@/lib/i18n-shared'

// Cifras y colores de mención de la web pública, sin dependencias: los usan
// tanto las piezas de servidor (viz.tsx) como las de cliente (CountUp, AnswerDemo).

export const DIRECT = '#00a38c'
export const INDIRECT = '#eb6834'

export function fmtNum(n: number, lang: Lang, digits = 0): string {
  return n.toLocaleString(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** 41% en inglés, 41 % en español. */
export function fmtPct(n: number, lang: Lang, digits = 0): string {
  return lang === 'es' ? `${fmtNum(n, lang, digits)} %` : `${fmtNum(n, lang, digits)}%`
}
