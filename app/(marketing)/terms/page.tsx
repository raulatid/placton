import type { Metadata } from 'next'
import Link from 'next/link'
import { Container } from '@/components/marketing/parts'
import { getT } from '@/lib/i18n'
import { PLANS, TRIAL_DAYS } from '@/lib/plans'

// PENDIENTE (propietario): sustituir [Razón social] / [Company name], [NIF] y
// [Domicilio] / [Registered address] por los datos reales del titular antes de
// publicar, en las dos versiones.

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    title: t('Terms of service', 'Términos y condiciones'),
    description: t(
      'Placton terms of service: account, free trial, plans and payments with Stripe, cancellation, acceptable use and liability.',
      'Condiciones de uso de Placton: cuenta, prueba gratuita, planes y pagos con Stripe, cancelación, uso aceptable y responsabilidad.',
    ),
    alternates: { canonical: '/terms' },
  }
}

const linkClass = 'font-semibold text-brand underline underline-offset-2'

function TermsEn() {
  return (
    <>
          <h2>1. Who we are</h2>
          <p>
            Placton is a service provided by [Company name], tax ID (NIF) [NIF], with its registered address at [Registered address]
            (&ldquo;Placton&rdquo;, &ldquo;we&rdquo; or &ldquo;us&rdquo;). You can write to us at{' '}
            <a href="mailto:hola@placton.com" className={linkClass}>
              hola@placton.com
            </a>
            .
          </p>

          <h2>2. What Placton is</h2>
          <p>
            Placton is an online tool that every day sends the questions you set up in your workspace to several AI assistants (ChatGPT,
            Claude, Google AI Overviews and Perplexity, plus any we may add) and analyses their answers: mentions of your brand and your
            competitors, position, tone, cited sources, improvement ideas and a technical audit of your website.
          </p>
          <p>
            By creating an account or using the service you accept these terms. If you sign up on behalf of a company, you confirm that you
            are authorised to bind it.
          </p>

          <h2>3. Account and workspaces</h2>
          <ul>
            <li>You need an account with a valid email address to use Placton. You are responsible for keeping your access safe and for anything done from your account.</li>
            <li>Information is organised in workspaces. Each workspace has its own subscription, its own prompt and member limits, and its own data.</li>
            <li>Whoever creates a workspace is its owner. On paid plans the owner can invite other people, give them a role and remove their access.</li>
            <li>Placton is designed for professionals and businesses. You must be an adult to sign up.</li>
          </ul>

          <h2>4. Free trial</h2>
          <p>
            You can try Placton for {TRIAL_DAYS} days without entering a card, within the trial limits (up to {PLANS.trial.prompts}{' '}
            prompts and a single member). When the trial ends, tracking stops unless you choose a plan, and you are not charged anything if
            you do not. We may limit the number of trials per person, company or domain to prevent abuse.
          </p>

          <h2>5. Plans, prices and payment</h2>
          <ul>
            <li>
              Plans, their limits and their prices are those shown on the{' '}
              <Link href="/pricing" className={linkClass}>
                pricing page
              </Link>{' '}
              when you subscribe. Prices are in US dollars; taxes may apply depending on your country.
            </li>
            <li>Subscriptions can be monthly or yearly and renew automatically at the end of each period unless you cancel before then.</li>
            <li>Payments are processed by Stripe. Placton never receives or stores your full card details. Stripe sends you an invoice for every payment.</li>
            <li>If a payment fails, we may retry it and, if it is not resolved, pause tracking for the workspace until it is.</li>
            <li>
              We may change our prices. If a change affects your subscription, we will email you at least 30 days in advance and it will
              apply from your next renewal. If you do not agree, you can cancel before that date.
            </li>
            <li>If you change plans, the new amount and any adjustment are calculated as Stripe shows you when you confirm the change.</li>
          </ul>

          <h2>6. Cancellation and refunds</h2>
          <p>
            You can cancel at any time from Workspace settings, under Subscription, which takes you to the Stripe portal. Cancellation
            takes effect at the end of the period you have already paid for: you keep access until then and the subscription does not
            renew afterwards. There is no minimum term and no penalty.
          </p>
          <p>
            Unless the law says otherwise, amounts for periods that have already started are not refunded. If you subscribe as a consumer,
            you keep all the rights consumer law gives you, including the right of withdrawal where it applies.
          </p>

          <h2>7. Acceptable use</h2>
          <p>When you use Placton you agree not to:</p>
          <ul>
            <li>use it for unlawful purposes or to infringe the rights of others;</li>
            <li>write personal data, sensitive data or unlawful or offensive content in your prompts;</li>
            <li>try to access systems or data without permission, overload the service or get around its limits;</li>
            <li>extract data from the service in an automated way beyond the features we provide;</li>
            <li>resell access to Placton without our written permission. Using it to serve your own clients is allowed.</li>
          </ul>
          <p>We may suspend or close accounts that break these rules, and we will warn you first whenever possible.</p>

          <h2>8. About the results</h2>
          <ul>
            <li>
              AI assistants&apos; answers change over time and depend on the model, the date, the location and other factors we do not
              control. Placton records and analyses the answers it gets when it asks the questions, but cannot guarantee they match what
              another person sees.
            </li>
            <li>The analysis (mentions, positions, tone and citations) is automated and may contain errors.</li>
            <li>Insights and the audit are guidance only. We do not guarantee that following them will improve your visibility, position or traffic.</li>
            <li>Placton is not affiliated with OpenAI, Anthropic, Google, Perplexity or xAI. Their names and trademarks belong to their owners.</li>
          </ul>

          <h2>9. Your data and your content</h2>
          <p>
            The content you enter (website, brands, competitors and prompts) and the results in your workspace are yours. You allow us to
            process them for the sole purpose of providing the service. We may use aggregated, anonymous data to improve Placton, in a way
            that cannot identify you or your brand.
          </p>
          <p>
            We handle personal data as described in our{' '}
            <Link href="/privacy" className={linkClass}>
              privacy policy
            </Link>
            .
          </p>

          <h2>10. Intellectual property</h2>
          <p>
            The software, design, the Placton brand and the service texts belong to [Company name] or its licensors. For as long as your
            subscription lasts, we grant you a limited, non-exclusive and non-transferable right to use them.
          </p>

          <h2>11. Availability and changes to the service</h2>
          <p>
            We work to keep Placton available at all times, but there may be interruptions for maintenance, faults or outside causes such
            as changes or outages at AI providers. We may add, change or remove features and platforms. If we remove an essential feature
            of your plan, we will tell you and you will be able to cancel.
          </p>

          <h2>12. Liability</h2>
          <p>
            To the extent permitted by law, Placton is not liable for indirect damages, loss of profit or loss of data or business
            opportunities, and its total liability to you is limited to what you paid for the service in the 12 months before the event
            that gave rise to it. These limits do not apply in cases of wilful misconduct or gross negligence, and they do not reduce the
            rights the law gives consumers.
          </p>

          <h2>13. Leaving and deleting your account</h2>
          <p>
            You can delete your account at any time from Account, under Delete account. Your personal data and the workspaces where you are
            the only member will be deleted; shared workspaces remain for their other members. We will only keep information the law
            requires us to keep, such as billing records.
          </p>

          <h2>14. Changes to these terms</h2>
          <p>
            We may update these terms. If the changes are significant, we will let you know by email or in the dashboard with reasonable
            notice. If you keep using Placton after they take effect, we will understand that you accept them; if you do not agree, you can
            cancel.
          </p>

          <h2>15. Governing law and jurisdiction</h2>
          <p>
            These terms are governed by Spanish law. Any dispute will be heard by the courts of the registered address of [Company name],
            unless you subscribe as a consumer, in which case the courts of your place of residence will have jurisdiction.
          </p>

          <h2>16. Contact</h2>
          <p>
            For any question about these terms, write to us at{' '}
            <a href="mailto:hola@placton.com" className={linkClass}>
              hola@placton.com
            </a>
            .
          </p>
    </>
  )
}

