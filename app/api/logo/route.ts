import { currentUser } from '@/lib/auth'
import { PUBLIC_LOGO_DOMAINS, brandLogo, cleanDomain } from '@/lib/logo'

// Logo de una marca en cuadrado de 128 px (ver lib/logo.ts). Sin sesión solo
// sirve lo que ya está guardado y las marcas del ejemplo de la portada, para
// que nadie use Placton como descargador de iconos de cualquier web.

export async function GET(req: Request) {
  const domain = cleanDomain(new URL(req.url).searchParams.get('d'))
  if (!domain) return new Response('Bad domain', { status: 400 })
  const signedIn = Boolean(await currentUser())
  const png = await brandLogo(domain, { cachedOnly: !signedIn && !PUBLIC_LOGO_DOMAINS.has(domain) })
  if (!png) return new Response('No logo', { status: 404, headers: { 'cache-control': 'public, max-age=3600' } })
  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=604800, stale-while-revalidate=86400',
    },
  })
}
