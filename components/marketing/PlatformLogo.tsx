import { cx } from '@/components/ui'

// Logo oficial de cada plataforma de IA (su icono público, guardado en
// /public/platforms para no pedirlo a terceros en cada visita).

export const PLATFORM_LOGOS: Record<string, { name: string; domain: string }> = {
  chatgpt: { name: 'ChatGPT', domain: 'chatgpt.com' },
  claude: { name: 'Claude', domain: 'claude.ai' },
  google: { name: 'Google AI', domain: 'gemini.google.com' },
  gemini: { name: 'Gemini', domain: 'gemini.google.com' },
  perplexity: { name: 'Perplexity', domain: 'perplexity.ai' },
  grok: { name: 'Grok', domain: 'grok.com' },
}

export function platformName(id: string): string {
  return PLATFORM_LOGOS[id]?.name ?? id
}

/**
 * Logo en un círculo blanco con borde fino. Si el nombre de la plataforma ya
 * aparece como texto al lado, pasa `decorative` para no repetirlo al lector.
 */
export function PlatformLogo({ id, size = 20, decorative = false, className }: { id: string; size?: number; decorative?: boolean; className?: string }) {
  const p = PLATFORM_LOGOS[id] ?? { name: id, domain: `${id}.com` }
  const file = id === 'gemini' ? 'google' : id
  return (
    <span className={cx('relative inline-flex shrink-0 overflow-hidden rounded-full bg-white', className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/platforms/${file}.png`} alt={decorative ? '' : p.name} width={size} height={size} decoding="async" className="block h-full w-full object-cover" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/[0.08]" />
    </span>
  )
}