function TermsEs() {
  return (
    <>

          <h2>1. Quiénes somos</h2>
          <p>
            Placton es un servicio prestado por [Razón social], con NIF [NIF] y domicilio en [Domicilio] (en adelante, «Placton» o
            «nosotros»). Puedes escribirnos a{' '}
            <a href="mailto:hola@placton.com" className={linkClass}>
              hola@placton.com
            </a>
            .
          </p>

          <h2>2. Qué es Placton</h2>
          <p>
            Placton es una herramienta en línea que envía cada día a distintos asistentes de inteligencia artificial (ChatGPT, Claude,
            Google AI Overviews y Perplexity, además de los que podamos añadir) las preguntas que configuras en tu espacio de trabajo, y
            analiza sus respuestas: menciones de tu marca y de tus competidores, posición, tono, fuentes citadas, ideas de mejora y una
            auditoría técnica de tu web.
          </p>
          <p>
            Al crear una cuenta o usar el servicio aceptas estos términos. Si contratas en nombre de una empresa, declaras que tienes
            capacidad para obligarla.
          </p>

          <h2>3. Cuenta y espacios de trabajo</h2>
          <ul>
            <li>Para usar Placton necesitas una cuenta con un correo válido. Eres responsable de custodiar tu acceso y de lo que se haga desde tu cuenta.</li>
            <li>La información se organiza en espacios de trabajo. Cada espacio tiene su propia suscripción, sus límites de prompts y de miembros, y sus datos.</li>
            <li>Quien crea un espacio es su propietario. En los planes de pago puede invitar a otras personas, asignarles un rol y retirarles el acceso.</li>
            <li>Placton está pensado para profesionales y empresas. Debes ser mayor de edad para registrarte.</li>
          </ul>

          <h2>4. Prueba gratuita</h2>
          <p>
            Puedes probar Placton durante {TRIAL_DAYS} días sin introducir una tarjeta, con los límites de la prueba (hasta{' '}
            {PLANS.trial.prompts} prompts y un único miembro). Al terminar, el seguimiento se detiene salvo que contrates un plan, y no se
            te cobra nada si no lo haces. Podemos limitar el número de pruebas por persona, empresa o dominio para evitar abusos.
          </p>

          <h2>5. Planes, precios y pago</h2>
          <ul>
            <li>
              Los planes, sus límites y sus precios son los publicados en la{' '}
              <Link href="/pricing" className={linkClass}>
                página de precios
              </Link>{' '}
              en el momento de contratar. Los precios están en dólares (USD) y pueden aplicarse impuestos según tu país.
            </li>
            <li>Las suscripciones pueden ser mensuales o anuales y se renuevan automáticamente al final de cada periodo, salvo que las canceles antes.</li>
            <li>Los pagos se procesan a través de Stripe. Placton no recibe ni guarda los datos completos de tu tarjeta. Stripe te envía la factura de cada cobro.</li>
            <li>Si un cobro falla, podremos reintentarlo y, si no se resuelve, suspender el seguimiento del espacio hasta que se regularice.</li>
            <li>
              Podemos cambiar los precios. Si el cambio afecta a tu suscripción, te avisaremos por correo con al menos 30 días de
              antelación y se aplicará en la siguiente renovación. Si no estás de acuerdo, puedes cancelar antes de esa fecha.
            </li>
            <li>Si cambias de plan, el nuevo importe y su ajuste se calculan según lo que te muestre Stripe al confirmar el cambio.</li>
          </ul>

          <h2>6. Cancelación y reembolsos</h2>
          <p>
            Puedes cancelar cuando quieras desde Ajustes del espacio, en Suscripción, que te lleva al portal de Stripe. La cancelación
            tiene efecto al final del periodo ya pagado: hasta entonces mantienes el acceso y después la suscripción no se renueva. No hay
            permanencia ni penalizaciones.
          </p>
          <p>
            Salvo que la ley disponga otra cosa, no se devuelven los importes de periodos ya iniciados. Si contratas como consumidor,
            conservas todos los derechos que te reconoce la normativa de consumo, incluido el de desistimiento cuando proceda.
          </p>

          <h2>7. Uso aceptable</h2>
          <p>Al usar Placton te comprometes a no:</p>
          <ul>
            <li>usarlo con fines ilícitos o para vulnerar derechos de terceros;</li>
            <li>escribir en los prompts datos personales, datos sensibles o contenido ilícito u ofensivo;</li>
            <li>intentar acceder sin permiso a sistemas o datos, sobrecargar el servicio o eludir sus límites;</li>
            <li>extraer datos del servicio de forma automatizada fuera de las funciones que ofrecemos;</li>
            <li>revender el acceso a Placton sin nuestro permiso por escrito. Usarlo para dar servicio a tus propios clientes sí está permitido.</li>
          </ul>
          <p>Podemos suspender o cerrar las cuentas que incumplan estas normas, avisándote antes siempre que sea posible.</p>

          <h2>8. Sobre los resultados</h2>
          <ul>
            <li>
              Las respuestas de los asistentes de IA cambian con el tiempo y dependen del modelo, la fecha, la ubicación y otros factores
              que no controlamos. Placton registra y analiza las respuestas que obtiene al hacer las preguntas, pero no garantiza que
              coincidan con las que vea otra persona.
            </li>
            <li>Los análisis (menciones, posiciones, tono y citas) se obtienen de forma automatizada y pueden contener errores.</li>
            <li>Las ideas y la auditoría son recomendaciones orientativas. No garantizamos que aplicarlas mejore tu visibilidad, tu posición o tu tráfico.</li>
            <li>Placton no está afiliado a OpenAI, Anthropic, Google, Perplexity ni xAI. Sus nombres y marcas pertenecen a sus titulares.</li>
          </ul>

          <h2>9. Tus datos y tu contenido</h2>
          <p>
            El contenido que introduces (web, marcas, competidores y prompts) y los resultados de tu espacio son tuyos. Nos das permiso
            para tratarlos con el único fin de prestarte el servicio. Podemos usar datos agregados y anónimos para mejorar Placton, sin
            que permitan identificarte a ti ni a tu marca.
          </p>
          <p>
            Tratamos los datos personales según nuestra{' '}
            <Link href="/privacy" className={linkClass}>
              política de privacidad
            </Link>
            .
          </p>

          <h2>10. Propiedad intelectual</h2>
          <p>
            El software, el diseño, la marca Placton y los textos del servicio pertenecen a [Razón social] o a sus licenciantes. Mientras
            dure tu suscripción, te concedemos un derecho de uso limitado, no exclusivo e intransferible.
          </p>

          <h2>11. Disponibilidad y cambios en el servicio</h2>
          <p>
            Trabajamos para que Placton esté disponible de forma continua, pero puede haber interrupciones por mantenimiento, fallos o
            causas ajenas, como cambios o caídas de los proveedores de IA. Podemos añadir, cambiar o retirar funciones y plataformas. Si
            retiramos una función esencial de tu plan, te avisaremos y podrás cancelar.
          </p>

          <h2>12. Responsabilidad</h2>
          <p>
            En la medida en que la ley lo permita, Placton no responde de daños indirectos, lucro cesante ni pérdida de datos o de
            oportunidades de negocio, y su responsabilidad total frente a ti se limita a lo que hayas pagado por el servicio en los 12
            meses anteriores al hecho que la origine. Estas limitaciones no se aplican en caso de dolo o culpa grave, ni reducen los
            derechos que la ley reconoce a los consumidores.
          </p>

          <h2>13. Baja y borrado de la cuenta</h2>
          <p>
            Puedes borrar tu cuenta en cualquier momento desde Cuenta, en Borrar cuenta. Se borrarán tus datos personales y los espacios
            en los que seas el único miembro; los espacios compartidos seguirán existiendo para el resto de sus miembros. Conservaremos
            solo la información que la ley nos obligue a guardar, como los datos de facturación.
          </p>

          <h2>14. Cambios en estos términos</h2>
          <p>
            Podemos actualizar estos términos. Si los cambios son relevantes, te avisaremos por correo o en el panel con antelación
            razonable. Si sigues usando Placton después de su entrada en vigor, entenderemos que los aceptas; si no estás de acuerdo,
            puedes cancelar.
          </p>

          <h2>15. Ley aplicable y jurisdicción</h2>
          <p>
            Estos términos se rigen por la ley española. Para cualquier controversia, las partes se someten a los juzgados y tribunales
            del domicilio de [Razón social], salvo que contrates como consumidor, en cuyo caso serán competentes los de tu domicilio.
          </p>

          <h2>16. Contacto</h2>
          <p>
            Para cualquier duda sobre estos términos, escríbenos a{' '}
            <a href="mailto:hola@placton.com" className={linkClass}>
              hola@placton.com
            </a>
            .
          </p>
    </>
  )
}

export default async function TermsPage() {
  const { lang, t } = await getT()
  return (
    <section className="pb-20 pt-32 sm:pb-28 sm:pt-40">
      <Container narrow>
        <h1 className="text-[36px] font-extrabold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[48px]">{t('Terms of service', 'Términos y condiciones')}</h1>
        <p className="mt-3 text-[14px] text-mute">{t('Last updated: 16 October 2026', 'Última actualización: 16 de octubre de 2026')}</p>
        <div className="legal mt-8">{lang === 'es' ? <TermsEs /> : <TermsEn />}</div>
      </Container>
    </section>
  )
}
