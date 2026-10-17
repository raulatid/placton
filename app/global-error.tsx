'use client'

// Error en la propia estructura de la página: misma recarga automática, sin estilos externos.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  if (typeof window !== 'undefined') {
    try {
      if (!sessionStorage.getItem('placton_reloaded')) {
        sessionStorage.setItem('placton_reloaded', '1')
        window.location.reload()
      }
    } catch {}
  }
  void error
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f3f5f4', color: '#0b1d21', display: 'grid', placeItems: 'center', minHeight: '100vh', textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>Placton</h1>
          <p style={{ color: '#66797d' }}>Something didn’t load. / Algo no ha cargado bien.</p>
          <button onClick={() => window.location.reload()} style={{ height: 44, padding: '0 20px', borderRadius: 999, border: 0, background: '#04191c', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Reload / Recargar
          </button>
        </div>
      </body>
    </html>
  )
}
