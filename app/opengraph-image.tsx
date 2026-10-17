import { ImageResponse } from 'next/og'

// Imagen al compartir cualquier página de Placton (LinkedIn, X, WhatsApp…).
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Placton · Make AI recommend your brand'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(180deg, #2a78d6 0%, #4aa6da 38%, #7bcfdc 62%, #dcf3ee 88%, #f2f4f3 100%)',
          color: '#04191c',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: -1.5, color: '#ffffff' }}>placton</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3, color: '#ffffff', maxWidth: 940 }}>
            Make AI recommend your brand
          </div>
          <div style={{ display: 'flex', marginTop: 26, fontSize: 30, color: '#0b3b3c' }}>
            Weekly visibility on ChatGPT, Claude, Google AI, Perplexity and Grok
          </div>
        </div>
      </div>
    ),
    size,
  )
}
