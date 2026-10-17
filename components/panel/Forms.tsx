'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import {
  addCompetitorAction,
  addPromptAction,
  auditAction,
  changePasswordAction,
  deleteAccountAction,
  inviteAction,
  moreSuggestionsAction,
  removeLogoAction,
  saveEnginesAction,
  saveProfileAction,
  saveWorkspaceAction,
  uploadLogoAction,
  type ActionResult,
} from '@/app/dashboard/actions'
import { IconPlus, IconSpark } from '../icons'
import { COUNTRIES, canonicalCountry } from '@/lib/countries'
import { useT } from '../LangProvider'
import { Select } from './Select'
import { BrandAvatar, btnClass, Field, inputClass, Notice, PlatformTag, textareaClass } from '../ui'

/** Ruedita de carga para los botones mientras la acción está en marcha. */
function Spinner({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function Result({ state }: { state: ActionResult }) {
  if (state.error) return <Notice tone="bad">{state.error}</Notice>
  if (state.ok)
    return (
      <Notice tone="good">
        {state.ok}
        {state.link && <CopyLink link={state.link} />}
      </Notice>
    )
  return null
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const t = useT()
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-white px-2 py-1 text-[12px] text-ink-2">{link}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(link)
          setCopied(true)
        }}
        className="rounded-md bg-white px-2 py-1 text-[12px] font-semibold"
      >
        {copied ? t('Copied', 'Copiado') : t('Copy', 'Copiar')}
      </button>
    </div>
  )
}

export function AddPromptForm({ topics, disabled }: { topics: string[]; disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addPromptAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
        <input name="text" required minLength={8} disabled={disabled} placeholder={
            disabled
              ? t("You've reached your plan's limit", 'Has llegado al límite de tu plan')
              : t('What would your customer ask? e.g. “best online accountant for freelancers”', '¿Qué preguntaría tu cliente? p. ej. «mejor gestoría online para autónomos»')
          } className={inputClass} />
        <input name="topic" list="temas" placeholder={t('Topic', 'Tema')} disabled={disabled} className={inputClass} />
        <datalist id="temas">
          {topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button className={btnClass('primary', 'lg')} disabled={pending || disabled}>
          {pending ? <Spinner size={16} /> : <IconPlus size={16} />} {t('Add', 'Añadir')}
        </button>
      </div>
      <Result state={state} />
    </form>
  )
}

export function MoreSuggestionsButton() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<ActionResult>({})
  const t = useT()
  return (
    <div className="flex items-center gap-3">
      {msg.error && <span className="text-[12px] text-bad">{msg.error}</span>}
      <button type="button" className={btnClass('secondary', 'sm')} disabled={pending} onClick={() => start(async () => setMsg(await moreSuggestionsAction()))}>
        {pending ? <Spinner /> : <IconSpark size={15} />} <span className={pending ? 'shimmer-text' : undefined}>{pending ? t('Thinking…', 'Pensando…') : t('Suggest more', 'Sugerir más')}</span>
      </button>
    </div>
  )
}

export function AddCompetitorForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addCompetitorAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input name="name" required placeholder={t('Name', 'Nombre')} className={inputClass} />
        <input name="domain" placeholder={t('website.com', 'web.com')} className={inputClass} />
        <input name="aliases" placeholder={t('Other names, comma-separated', 'Otros nombres, separados por comas')} className={inputClass} />
        <button className={btnClass('primary', 'lg')} disabled={pending}>
          {pending ? <Spinner size={16} /> : <IconPlus size={16} />} {t('Add', 'Añadir')}
        </button>
      </div>
      <Result state={state} />
    </form>
  )
}

