import { locale, type Lang } from '@/lib/i18n-shared'

// Formato del panel según el idioma: decimales, comillas y los mensajes que
// lib/ devuelve en español (Stripe, medición, contraseñas).

/** Número con un decimal: 2.3 en inglés, 2,3 en español. */
export function dec1(n: number, lang: Lang): string {
  return n.toLocaleString(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Cita textual: “…” en inglés, «…» en español. */
export function quote(text: string, lang: Lang): string {
  return lang === 'es' ? `«${text}»` : `“${text}”`
}

/** Porcentaje entero sin decimales para gráficas: 42% / 42 %. */
export function pctInt(n: number, lang: Lang): string {
  const v = Math.round(n).toLocaleString(locale(lang))
  return lang === 'es' ? `${v} %` : `${v}%`
}

const LIB_EN: Record<string, string> = {
  'La prueba gratis incluye un solo espacio. Elige un plan para crear más.': 'The free trial includes one workspace. Choose a plan to create more.',
  'Los pagos no están configurados todavía.': "Payments aren't set up yet.",
  'Stripe no devolvió la página de pago.': "Stripe didn't return the checkout page.",
  'Este espacio todavía no tiene datos de facturación.': "This workspace doesn't have billing details yet.",
  'No se pudo abrir el portal de facturación. Si persiste, escríbenos.': "We couldn't open the billing portal. If it keeps happening, contact us.",
  'No hay suscripción que cancelar.': 'There is no subscription to cancel.',
  'Espacio no encontrado': 'Workspace not found',
  'La suscripción no está activa': 'The subscription is not active',
  'No hay prompts activos': 'There are no active prompts',
  'Esta semana ya está todo medido': 'Everything has already been tracked this week',
  'La contraseña necesita al menos 8 caracteres.': 'Your password needs at least 8 characters.',
  'La contraseña es demasiado larga.': 'That password is too long.',
}

/** Traduce al inglés un mensaje conocido de lib/; si no lo conoce, lo deja tal cual. */
export function libMessage(msg: string, lang: Lang): string {
  return lang === 'es' ? msg : (LIB_EN[msg] ?? msg)
}
