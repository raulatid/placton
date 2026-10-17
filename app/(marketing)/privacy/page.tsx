import type { Metadata } from 'next'
import { Container } from '@/components/marketing/parts'
import { getT } from '@/lib/i18n'

// Titular: SELSPY AGENCY S. COOP. (NIF F75988824), Paseo la Fuente n.º 9, 4.º A.
// Falta el código postal y la localidad del domicilio (en las dos versiones).

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    title: t('Privacy policy', 'Política de privacidad'),
    description: t(
      'What personal data Placton processes, why, on what legal basis, with which providers and how to exercise your rights under the GDPR.',
      'Qué datos personales trata Placton, para qué, con qué base legal, con qué proveedores y cómo ejercer tus derechos según el RGPD.',
    ),
    alternates: { canonical: '/privacy' },
  }
}

const linkClass = 'font-semibold text-brand underline underline-offset-2'

function PrivacyEn() {
  return (
    <>
          <p>
            This policy explains what personal data we process when you use Placton or visit this website, why we use it, on what legal
            basis, who we share it with and what rights you have. We comply with the General Data Protection Regulation (Regulation (EU)
            2016/679, &ldquo;GDPR&rdquo;) and the Spanish Organic Law 3/2018 on the Protection of Personal Data and Guarantee of Digital
            Rights.
          </p>

          <h2>1. Data controller</h2>
          <ul>
            <li>Company: SELSPY AGENCY S. COOP.</li>
            <li>Tax ID (NIF): F75988824</li>
            <li>Registered address: Paseo la Fuente 9, 4.º A</li>
            <li>
              Contact:{' '}
              <a href="mailto:contact@placton.tech" className={linkClass}>
                contact@placton.tech
              </a>
            </li>
          </ul>

          <h2>2. What data we process</h2>
          <ul>
            <li>
              <strong>Account data:</strong> first name, last name, email address and password (stored with irreversible encryption), or
              your Google account identifier if you sign in with Google.
            </li>
            <li>
              <strong>Workspace data:</strong> brand name, website, competitors, prompts, language and country, members and invitations,
              and the tracking results.
            </li>
            <li>
              <strong>Billing data:</strong> plan, subscription status, amounts and Stripe customer and subscription identifiers. Your card
              details are handled directly by Stripe: we never see or store them.
            </li>
            <li>
              <strong>Messages:</strong> what you send us through the contact form or by email (name, email, topic and message).
            </li>
            <li>
              <strong>Technical data:</strong> IP address, browser type and access logs needed for the security and operation of the
              service.
            </li>
          </ul>

          <h2>3. Why we use it and on what legal basis</h2>
          <ul>
            <li>To create and manage your account, provide the service and support you. Legal basis: performance of the contract.</li>
            <li>To charge subscriptions and issue invoices. Legal basis: performance of the contract and compliance with tax and accounting obligations.</li>
            <li>
              To send you emails about the service, such as access, invitations, trial reminders, payments, weekly insights and important
              changes. Legal basis: performance of the contract.
            </li>
            <li>To reply to the messages you send us. Legal basis: your consent when you write to us.</li>
            <li>To protect the service against abuse and fraud, and to improve it with aggregated data. Legal basis: legitimate interest.</li>
            <li>To send you product news, only if you agree. Legal basis: consent, which you can withdraw at any time.</li>
          </ul>
          <p>We do not make automated decisions with legal effects on you and we do not build profiles for advertising.</p>

          <h2>4. AI providers and prompts</h2>
          <p>
            To provide the service we send the prompts in your workspace to artificial intelligence providers: OpenAI (ChatGPT), Anthropic
            (Claude), Google, through DataForSEO (Google AI Overviews) or the Gemini API, Perplexity and xAI (Grok). We also use AI models
            to analyse the answers and to prepare each week&apos;s insights.
          </p>
          <p>
            Prompts are questions about your industry, your products or your brand and never include personal data: we do not send your
            name, your email or any other account details. Please do not write personal data in them either.
          </p>

          <h2>5. Who we share data with</h2>
          <p>
            Only with the providers that help us run the service. They act as data processors and we have signed the agreements the GDPR
            requires with them:
          </p>
          <ul>
            <li>Hosting of the application and database on servers located in the European Union.</li>
            <li>Stripe, to process payments and manage subscriptions and invoices.</li>
            <li>Resend, to send the service emails.</li>
            <li>OpenAI, Anthropic, Google (through DataForSEO or the Gemini API), Perplexity and xAI, which process prompts as explained in the previous section. Some of these requests are routed through OpenRouter, which forwards them to the provider.</li>
            <li>Brand logos: our servers download the public icon of each brand's website to show it in the app and on this site. Your browser does not contact any third party for this.</li>
          </ul>
          <p>
            If you choose to sign in with Google, Google provides us with your name and email to identify you. We do not sell your data or
            share it with third parties for advertising. We will only disclose it to authorities when the law requires us to.
          </p>

          <h2>6. International transfers</h2>
          <p>
            Some of these providers are based in the United States or may access data from there. In those cases the transfer relies on the
            EU-US Data Privacy Framework, when the provider is certified, or on the standard contractual clauses approved by the European
            Commission.
          </p>

          <h2>7. How long we keep it</h2>
          <ul>
            <li>
              Account and workspace data: for as long as you have an account. When you delete it, we erase it within 30 days at most,
              except for backups, which are overwritten in their normal cycle.
            </li>
            <li>Billing data: for as long as tax and commercial law requires, generally up to six years.</li>
            <li>Contact messages: for as long as needed to help you and for two years at most.</li>
            <li>Technical logs: up to twelve months.</li>
          </ul>

          <h2>8. Your rights</h2>
          <p>
            You can exercise your rights of access, rectification, erasure, objection, restriction of processing and portability at any
            time, and withdraw any consent you have given, by writing to{' '}
            <a href="mailto:contact@placton.tech" className={linkClass}>
              contact@placton.tech
            </a>{' '}
            from your account email. You can change or delete much of your data yourself from the dashboard.
          </p>
          <p>
            If you think we have not handled your data properly, you can file a complaint with the Spanish Data Protection Agency
            (aepd.es).
          </p>

          <h2>9. Cookies</h2>
          <p>
            We only use technical cookies needed for the service to work, such as the one that keeps you signed in and the one that
            remembers your language. We do not use advertising or third-party tracking cookies. If we ever do, we will ask for your consent
            first.
          </p>

          <h2>10. Security</h2>
          <p>
            We apply reasonable technical and organisational measures to protect your data: encrypted connections (HTTPS), encrypted
            passwords, restricted access and backups. If a security breach affected your data, we would let you know and report it to the
            supervisory authority where required.
          </p>

          <h2>11. Minors</h2>
          <p>Placton is aimed at professionals and businesses and is not intended for anyone under 18.</p>

          <h2>12. Changes to this policy</h2>
          <p>If we make significant changes to this policy, we will let you know by email or in the dashboard before they apply.</p>
    </>
  )
}