export function AuditForm({ defaultUrl }: { defaultUrl: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(auditAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="url" defaultValue={defaultUrl} placeholder={t('yoursite.com', 'tuweb.com')} className={inputClass} />
        <button className={btnClass('primary', 'lg')} disabled={pending}>
          {pending && <Spinner size={16} />}
          {pending ? t('Checking 18 points…', 'Revisando 18 puntos…') : t('Audit site', 'Auditar web')}
        </button>
      </div>
      {pending && (
        <div className="anim-fade h-1 overflow-hidden rounded-full bg-line-2" role="progressbar" aria-label={t('Checking 18 points…', 'Revisando 18 puntos…')}>
          <div className="indeterminate h-full w-full rounded-full bg-brand-2/70" />
        </div>
      )}
      <Result state={state} />
    </form>
  )
}

// El valor guardado sigue en español (lo leen el motor y el onboarding); solo cambia la etiqueta.
const LANGS: Record<string, { en: string; es: string }> = {
  es: { en: 'Spanish', es: 'Español' },
  en: { en: 'English', es: 'Inglés' },
  fr: { en: 'French', es: 'Francés' },
  de: { en: 'German', es: 'Alemán' },
  it: { en: 'Italian', es: 'Italiano' },
  pt: { en: 'Portuguese', es: 'Portugués' },
  ca: { en: 'Catalan', es: 'Catalán' },
}

/**
 * Logo del espacio: el icono de su web por defecto, o una imagen propia que se
 * sube aquí (se recorta sola en cuadrado). Se ve en la barra lateral y en las
 * gráficas y listas del panel.
 */
export function LogoForm({ name, domain, logo, disabled }: { name: string; domain: string; logo: string | null; disabled: boolean }) {
  const t = useT()
  const form = useRef<HTMLFormElement>(null)
  const [state, upload, uploading] = useActionState<ActionResult, FormData>(uploadLogoAction, {})
  const [removed, remove, removing] = useActionState<ActionResult, FormData>(removeLogoAction, {})
  const [last, setLast] = useState<'up' | 'rm'>('up')
  const busy = uploading || removing
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {logo ? (
          <span className="relative inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-[16px] shadow-[0_1px_2px_rgba(4,25,28,0.08)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" className="h-full w-full object-cover" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/[0.07]" />
          </span>
        ) : (
          <BrandAvatar name={name} domain={domain || undefined} size={64} />
        )}
        <div className="min-w-0 text-[13px] leading-relaxed text-mute">
          {logo
            ? t('Your own logo. It replaces the icon from your website across the dashboard.', 'Tu logo propio. Sustituye al icono de tu web en todo el panel.')
            : t("We're using the icon from your website. Upload your own if it doesn't look right.", 'Usamos el icono de tu web. Sube el tuyo si no se ve bien.')}
          <div className="text-[12px] text-faint">{t('PNG, JPG, WebP or SVG, up to 3 MB. Square works best.', 'PNG, JPG, WebP o SVG, hasta 3 MB. Mejor si es cuadrado.')}</div>
        </div>
      </div>
      <form ref={form} action={upload} className="flex flex-wrap items-center gap-2">
        <label className={btnClass('secondary', 'md', busy || disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer')}>
          {uploading && <Spinner />}
          {logo ? t('Change logo', 'Cambiar logo') : t('Upload logo', 'Subir logo')}
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/avif"
            className="sr-only"
            disabled={busy || disabled}
            onChange={(e) => {
              setLast('up')
              if (e.currentTarget.files?.length) form.current?.requestSubmit()
            }}
          />
        </label>
        {logo && (
          <button formAction={remove} onClick={() => setLast('rm')} disabled={busy || disabled} className="rounded-full px-3 py-2 text-[13px] font-semibold text-mute transition-colors hover:text-ink disabled:opacity-60">
            {removing && <Spinner />}
            {t("Use my website's icon", 'Usar el icono de mi web')}
          </button>
        )}
      </form>
      <Result state={last === 'rm' ? removed : state} />
    </div>
  )
}

export function WorkspaceForm({
  ws,
  disabled,
}: {
  ws: { name: string; brandName: string; domain: string; aliases: string[]; description: string; country: string; language: string }
  disabled: boolean
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveWorkspaceAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Workspace name', 'Nombre del espacio')}>
            <input name="name" defaultValue={ws.name} required className={inputClass} />
          </Field>
          <Field label={t('Brand we track', 'Marca que medimos')}>
            <input name="brandName" defaultValue={ws.brandName} required className={inputClass} />
          </Field>
          <Field label={t('Website', 'Web')} hint={t('Used to detect indirect mentions (when an answer cites your site).', 'Sirve para detectar menciones indirectas (cuando citan tu web).')}>
            <input name="domain" defaultValue={ws.domain} className={inputClass} />
          </Field>
          <Field
            label={t('Other brand names', 'Otros nombres de la marca')}
            hint={t('Comma-separated: acronyms, legal name, common misspellings.', 'Separados por comas: siglas, razón social, erratas frecuentes.')}
          >
            <input name="aliases" defaultValue={ws.aliases.join(', ')} className={inputClass} />
          </Field>
        </div>
        <Field label={t('What the business does', 'A qué se dedica')}>
          <textarea name="description" defaultValue={ws.description} rows={3} className={textareaClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Search country', 'País de las búsquedas')}>
            <Select name="country" label={t('Search country', 'País de las búsquedas')} defaultValue={canonicalCountry(ws.country) ?? ws.country} className="w-full" options={COUNTRIES.map((c) => ({ value: c.value, label: t(c.en, c.value) }))} />
          </Field>
          <Field label={t('Language', 'Idioma')}>
            <Select name="language" label={t('Language', 'Idioma')} defaultValue={ws.language} className="w-full" options={Object.entries(LANGS).map(([k, v]) => ({ value: k, label: t(v.en, v.es) }))} />
          </Field>
        </div>
        <Result state={state} />
        <button className={btnClass('primary')} disabled={pending}>
          {pending && <Spinner />}
          {t('Save changes', 'Guardar cambios')}
        </button>
      </fieldset>
    </form>
  )
}

export function EnginesForm({ all, selected, disabled }: { all: { id: string; available: boolean; missing?: string }[]; selected: string[]; disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveEnginesAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-3">
      <ul className="divide-y divide-line-2 rounded-xl border border-line">
        {all.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <PlatformTag id={p.id} />
            {p.available ? (
              <input type="checkbox" name="engines" value={p.id} defaultChecked={selected.length === 0 || selected.includes(p.id)} disabled={disabled} className="h-4 w-4 accent-[#00a38c]" />
            ) : (
              <span className="text-[12px] font-semibold text-faint">{t('Coming soon', 'Próximamente')}</span>
            )}
          </li>
        ))}
      </ul>
      <Result state={state} />
      {!disabled && (
        <button className={btnClass('secondary')} disabled={pending}>
          {pending && <Spinner />}
          {t('Save platforms', 'Guardar plataformas')}
        </button>
      )}
    </form>
  )
}

export function InviteForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(inviteAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
        <input name="email" type="email" required placeholder={t('name@company.com', 'correo@empresa.com')} disabled={disabled} className={inputClass} />
        <Select
          name="role"
          label={t('Role', 'Rol')}
          disabled={disabled}
          defaultValue="member"
          className="w-full"
          options={[
            { value: 'member', label: t('Member', 'Miembro') },
            { value: 'admin', label: t('Admin', 'Administrador') },
          ]}
        />
        <button className={btnClass('primary', 'lg')} disabled={pending || disabled}>
          {pending && <Spinner size={16} />}
          {t('Invite', 'Invitar')}
        </button>
      </div>
      <Result state={state} />
    </form>
  )
}

