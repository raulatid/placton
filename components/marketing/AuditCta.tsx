import { IconArrow } from '@/components/icons'
import { makeT, type Lang } from '@/lib/i18n-shared'
import { AuditResultPreview } from './FeatureVisuals'
import { Container, PANELS } from './parts'

// Banda de la auditoría gratuita: el formulario lleva a /signup?web=<dominio>.

export function AuditCta({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  return (
    <section aria-labelledby="free-audit" className="pb-20 sm:pb-28">
      <Container className="max-w-[1080px]">
        <div className="grid grid-cols-1 items-center gap-10 overflow-hidden rounded-[24px] px-5 py-10 sm:px-10 sm:py-14 lg:grid-cols-2 lg:gap-12 lg:px-14 lg:py-16" style={PANELS.sunset}>
          <div>
            <h2 id="free-audit" className="text-balance text-[30px] font-extrabold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[44px]">
              {t('Get a free AI-readiness audit of your website', 'Consigue gratis la auditoría de tu web para la IA')}
            </h2>
            <p className="mt-4 max-w-md text-pretty text-[16px] leading-relaxed text-ink-2">
              {t(
                'We run 18 checks on what helps AI assistants find, read and cite your site, and tell you what to fix first.',
                'Revisamos 18 puntos que ayudan a los asistentes de IA a encontrar, leer y citar tu web, y te decimos qué arreglar primero.',
              )}
            </p>
            <p className="mt-3 text-[14px] font-bold text-ink">
              {t('Ready as soon as you sign up, included in the free trial.', 'Lista nada más registrarte, incluida en la prueba gratis.')}
            </p>

            <form action="/signup" method="get" className="mt-7 flex w-full max-w-md items-center gap-1.5 rounded-full border border-white/80 bg-white p-1.5 shadow-[0_16px_40px_-20px_rgba(4,25,28,0.5)]">
              <label htmlFor="audit-web" className="sr-only">
                {t('Your website', 'Tu web')}
              </label>
              <input
                id="audit-web"
                name="web"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={200}
                placeholder={t('yourwebsite.com', 'tuweb.com')}
                className="h-11 min-w-0 flex-1 rounded-full bg-transparent px-4 text-[15px] text-ink placeholder:text-faint focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-deep px-5 text-[14px] font-bold text-white transition-colors hover:bg-deep-2"
              >
                {t('Get started', 'Empezar')}
                <IconArrow size={16} className="hidden sm:block" />
              </button>
            </form>
          </div>

          <div className="flex justify-center lg:justify-end">
            <AuditResultPreview lang={lang} />
          </div>
        </div>
      </Container>
    </section>
  )
}
