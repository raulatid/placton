import type { Metadata } from 'next'
import Link from 'next/link'
import { IconMail } from '@/components/icons'
import { Card, CardHeader, PageHeader } from '@/components/ui'
import { requireCtx } from '@/lib/auth'
import { getT } from '@/lib/i18n'
import { HelpContactForm } from './HelpContactForm'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('Help & Support', 'Ayuda') }
}

const QA: { q: { en: string; es: string }; a: { en: string; es: string } }[] = [
  {
    q: { en: 'How often do you track?', es: '¿Cada cuánto se mide?' },
    a: {
      en: 'Once a week. Every active prompt runs on every platform you have turned on in Settings, with each AI searching the web just like it does for a real user. “Run now” measures right away any prompt that has no answers yet this week.',
      es: 'Una vez por semana. Cada pregunta activa se lanza en todas las plataformas que tengas encendidas en Ajustes, con cada IA buscando en internet igual que lo hace para una persona. Con «Medir ahora» mides al momento las preguntas que aún no tengan respuesta esta semana.',
    },
  },
  {
    q: { en: "What's the difference between a direct and an indirect mention?", es: '¿Qué diferencia hay entre mención directa e indirecta?' },
    a: {
      en: "Direct: the answer writes the brand's name. Indirect: the answer cites a page from its website as a source. One answer can count as both, and both count towards visibility.",
      es: 'Directa: la respuesta escribe el nombre de la marca. Indirecta: la respuesta cita como fuente una página de su web. Una misma respuesta puede contar como las dos, y las dos cuentan para la visibilidad.',
    },
  },
  {
    q: { en: 'How is visibility calculated?', es: '¿Cómo se calcula la visibilidad?' },
    a: {
      en: "It's the percentage of answers in the period where the brand appears. Answers where you don't appear count as zero, so the number isn't inflated.",
      es: 'Es el porcentaje de respuestas del periodo en las que aparece la marca. Las respuestas donde no sales cuentan como cero, así que el dato no se infla.',
    },
  },
  {
    q: { en: 'Why does Google sometimes have no answer?', es: '¿Por qué Google a veces no tiene respuesta?' },
    a: {
      en: "We track the AI Overview that Google shows above the results. It doesn't appear for every search; when it's missing we mark it as “no answer” and it doesn't count towards your average.",
      es: 'Medimos el resumen de IA que Google enseña encima de los resultados. No sale en todas las búsquedas; cuando no aparece lo marcamos como «sin respuesta» y no cuenta en tu media.',
    },
  },
  {
    q: { en: 'Do answers change from one day to the next?', es: '¿Las respuestas cambian de un día a otro?' },
    a: {
      en: "Yes. Models aren't deterministic and they also read the web in real time. That's why it's better to look at the trend over several days than at a single answer.",
      es: 'Sí. Los modelos no son deterministas y además leen la web en el momento. Por eso conviene mirar la tendencia de varios días antes que una respuesta suelta.',
    },
  },
  {
    q: { en: 'How do I invite my team?', es: '¿Cómo invito a mi equipo?' },
    a: {
      en: "In Workspace Settings, Members tab. It's available on paid plans; each plan has its own number of seats.",
      es: 'En Ajustes del espacio, pestaña Miembros. Está disponible en los planes de pago; cada plan tiene su número de plazas.',
    },
  },
  {
    q: { en: 'How do I cancel?', es: '¿Cómo cancelo?' },
    a: {
      en: 'In Workspace Settings, Billing tab. Cancellation takes effect at the end of the paid period, and everything keeps working until then.',
      es: 'En Ajustes del espacio, pestaña Suscripción. La cancelación se aplica al final del periodo pagado y hasta entonces todo sigue funcionando.',
    },
  },
]

export default async function HelpPage() {
  const { user } = await requireCtx()
  const { lang, t } = await getT()
  return (
    <>
      <PageHeader title={t('Help & Support', 'Ayuda')} hint={t('Quick answers and a direct line to us.', 'Respuestas rápidas y una línea directa con nosotros.')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card i={1}>
          <CardHeader
            title={t('Common questions', 'Preguntas habituales')}
            right={
              <Link href="/faqs" className="text-[13px] font-semibold text-brand transition-opacity hover:opacity-80">
                {t('View all', 'Ver todas')}
              </Link>
            }
          />
          <div className="divide-y divide-line-2 border-t border-line-2">
            {QA.map((x) => (
              <details key={x.q.en} className="group px-6 py-3.5 transition-colors open:bg-[#f8faf9] hover:bg-[#f8faf9]">
                <summary className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  {x.q[lang]}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-white text-faint transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 animate-[p-rise_0.25s_ease-out_both] text-[14px] leading-relaxed text-ink-2 motion-reduce:animate-none">{x.a[lang]}</p>
              </details>
            ))}
          </div>
        </Card>
        <Card i={2}>
          <CardHeader
            title={t('Write to us', 'Escríbenos')}
            hint={t('We reply within one business day.', 'Contestamos en menos de un día laborable.')}
            right={<IconMail size={18} className="text-faint" />}
          />
          <div className="px-6 pb-6">
            <HelpContactForm name={`${user.firstName} ${user.lastName}`.trim()} email={user.email} />
          </div>
        </Card>
      </div>
    </>
  )
}
