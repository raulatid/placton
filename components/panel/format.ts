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
  'Este espacio no tiene un plan Agencia activo.': "This workspace doesn't have an active Agency plan.",
  'No se ha podido cambiar el plan ahora mismo. Inténtalo de nuevo en unos minutos o escríbenos.': "We couldn't change the plan right now. Try again in a few minutes or contact us.",
  'No se ha podido cambiar la renovación ahora mismo. Inténtalo de nuevo o escríbenos.': "We couldn't change the renewal right now. Try again or contact us.",
  'No se ha podido cobrar la diferencia. Revisa tu tarjeta en «Facturas y método de pago» y vuelve a intentarlo.': "We couldn't charge the difference. Check your card under «Invoices and payment method» and try again.",
  'Tienes marcas cliente en tu plan Agencia. Bórralas antes de cambiar a otro plan.': 'You have client brands on your Agency plan. Delete them before switching to another plan.',
  'Tienes más clientes creados que ese número. Borra alguno antes.': 'You have more clients than that number. Delete some first.',
  'Tienes más clientes creados que los que eliges. Borra alguno o elige más.': 'You have more clients than you selected. Delete some or choose more.',
  'Tu suscripción Agencia no está activa. Elige el plan de nuevo para reactivarla.': 'Your Agency subscription is not active. Choose the plan again to reactivate it.',
  'Tus clientes tienen más prompts activos que esa bolsa. Pausa algunos antes.': 'Your clients have more active prompts than that pool. Pause some first.',
  'Tus clientes ya tienen más prompts activos que esa bolsa. Pausa algunos o elige más.': 'Your clients already have more active prompts than that pool. Pause some or choose more.',
  'Has usado todos los clientes de tu plan. Añade más aquí.': 'You have used all the clients in your plan. Add more here.',
  'Tu bolsa de prompts está agotada. Añade más antes de crear otro cliente.': 'Your prompt pool is used up. Add more prompts before creating another client.',
  'No hemos podido cancelar la suscripción en Stripe. No se ha borrado nada: inténtalo de nuevo o escríbenos.': "We couldn't cancel the subscription in Stripe. Nothing was deleted: try again or contact us.",
}

/**
 * Mensaje de error que llega en la dirección (?error=…): solo se enseñan los de
 * Placton; cualquier otro texto (alguien que manipula el enlace) se cambia por uno genérico.
 */
export function urlMessage(msg: string, lang: Lang): string {
  if (msg in LIB_EN) return libMessage(msg, lang)
  if (Object.values(LIB_EN).includes(msg)) return lang === 'es' ? (Object.keys(LIB_EN).find((k) => LIB_EN[k] === msg) ?? msg) : msg
  return lang === 'es' ? 'Algo no ha salido bien. Inténtalo de nuevo o escríbenos.' : 'Something went wrong. Please try again or contact us.'
}

/** Traduce al inglés un mensaje conocido de lib/; si no lo conoce, lo deja tal cual. */
export function libMessage(msg: string, lang: Lang): string {
  return lang === 'es' ? msg : (LIB_EN[msg] ?? msg)
}
