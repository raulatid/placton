import type { Metadata } from 'next'
import { IBM_Plex_Mono, Manrope } from 'next/font/google'
import { LangProvider } from '@/components/LangProvider'
import { getLang } from '@/lib/i18n'
import './globals.css'

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500'] })

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang()
  return {
    metadataBase: new URL(process.env.PLACTON_URL || 'http://localhost:3490'),
    title: {
      default: lang === 'es' ? 'Placton · Tu marca en las respuestas de la IA' : 'Placton · Know when AI recommends your brand',
      template: '%s · Placton',
    },
    description:
      lang === 'es'
        ? 'Placton mide cada semana qué responden ChatGPT, Claude, Google AI y Perplexity cuando tus clientes preguntan por lo que vendes.'
        : 'Placton checks every week what ChatGPT, Claude, Google AI and Perplexity answer when your customers ask about what you sell.',
    icons: { icon: '/icon.svg' },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang()
  return (
    <html lang={lang} className={`${manrope.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  )
}
