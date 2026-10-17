import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Analytics } from '@/components/marketing/Analytics'
import { Track } from '@/components/marketing/Track'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { getT } from '@/lib/i18n'

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT()
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#f2f4f3]">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-[60] focus:rounded-lg focus:bg-deep focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t('Skip to content', 'Saltar al contenido')}
      </a>
      <SiteHeader />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <Track />
      <Analytics />
    </div>
  )
}
