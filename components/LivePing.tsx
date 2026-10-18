'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Latido de «en vivo» para el panel de administración: cada 20 segundos mientras la
 * pestaña está visible, y un aviso al cerrarla. Sin cookies ni terceros.
 */
export function LivePing({ app = false }: { app?: boolean }) {
  const path = usePathname()
  useEffect(() => {
    if (/^\/(invite|reset-password)\//.test(path)) return
    const send = (leave = false) => {
      try {
        const body = JSON.stringify({ path, ref: document.referrer, utm: new URLSearchParams(window.location.search).get('utm_source') ?? '', lang: navigator.language, app, leave })
        if (!navigator.sendBeacon?.('/api/live', new Blob([body], { type: 'application/json' })))
          void fetch('/api/live', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true })
      } catch {}
    }
    if (document.visibilityState === 'visible') send()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') send()
    }, 20_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') send()
    }
    const onHide = () => send(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onHide)
    }
  }, [path, app])
  return null
}
