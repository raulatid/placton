import { bi, type Bi } from '@/lib/i18n-shared'

// Tipos y motivos del formulario de contacto. Van en un módulo neutro (ni de
// cliente ni de servidor) para usarlos en la página, en el formulario y en la
// acción del servidor.

export type ContactField = 'name' | 'email' | 'topic' | 'message'

export interface ContactState {
  status: 'idle' | 'ok' | 'error'
  message?: string
  errors?: Partial<Record<ContactField, string>>
}

export const CONTACT_TOPICS: { value: string; label: Bi }[] = [
  { value: 'sales', label: bi('Sales', 'Ventas') },
  { value: 'support', label: bi('Support', 'Soporte') },
  { value: 'billing', label: bi('Billing', 'Facturación') },
  { value: 'other', label: bi('Other', 'Otro') },
]

export function isTopic(value: string): boolean {
  return CONTACT_TOPICS.some((t) => t.value === value)
}

/** Etiqueta que se guarda con el mensaje (en español, como el resto del panel interno). */
export function storedTopic(value: string): string | null {
  return CONTACT_TOPICS.find((t) => t.value === value)?.label.es ?? null
}
