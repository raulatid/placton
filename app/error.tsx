'use client'

import { useEffect } from 'react'

// Error de una página. Si es por una actualización recién publicada (la página
// abierta pide piezas de la versión anterior), recarga sola una vez.
const STALE = /Failed to find Server Action|ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const es = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es')
  useEffect(() => {
    try {
      if (STALE.test(error.message) && !sessionStorage.getItem('placton_reloaded')) {
        sessionStorage.setItem('placton_reloaded', '1')
        window.location.reload()
        return
      }
      sessionStorage.removeItem('placton_reloaded')
    } catch {}
  }, [error])
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">{es ? 'Algo no ha cargado bien' : 'Something didn’t load'}</h1>
      <p className="mt-2 max-w-sm text-[15px] text-mute">
        {es ? 'Puede ser una actualización recién publicada. Vuelve a intentarlo.' : 'We may have just published an update. Please try again.'}
      </p>
      <div className="mt-6 flex gap-2">
        <button onClick={() => window.location.reload()} className="h-11 rounded-full bg-deep px-5 text-[14px] font-bold text-white hover:bg-deep-2">
          {es ? 'Recargar' : 'Reload'}
        </button>
        <button onClick={() => reset()} className="h-11 rounded-full border border-line bg-white px-5 text-[14px] font-bold text-ink hover:border-faint">
          {es ? 'Reintentar' : 'Try again'}
        </button>
      </div>
    </div>
  )
}
