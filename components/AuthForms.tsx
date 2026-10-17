'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { forgotAction, loginAction, registerAction, resetAction, type FormState } from '@/app/(auth)/actions'
import { useT } from './LangProvider'
import { btnClass, Field, inputClass, Notice } from './ui'

function Eye({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
      {!open && <path d="M4 20 20 4" />}
    </svg>
  )
}

function PasswordInput({ name, autoComplete }: { name: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  const t = useT()
  return (
    <div className="relative">
      <input name={name} type={show ? 'text' : 'password'} required minLength={8} autoComplete={autoComplete} className={`${inputClass} pr-11`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-faint hover:text-ink"
        aria-label={show ? t('Hide password', 'Ocultar contraseña') : t('Show password', 'Mostrar contraseña')}
      >
        <Eye open={show} />
      </button>
    </div>
  )
}

function GoogleButton({ invite, next, label }: { invite?: string; next?: string; label: string }) {
  const t = useT()
  return (
    <>
      <a href={`/api/auth/google${invite ? `?invite=${encodeURIComponent(invite)}` : next ? `?next=${encodeURIComponent(next)}` : ''}`} className={btnClass('secondary', 'lg', 'w-full rounded-full')}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {label}
      </a>
      <div className="my-5 flex items-center gap-3 text-[12px] font-medium text-faint">
        <span className="h-px flex-1 bg-line" /> {t('or', 'o')} <span className="h-px flex-1 bg-line" />
      </div>
    </>
  )
}

export function RegisterForm({ google, invite, email, web }: { google: boolean; invite?: string; email?: string; web?: string }) {
  const t = useT()
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {})
  const f = state.fields ?? {}
  return (
    <>
      {google && <GoogleButton invite={invite} label={t('Sign up with Google', 'Regístrate con Google')} />}
      <form action={action} className="space-y-4">
        <input type="hidden" name="invite" value={invite ?? ''} />
        <input type="hidden" name="web_prefill" value={web ?? ''} />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('First name', 'Nombre')}>
            <input name="firstName" required autoComplete="given-name" defaultValue={f.firstName} placeholder={t('Jane', 'Lucía')} className={inputClass} />
          </Field>
          <Field label={t('Last name', 'Apellidos')}>
            <input name="lastName" autoComplete="family-name" defaultValue={f.lastName} placeholder={t('Doe', 'Martín')} className={inputClass} />
          </Field>
        </div>
        <Field label={t('Email', 'Correo')}>
          <input name="email" type="email" required autoComplete="email" defaultValue={f.email ?? email} className={inputClass} placeholder={t('you@company.com', 'tu@empresa.com')} />
        </Field>
        <Field label={t('Password', 'Contraseña')} hint={t('At least 8 characters.', 'Al menos 8 caracteres.')}>
          <PasswordInput name="password" autoComplete="new-password" />
        </Field>
        {state.error && <Notice tone="bad">{state.error}</Notice>}
        <button type="submit" disabled={pending} className={btnClass('primary', 'lg', 'w-full rounded-full')}>
          {pending ? t('Creating your account…', 'Creando tu cuenta…') : t('Sign up', 'Crear cuenta')}
        </button>
        <p className="text-center text-[12px] leading-relaxed text-mute">
          {t('By signing up you agree to our', 'Al crear la cuenta aceptas los')}{' '}
          <Link href="/terms" className="underline">
            {t('terms', 'términos')}
          </Link>{' '}
          {t('and', 'y la')}{' '}
          <Link href="/privacy" className="underline">
            {t('privacy policy', 'política de privacidad')}
          </Link>
          . {t('Placton is a service for businesses and professionals.', 'Placton es un servicio para empresas y profesionales.')}
        </p>
      </form>
    </>
  )
}

export function LoginForm({ google, invite, next }: { google: boolean; invite?: string; next?: string }) {
  const t = useT()
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {})
  return (
    <>
      {google && <GoogleButton invite={invite} next={next} label={t('Log in with Google', 'Entra con Google')} />}
      <form action={action} className="space-y-4">
        <input type="hidden" name="invite" value={invite ?? ''} />
        <input type="hidden" name="next" value={next ?? ''} />
        <Field label={t('Email', 'Correo')}>
          <input name="email" type="email" required autoComplete="email" defaultValue={state.fields?.email} className={inputClass} placeholder={t('you@company.com', 'tu@empresa.com')} />
        </Field>
        <div>
          <Field label={t('Password', 'Contraseña')}>
            <PasswordInput name="password" autoComplete="current-password" />
          </Field>
          <Link href="/forgot-password" className="mt-1.5 inline-block text-[12.5px] font-semibold text-brand hover:underline">
            {t('Forgot your password?', '¿Has olvidado la contraseña?')}
          </Link>
        </div>
        {state.error && <Notice tone="bad">{state.error}</Notice>}
        <button type="submit" disabled={pending} className={btnClass('primary', 'lg', 'w-full rounded-full')}>
          {pending ? t('Logging in…', 'Entrando…') : t('Log in', 'Entrar')}
        </button>
      </form>
    </>
  )
}

export function ForgotForm() {
  const t = useT()
  const [state, action, pending] = useActionState<FormState, FormData>(forgotAction, {})
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Notice tone="good">{state.ok}</Notice>
        {state.link && (
          <p className="break-all text-[12px] text-mute">
            {t('Email is not configured in this environment. Direct link:', 'Correo sin configurar en este entorno. Enlace directo:')}{' '}
            <a className="font-semibold text-brand underline" href={state.link}>
              {state.link}
            </a>
          </p>
        )}
      </div>
    )
  }
  return (
    <form action={action} className="space-y-4">
      <Field label={t('Your account email', 'Correo de tu cuenta')}>
        <input name="email" type="email" required autoComplete="email" defaultValue={state.fields?.email} className={inputClass} />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={btnClass('primary', 'lg', 'w-full rounded-full')}>
        {pending ? t('Sending…', 'Enviando…') : t('Send me the link', 'Enviarme el enlace')}
      </button>
    </form>
  )
}

export function ResetForm({ token }: { token: string }) {
  const t = useT()
  const [state, action, pending] = useActionState<FormState, FormData>(resetAction, {})
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label={t('New password', 'Contraseña nueva')} hint={t('At least 8 characters.', 'Al menos 8 caracteres.')}>
        <PasswordInput name="password" autoComplete="new-password" />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={btnClass('primary', 'lg', 'w-full rounded-full')}>
        {pending ? t('Saving…', 'Guardando…') : t('Save and log in', 'Guardar y entrar')}
      </button>
    </form>
  )
}
