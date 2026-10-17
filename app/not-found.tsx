import Link from 'next/link'
import { getT } from '@/lib/i18n'

export default async function NotFound() {
  const { t } = await getT()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f2f4f3] px-6 text-center">
      <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-faint">404</p>
      <h1 className="mt-3 text-[32px] font-extrabold tracking-[-0.035em] text-ink">{t('This page does not exist', 'Esta página no existe')}</h1>
      <p className="mt-2 max-w-sm text-[15px] text-mute">{t('It may have moved, or the link is wrong.', 'Puede que se haya movido o que el enlace no sea correcto.')}</p>
      <div className="mt-7 flex gap-2">
        <Link href="/" className="inline-flex h-11 items-center rounded-full bg-deep px-5 text-[14px] font-bold text-white hover:bg-deep-2">
          {t('Go to the home page', 'Ir a la portada')}
        </Link>
        <Link href="/dashboard" className="inline-flex h-11 items-center rounded-full border border-line bg-white px-5 text-[14px] font-bold text-ink hover:border-faint">
          {t('Open the dashboard', 'Abrir el panel')}
        </Link>
      </div>
    </div>
  )
}
