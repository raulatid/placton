'use client'

import { useActionState } from 'react'
import { useT } from '@/components/LangProvider'
import { Select } from '@/components/panel/Select'
import { btnClass, Field, Notice, textareaClass } from '@/components/ui'
import { helpContactAction } from './actions'

export function HelpContactForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState<{ ok?: string; error?: string }, FormData>(helpContactAction, {})
  const t = useT()
  if (state.ok) return <Notice tone="good">{state.ok}</Notice>
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="email" value={email} />
      <Field label={t('Topic', 'Motivo')}>
        {/* El valor llega en español al correo de soporte; solo cambia la etiqueta. */}
        <Select
          name="topic"
          label={t('Topic', 'Motivo')}
          defaultValue="Soporte"
          className="w-full"
          options={[
            { value: 'Soporte', label: t('Support', 'Soporte') },
            { value: 'Facturación', label: t('Billing', 'Facturación') },
            { value: 'Sugerencia', label: t('Suggestion', 'Sugerencia') },
            { value: 'Otro', label: t('Other', 'Otro') },
          ]}
        />
      </Field>
      <Field label={t('Message', 'Mensaje')}>
        <textarea name="message" rows={5} required className={textareaClass} placeholder={t('Tell us what you need', 'Cuéntanos qué necesitas')} />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <button className={btnClass('primary', 'md', 'w-full')} disabled={pending}>
        {pending ? t('Sending…', 'Enviando…') : t('Send', 'Enviar')}
      </button>
    </form>
  )
}
