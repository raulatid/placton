'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useState } from 'react'
import { useT } from '../LangProvider'

// Google Analytics solo con permiso: hasta que el visitante acepta no se carga
// nada de Google (ni script ni cookies). La elección se guarda en este
// navegador y se puede cambiar desde la política de privacidad.

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-G529KE0VYY'
const KEY = 'placton_cookies'
const OPEN = 'placton:cookies'

type Choice = 'yes' | 'no' | null

function read(): Choice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'yes' || v === 'no' ? v : null
  } catch {
    return null
  }
}

export function Analytics() {
  const t = useT()
  const path = usePathname()
  // Sin Google en páginas con un token en la dirección (invitaciones, cambio de contraseña).
  const tokenPage = /^\/(invite|reset-password)\//.test(path)
  const [choice, setChoice] = useState<Choice>('no')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const c = read()
    setChoice(c)
    setOpen(c === null)
    const reopen = () => setOpen(true)
    window.addEventListener(OPEN, reopen)
    return () => window.removeEventListener(OPEN, reopen)
  }, [])

  const decide = (c: 'yes' | 'no') => {
    try {
      localStorage.setItem(KEY, c)
    } catch {}
    // Retirar el permiso: Google deja de medir al momento, se borran sus cookies
    // (también las del dominio común .placton.tech) y se recarga sin su código.
    if (c === 'no' && choice === 'yes') {
      try {
        ;(window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('consent', 'update', { analytics_storage: 'denied' })
      } catch {}
      const host = location.hostname.replace(/^www\./, '')
      const base = host.split('.').slice(-2).join('.')
      for (const name of document.cookie.split(';').map((x) => x.split('=')[0].trim()))
        if (name.startsWith('_ga')) for (const d of [host, base]) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${d}`
      setChoice(c)
      setOpen(false)
      window.location.reload()
      return
    }
    setChoice(c)
    setOpen(false)
  }

  return (
    <>
      {choice === 'yes' && !tokenPage && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={t('Cookie preferences', 'Preferencias de cookies')}
          className="fixed inset-x-4 bottom-4 z-[70] animate-[p-rise_0.3s_ease-out_both] rounded-2xl border border-line bg-white p-5 shadow-[0_24px_60px_-24px_rgba(4,25,28,0.35)] motion-reduce:animate-none sm:inset-x-auto sm:left-5 sm:max-w-[380px]"
        >
          <p className="text-[14px] font-bold text-ink">{t('Can we measure your visit?', '¿Podemos medir tu visita?')}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-mute">
            {t(
              'We use Google Analytics cookies to understand how the site is used. Nothing from Google is loaded unless you accept. ',
              'Usamos cookies de Google Analytics para saber cómo se usa la web. No se carga nada de Google si no aceptas. ',
            )}
            <Link href="/privacy#cookies" className="font-semibold text-ink-2 underline decoration-line underline-offset-2 hover:decoration-ink">
              {t('More info', 'Más información')}
            </Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => decide('no')} className="h-10 rounded-full border border-line bg-white text-[13.5px] font-semibold text-ink transition-colors hover:border-faint">
              {t('Reject', 'Rechazar')}
            </button>
            <button onClick={() => decide('yes')} className="h-10 rounded-full bg-deep text-[13.5px] font-semibold text-white transition-colors hover:bg-deep-2">
              {t('Accept', 'Aceptar')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Vuelve a abrir el aviso para cambiar la elección (desde la política de privacidad). */
export function CookieSettingsButton({ className, short }: { className?: string; short?: boolean }) {
  const t = useT()
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN))} className={className}>
      {short ? t('Cookies', 'Cookies') : t('Change cookie preferences', 'Cambiar preferencias de cookies')}
    </button>
  )
}
