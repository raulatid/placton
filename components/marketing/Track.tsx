'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/** Cuenta la página vista en la analítica propia (sin cookies ni terceros). */
export function Track() {
  const path = usePathname()
  useEffect(() => {
    try {
      const utm = new URLSearchParams(window.location.search).get('utm_source') ?? ''
      const body = JSON.stringify({ path, ref: document.referrer, utm, lang: navigator.language })
      if (!navigator.sendBeacon?.('/api/hit', new Blob([body], { type: 'application/json' })))
        void fetch('/api/hit', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true })
    } catch {}
  }, [path])
  return null
}
