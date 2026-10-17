'use client'

import Link from 'next/link'
import { startTransition, useActionState } from 'react'
import { IconCheck } from '@/components/icons'
import { useLang, useT } from '@/components/LangProvider'
import { Field, Notice, cx, inputClass, textareaClass } from '@/components/ui'
import { pick } from '@/lib/i18n-shared'
import { CONTACT_TOPICS, type ContactState } from './contact'
import { pillDark, pillDarkLg } from './parts'

const INITIAL: ContactState = { status: 'idle' }

export function ContactForm({
  action,
  defaultTopic = '',
}: {
  action: (prev: ContactState, formData: FormData) => Promise<ContactState>
  defaultTopic?: string
}) {
  const t = useT()
  const lang = useLang()
  const [state, dispatch, pending] = useActionState(action, INITIAL)

  // Enviamos a mano para que el formulario no se vacíe si el servidor
  // devuelve un error: así no se pierde lo escrito.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    startTransition(() => dispatch(data))
  }

  if (state.status === 'ok') {
    return (
      <div className="rounded-[24px] border border-line bg-white p-6 sm:p-8" role="status">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-good-soft text-good">
          <IconCheck size={22} />
        </span>
        <h2 className="mt-5 text-[20px] font-extrabold tracking-[-0.02em] text-ink">{t('Message sent', 'Mensaje enviado')}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {t(
            'Thanks for getting in touch. We have received your message and will reply to the email address you gave us.',
            'Gracias por escribirnos. Hemos recibido tu mensaje y te responderemos al correo que nos has dejado.',
          )}
        </p>
        <Link href="/" className={cx(pillDark, 'mt-6')}>
          {t('Back to home', 'Volver al inicio')}
        </Link>
      </div>
    )
  }

  const err = state.errors ?? {}

  return (
    <form onSubmit={onSubmit} method="post" className="relative space-y-5 rounded-[24px] border border-line bg-white p-6 sm:p-8">
      {state.status === 'error' && state.message && <Notice tone="bad">{state.message}</Notice>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t('Name', 'Nombre')} error={err.name}>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            aria-invalid={Boolean(err.name) || undefined}
            className={inputClass}
          />
        </Field>
        <Field label={t('Email', 'Correo electrónico')} error={err.email}>
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(err.email) || undefined}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('Topic', 'Motivo')} error={err.topic}>
        <select
          name="topic"
          required
          defaultValue={defaultTopic}
          aria-invalid={Boolean(err.topic) || undefined}
          className={cx(inputClass, 'appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10')}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2366797d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E\")",
          }}
        >
          <option value="" disabled>
            {t('Choose a topic', 'Elige un motivo')}
          </option>
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {pick(topic.label, lang)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('Message', 'Mensaje')} error={err.message} hint={t('The more specific, the sooner we can help.', 'Cuanto más concreto, antes podremos ayudarte.')}>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          aria-invalid={Boolean(err.message) || undefined}
          className={textareaClass}
        />
      </Field>

      {/* Trampa para robots: oculta a personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
        <label>
          {t('Leave this field empty', 'No rellenes este campo')}
          <input name="company_site" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-relaxed text-mute">
          {t('We only use your details to reply to you.', 'Usaremos tus datos solo para responderte.')}{' '}
          <Link href="/privacy" className="font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
            {t('Privacy policy', 'Política de privacidad')}
          </Link>
        </p>
        <button type="submit" disabled={pending} className={cx(pillDarkLg, 'shrink-0')}>
          {pending ? t('Sending…', 'Enviando…') : t('Send message', 'Enviar mensaje')}
        </button>
      </div>
    </form>
  )
}