export function ProfileForm({ user }: { user: { firstName: string; lastName: string; email: string; passwordHash?: string | null; googleId?: string | null } }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveProfileAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('First name', 'Nombre')}>
          <input name="firstName" defaultValue={user.firstName} required className={inputClass} />
        </Field>
        <Field label={t('Last name', 'Apellidos')}>
          <input name="lastName" defaultValue={user.lastName} className={inputClass} />
        </Field>
      </div>
      <Field
        label={t('Email', 'Correo')}
        hint={user.googleId ? t('It comes from your Google account.', 'Viene de tu cuenta de Google.') : undefined}
      >
        <input name="email" type="email" defaultValue={user.email} required readOnly={Boolean(user.googleId)} className={inputClass} />
      </Field>
      {!user.googleId && user.passwordHash && (
        <Field label={t('Current password (only to change your email)', 'Contraseña actual (solo para cambiar el correo)')}>
          <input name="current" type="password" autoComplete="current-password" className={inputClass} />
        </Field>
      )}
      <Result state={state} />
      <button className={btnClass('primary')} disabled={pending}>
        {pending && <Spinner />}
        {t('Save', 'Guardar')}
      </button>
    </form>
  )
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(changePasswordAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-4">
      {hasPassword && (
        <Field label={t('Current password', 'Contraseña actual')}>
          <input name="current" type="password" required autoComplete="current-password" className={inputClass} />
        </Field>
      )}
      <Field label={hasPassword ? t('New password', 'Contraseña nueva') : t('Create a password', 'Crea una contraseña')} hint={t('At least 8 characters.', 'Al menos 8 caracteres.')}>
        <input name="next" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </Field>
      <Result state={state} />
      <button className={btnClass('secondary')} disabled={pending}>
        {pending && <Spinner />}
        {hasPassword ? t('Change password', 'Cambiar contraseña') : t('Save password', 'Guardar contraseña')}
      </button>
    </form>
  )
}

export function DeleteAccountForm({ sharedSpaces }: { sharedSpaces: string[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(deleteAccountAction, {})
  const t = useT()
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-ink-2">
        {t(
          "This deletes your account and every workspace where you're the only member, with all their data. It can't be undone.",
          'Se borran tu cuenta y los espacios en los que eres el único miembro, con todos sus datos. No se puede deshacer.',
        )}
        {sharedSpaces.length > 0 && (
          <>
            {' '}
            {t(
              `The workspaces you share (${sharedSpaces.join(', ')}) will keep working for the rest of the team.`,
              `Los espacios que compartes (${sharedSpaces.join(', ')}) seguirán funcionando para el resto del equipo.`,
            )}
          </>
        )}
      </p>
      <Field label={t('Type DELETE to confirm', 'Escribe BORRAR para confirmar')}>
        <input name="confirm" autoComplete="off" className={inputClass} />
      </Field>
      <Result state={state} />
      <button className={btnClass('danger')} disabled={pending}>
        {pending && <Spinner />}
        {t('Delete my account', 'Borrar mi cuenta')}
      </button>
    </form>
  )
}
