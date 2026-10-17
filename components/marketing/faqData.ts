import { bi, type Bi } from '@/lib/i18n-shared'
import { PLANS, TRIAL_DAYS, YEARLY_DISCOUNT } from '@/lib/plans'

// Preguntas frecuentes de la web pública, en inglés y en español. Respuestas en
// párrafos de texto plano para reutilizarlas en la página, en la portada y en
// el JSON-LD.

export interface FaqItem {
  id: string
  q: Bi
  a: Bi[]
  link?: { href: string; label: Bi }
}

export interface FaqGroup {
  id: string
  title: Bi
  items: FaqItem[]
}

const D = Math.round(YEARLY_DISCOUNT * 100)
const TRIAL_PROMPTS = PLANS.trial.prompts

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'product',
    title: bi('Product', 'Producto'),
    items: [
      {
        id: 'how-it-works',
        q: bi('How does Placton work?', '¿Cómo funciona Placton?'),
        a: [
          bi(
            'You sign up and add your website. From there we suggest competitors and the questions (prompts) your customers tend to ask. You review the list, remove or add whatever you like, and confirm.',
            'Te registras y añades tu web. A partir de ella te proponemos competidores y las preguntas (prompts) que suelen hacer tus clientes. Revisas la lista, quitas o añades lo que quieras y confirmas.',
          ),
          bi(
            'From then on Placton sends those prompts to the AI platforms every day, stores each answer and analyses it: whether you appear, in what position, with what tone, next to whom and with which sources. You see all of it in your dashboard.',
            'Desde ese momento Placton lanza esos prompts cada día a las plataformas de IA, guarda cada respuesta y la analiza: si apareces, en qué puesto, con qué tono, junto a quién y con qué fuentes. Todo eso lo ves en tu panel.',
          ),
        ],
      },
      {
        id: 'why',
        q: bi('Why should I track my visibility in AI?', '¿Por qué debería medir mi visibilidad en la IA?'),
        a: [
          bi(
            'More and more people ask an AI assistant before they compare options or buy. If the answer recommends three companies and yours is not one of them, nobody tells you: there is no public ranking and no console that shows it.',
            'Cada vez más gente pregunta a un asistente de IA antes de comparar o de comprar. Si la respuesta recomienda a tres empresas y la tuya no está, nadie te avisa: no hay un ranking público ni una consola que te lo diga.',
          ),
          bi(
            'Measuring it tells you where you stand, shows what the brands ahead of you do well and lets you check whether the changes you make actually work.',
            'Medirlo te dice dónde estás, te enseña qué hacen bien las marcas que van por delante y te permite comprobar si los cambios que haces funcionan de verdad.',
          ),
        ],
      },
      {
        id: 'prompt',
        q: bi('What is a prompt?', '¿Qué es un prompt?'),
        a: [
          bi(
            'A prompt is a question we ask the AI platforms on your behalf, such as "best accounting software for freelancers" or "where to buy sourdough in Madrid". Each prompt is asked on every platform, every day.',
            'Un prompt es una pregunta que hacemos a las plataformas de IA en tu nombre, por ejemplo «mejor programa de contabilidad para autónomos» o «dónde comprar pan de masa madre en Madrid». Cada prompt se lanza en todas las plataformas, todos los días.',
          ),
          bi(
            'Your plan sets how many prompts you can track at once. You can change them whenever you like.',
            'Tu plan marca cuántos prompts puedes seguir a la vez. Puedes cambiarlos cuando quieras.',
          ),
        ],
      },
      {
        id: 'mentions',
        q: bi('What is a mention? How are direct and indirect mentions different?', '¿Qué es una mención? ¿Qué diferencia hay entre directa e indirecta?'),
        a: [
          bi(
            'A direct mention is when the AI writes your brand name in its answer. An indirect mention is when the AI uses a page from your website as a source, and links to it, without naming you in the text.',
            'Una mención directa es cuando la IA escribe el nombre de tu marca en la respuesta. Una mención indirecta es cuando la IA usa una página de tu web como fuente, y la enlaza, pero sin nombrarte en el texto.',
          ),
          bi(
            'We count them separately because they mean different things: a direct mention shows the AI knows your brand, an indirect one shows it trusts your content even if it does not recommend you by name yet.',
            'Las contamos por separado porque dicen cosas distintas: la directa indica que la IA conoce tu marca; la indirecta, que confía en tu contenido aunque todavía no te recomiende por tu nombre.',
          ),
        ],
      },
      {
        id: 'citations',
        q: bi('What are cited URLs?', '¿Qué son las citas de URL?'),
        a: [
          bi(
            'They are the links the AI shows as sources for its answer. Placton stores every cited URL, its domain, how often it appears and whether it belongs to you, a competitor or a third party such as a news site, a directory or a forum.',
            'Son los enlaces que la IA muestra como fuentes de su respuesta. Placton guarda cada URL citada, su dominio, cuántas veces aparece y si es tuya, de un competidor o de un tercero, como un medio, un directorio o un foro.',
          ),
          bi(
            'That tells you which pages carry weight in your market and where it pays to be present.',
            'Así sabes qué páginas pesan en las respuestas de tu sector y en cuáles te conviene estar presente.',
          ),
        ],
      },
      {
        id: 'platforms',
        q: bi('Which AI platforms does Placton track?', '¿Qué IA analiza Placton?'),
        a: [
          bi(
            'ChatGPT, Claude, Google AI (the AI Overviews shown in Google results, with Gemini as a backup), Perplexity and Grok.',
            'ChatGPT, Claude, Google AI (los AI Overviews que aparecen en los resultados de Google, con Gemini como respaldo), Perplexity y Grok.',
          ),
        ],
      },
      {
        id: 'frequency',
        q: bi('How often is the data updated?', '¿Cada cuánto se actualizan los datos?'),
        a: [
          bi(
            'Every day. Each prompt is asked daily on every platform in your workspace, so your dashboard gets fresh answers every day.',
            'Cada día. Cada prompt se lanza a diario en todas las plataformas de tu espacio, así que tu panel suma respuestas nuevas todos los días.',
          ),
          bi(
            'AI answers change from one day to the next, which is why the trend over several weeks matters more than any single answer.',
            'Las respuestas de la IA cambian de un día a otro, por eso lo que más cuenta es la tendencia a lo largo de varias semanas y no una respuesta suelta.',
          ),
        ],
      },
      {
        id: 'traffic',
        q: bi('Can Placton help me get more visibility and traffic from AI?', '¿Placton me ayuda a conseguir más visibilidad y tráfico desde la IA?'),
        a: [
          bi(
            'That is the goal. Every week you get personalised insights based on your data: which pages to publish or improve, which outside sources to get listed on and what your competitors are doing better. The 18-point audit also tells you what to fix on your site so AI can read it properly.',
            'Ese es el objetivo. Cada semana recibes ideas personalizadas basadas en tus datos: qué páginas publicar o mejorar, en qué fuentes externas conseguir presencia y qué hace mejor tu competencia. Además, la auditoría de 18 puntos te dice qué corregir en tu web para que la IA la lea bien.',
          ),
          bi(
            'Nobody can guarantee a position in AI answers, but with Placton you will know what to do and be able to measure whether it works.',
            'Nadie puede garantizar un puesto en las respuestas de la IA, pero con Placton sabrás qué hacer y podrás medir si funciona.',
          ),
        ],
      },
    ],
  },
  {
    id: 'billing',
    title: bi('Plans and billing', 'Planes y pagos'),
    items: [
      {
        id: 'trial',
        q: bi('Is there a free trial?', '¿Hay una prueba gratis?'),
        a: [
          bi(
            `Yes. You get ${TRIAL_DAYS} days free, with no card, up to ${TRIAL_PROMPTS} prompts and the audit of your site included.`,
            `Sí. Tienes ${TRIAL_DAYS} días gratis, sin tarjeta, con hasta ${TRIAL_PROMPTS} prompts y la auditoría de tu web incluida.`,
          ),
          bi(
            'When it ends you choose a plan to keep going. If you do not, tracking stops and you are not charged anything.',
            'Cuando termina eliges un plan para seguir. Si no lo haces, el seguimiento se detiene y no se te cobra nada.',
          ),
        ],
      },
      {
        id: 'cancel',
        q: bi('Can I cancel anytime?', '¿Puedo cancelar cuando quiera?'),
        a: [
          bi(
            'Yes, there is no minimum term. Go to Workspace settings, open Subscription and click to manage it: the Stripe portal opens and you can cancel in a moment.',
            'Sí, no hay permanencia. Entra en Ajustes del espacio, abre Suscripción y pulsa para gestionarla: se abrirá el portal de Stripe, donde puedes cancelar en un momento.',
          ),
          bi('You keep access until the end of the period you have already paid for.', 'Seguirás teniendo acceso hasta el final del periodo que ya has pagado.'),
        ],
      },
      {
        id: 'invoices',
        q: bi('How do I get my invoices?', '¿Cómo recibo las facturas?'),
        a: [
          bi(
            'Stripe emails you an invoice with every payment. You can also view and download them at any time from the Stripe portal, under Workspace settings, Subscription.',
            'Stripe te envía la factura por correo con cada cobro. También puedes consultarlas y descargarlas cuando quieras desde el portal de Stripe, en Ajustes del espacio, Suscripción.',
          ),
          bi(
            `Prices are in US dollars and taxes may apply depending on your country. If you pay yearly, you save ${D}% compared with paying monthly.`,
            `Los precios están en dólares (USD) y pueden aplicarse impuestos según tu país. Si pagas el plan anual, ahorras un ${D} % frente al pago mensual.`,
          ),
        ],
      },
    ],
  },
  {
    id: 'account',
    title: bi('Account and team', 'Cuenta y equipo'),
    items: [
      {
        id: 'team',
        q: bi('Can I invite my team?', '¿Puedo invitar a mi equipo?'),
        a: [
          bi('Yes, on paid plans. During the free trial the workspace is just for you.', 'Sí, en los planes de pago. Durante la prueba gratis el espacio es solo para ti.'),
          bi(
            'The subscription and its limits (prompts and members) belong to each workspace. If you look after several brands or clients, you can have one workspace for each, each with its own plan and team.',
            'La suscripción y sus límites (prompts y miembros) van por espacio de trabajo. Si llevas varias marcas o clientes, puedes tener un espacio para cada uno, cada uno con su plan y su equipo.',
          ),
        ],
        link: { href: '/pricing', label: bi('See the members included in each plan', 'Ver los miembros incluidos en cada plan') },
      },
      {
        id: 'delete-account',
        q: bi('How do I delete my account?', '¿Cómo borro mi cuenta?'),
        a: [
          bi('Go to Account and choose Delete account. Your personal data and your access are removed.', 'Desde Cuenta, en la opción Borrar cuenta. Se eliminan tus datos personales y tu acceso.'),
          bi(
            'Workspaces where you are the only member are deleted with you. If other people belong to a workspace, it stays for them. If you have an active subscription, cancel it first from Workspace settings.',
            'Los espacios de trabajo en los que eres el único miembro se borran contigo. Si en un espacio hay más personas, el espacio sigue existiendo para ellas. Si tienes una suscripción activa, cancélala antes desde Ajustes del espacio.',
          ),
        ],
      },
      {
        id: 'data',
        q: bi('What do you do with my data?', '¿Qué hacéis con mis datos?'),
        a: [
          bi(
            'We only use it to provide the service. It is hosted in the European Union, we do not sell it and we do not use it for advertising.',
            'Los usamos solo para darte el servicio. Están alojados en la Unión Europea, no los vendemos y no los usamos para publicidad.',
          ),
          bi(
            'The prompts we send to AI platforms are the ones you set up in your workspace and never include personal data. Payments are handled by Stripe: we never see or store your card number.',
            'Las preguntas que enviamos a las IA son las que configuras en tu espacio y no incluyen datos personales. Los pagos los gestiona Stripe: nunca vemos ni guardamos el número de tu tarjeta.',
          ),
        ],
        link: { href: '/privacy', label: bi('Read the privacy policy', 'Leer la política de privacidad') },
      },
    ],
  },
]

export const ALL_FAQ: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items)

export function faqByIds(ids: string[]): FaqItem[] {
  return ids.map((id) => ALL_FAQ.find((f) => f.id === id)).filter((f): f is FaqItem => Boolean(f))
}

export const HOME_FAQ = ['how-it-works', 'mentions', 'platforms', 'frequency', 'trial', 'cancel', 'team']