function PrivacyEs() {
  return (
    <>

          <p>
            Aquí te explicamos qué datos personales tratamos cuando usas Placton o visitas esta web, para qué los usamos, con qué base
            legal, con quién los compartimos y qué derechos tienes. Cumplimos el Reglamento General de Protección de Datos (Reglamento
            (UE) 2016/679, «RGPD») y la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales.
          </p>

          <h2>1. Responsable del tratamiento</h2>
          <ul>
            <li>Titular: SELSPY AGENCY S. COOP.</li>
            <li>NIF: F75988824</li>
            <li>Domicilio: Paseo la Fuente n.º 9, 4.º A</li>
            <li>
              Contacto:{' '}
              <a href="mailto:contact@placton.tech" className={linkClass}>
                contact@placton.tech
              </a>
            </li>
          </ul>

          <h2>2. Qué datos tratamos</h2>
          <ul>
            <li>
              <strong>Datos de cuenta:</strong> nombre, apellidos, correo electrónico y contraseña (que guardamos cifrada de forma
              irreversible), o el identificador de tu cuenta de Google si entras con ella.
            </li>
            <li>
              <strong>Datos de tu espacio de trabajo:</strong> nombre de la marca, web, competidores, prompts, idioma y país, miembros e
              invitaciones, y los resultados del seguimiento.
            </li>
            <li>
              <strong>Datos de facturación:</strong> plan, estado de la suscripción, importes e identificadores de cliente y de
              suscripción en Stripe. Los datos de tu tarjeta los trata directamente Stripe: nosotros no los vemos ni los guardamos.
            </li>
            <li>
              <strong>Mensajes:</strong> lo que nos escribes por el formulario de contacto o por correo (nombre, correo, motivo y mensaje).
            </li>
            <li>
              <strong>Datos técnicos:</strong> dirección IP, tipo de navegador y registros de acceso necesarios para la seguridad y el
              funcionamiento del servicio.
            </li>
          </ul>

          <h2>3. Para qué los usamos y con qué base legal</h2>
          <ul>
            <li>Crear y gestionar tu cuenta, prestarte el servicio y darte soporte. Base legal: ejecución del contrato.</li>
            <li>
              Cobrar las suscripciones y emitir las facturas. Base legal: ejecución del contrato y cumplimiento de obligaciones fiscales y
              contables.
            </li>
            <li>
              Enviarte correos sobre el servicio, como el acceso, las invitaciones, los avisos de la prueba, los cobros, las ideas
              semanales y los cambios importantes. Base legal: ejecución del contrato.
            </li>
            <li>Responder a los mensajes que nos envías. Base legal: tu consentimiento al escribirnos.</li>
            <li>Proteger el servicio frente a abusos y fraudes, y mejorarlo con datos agregados. Base legal: interés legítimo.</li>
            <li>Enviarte novedades comerciales, solo si nos das tu permiso. Base legal: consentimiento, que puedes retirar cuando quieras.</li>
          </ul>
          <p>No tomamos decisiones automatizadas con efectos jurídicos sobre ti ni elaboramos perfiles con fines publicitarios.</p>

          <h2>4. Proveedores de IA y prompts</h2>
          <p>
            Para prestar el servicio enviamos los prompts de tu espacio a proveedores de inteligencia artificial: OpenAI (ChatGPT),
            Anthropic (Claude), Google, a través de DataForSEO (Google AI Overviews) o de la API de Gemini, Perplexity y xAI (Grok).
            También usamos modelos de IA para analizar las respuestas y preparar las ideas de cada semana.
          </p>
          <p>
            Los prompts son preguntas sobre tu sector, tus productos o tu marca y nunca incluyen datos personales: no enviamos tu nombre,
            tu correo ni otros datos de tu cuenta. Te pedimos que tampoco escribas datos personales en ellos.
          </p>

          <h2>5. Con quién compartimos los datos</h2>
          <p>
            Solo con los proveedores que nos ayudan a prestar el servicio, que actúan como encargados del tratamiento y con los que
            tenemos firmados los contratos que exige el RGPD:
          </p>
          <ul>
            <li>Alojamiento de la aplicación y de la base de datos en servidores situados en la Unión Europea.</li>
            <li>Stripe, para procesar los pagos y gestionar las suscripciones y las facturas.</li>
            <li>Resend, para enviar los correos electrónicos del servicio.</li>
            <li>OpenAI, Anthropic, Google (a través de DataForSEO o de la API de Gemini), Perplexity y xAI, que procesan los prompts como se explica en el apartado anterior. Parte de estas peticiones pasan por OpenRouter, que las reenvía al proveedor.</li>
            <li>Logotipos de las marcas: nuestros servidores descargan el icono público de la web de cada marca para enseñarlo en la aplicación y en esta web. Tu navegador no contacta con ningún tercero para esto.</li>
          </ul>
          <p>
            Si eliges entrar con tu cuenta de Google, Google nos facilita tu nombre y tu correo para identificarte. No vendemos tus datos
            ni los cedemos a terceros con fines publicitarios. Solo los comunicaremos a las autoridades cuando una ley nos obligue.
          </p>

          <h2>6. Transferencias internacionales</h2>
          <p>
            Algunos de estos proveedores tienen su sede en Estados Unidos o pueden acceder a datos desde allí. En esos casos, la
            transferencia se ampara en el Marco de Privacidad de Datos entre la UE y EE. UU., cuando el proveedor está adherido, o en
            las cláusulas contractuales tipo aprobadas por la Comisión Europea.
          </p>

          <h2>7. Cuánto tiempo los conservamos</h2>
          <ul>
            <li>
              Datos de cuenta y de espacio: mientras tengas la cuenta. Cuando la borras, los eliminamos en un plazo máximo de 30 días,
              salvo las copias de seguridad, que se sobrescriben en su ciclo normal.
            </li>
            <li>Datos de facturación: el tiempo que exige la normativa fiscal y mercantil, en general hasta seis años.</li>
            <li>Mensajes de contacto: el tiempo necesario para atenderte y, como máximo, dos años.</li>
            <li>Registros técnicos: hasta doce meses.</li>
          </ul>

          <h2>8. Tus derechos</h2>
          <p>
            Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y
            portabilidad, y retirar el consentimiento que hayas dado, escribiendo a{' '}
            <a href="mailto:contact@placton.tech" className={linkClass}>
              contact@placton.tech
            </a>{' '}
            desde el correo de tu cuenta. Muchos de tus datos puedes cambiarlos o borrarlos tú mismo desde el panel.
          </p>
          <p>
            Si crees que no hemos tratado bien tus datos, puedes presentar una reclamación ante la Agencia Española de Protección de
            Datos (aepd.es).
          </p>

          <h2>9. Cookies</h2>
          <p>
            Usamos solo cookies técnicas necesarias para que el servicio funcione, como la que mantiene tu sesión iniciada y la que recuerda tu idioma. No usamos
            cookies publicitarias ni de seguimiento de terceros. Si algún día las usamos, te pediremos antes tu consentimiento.
          </p>

          <h2>10. Seguridad</h2>
          <p>
            Aplicamos medidas técnicas y organizativas razonables para proteger tus datos: conexiones cifradas (HTTPS), contraseñas
            cifradas, acceso restringido y copias de seguridad. Si se produjera una brecha de seguridad que afectara a tus datos, te
            avisaríamos y lo comunicaríamos a la autoridad de control cuando corresponda.
          </p>

          <h2>11. Menores</h2>
          <p>Placton está dirigido a profesionales y empresas, y no está pensado para menores de 18 años.</p>

          <h2>12. Cambios en esta política</h2>
          <p>
            Si cambiamos esta política de forma relevante, te avisaremos por correo o en el panel antes de que los cambios se apliquen.
          </p>
    </>
  )
}

export default async function PrivacyPage() {
  const { lang, t } = await getT()
  return (
    <section className="pb-20 pt-32 sm:pb-28 sm:pt-40">
      <Container narrow>
        <h1 className="text-[36px] font-extrabold leading-[1.06] tracking-[-0.04em] text-ink sm:text-[48px]">{t('Privacy policy', 'Política de privacidad')}</h1>
        <p className="mt-3 text-[14px] text-mute">{t('Last updated: 16 October 2026', 'Última actualización: 16 de octubre de 2026')}</p>
        <div className="legal mt-8">{lang === 'es' ? <PrivacyEs /> : <PrivacyEn />}</div>
      </Container>
    </section>
  )
}
