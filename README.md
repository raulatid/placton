# Placton

SaaS de visibilidad de marca en IA: cada día pregunta a ChatGPT, Claude, Google AI (AI Overviews),
Perplexity y Grok lo mismo que preguntan los clientes de una marca, y enseña quién sale, en qué
puesto, con qué tono y qué fuentes cita cada IA. Inglés por defecto, español con el selector EN/ES
(cookie `placton_lang`).

El motor de medición viene de GEO Radar (`~/Applications/geo-radar`): mismas reglas (el prompt nunca
menciona la marca; el orden y la identidad los decide el texto, no el modelo; ideas deterministas).

```bash
npm install
cp .env.example .env.local   # y rellena las claves
npm run dev                  # http://localhost:3490
```

## Rutas

| Ruta | Qué es |
| --- | --- |
| `/`, `/pricing`, `/faqs`, `/contact`, `/terms`, `/privacy` | Web pública |
| `/signup`, `/login`, `/forgot-password`, `/reset-password/[token]`, `/invite/[token]` | Cuentas |
| `/onboarding` | Alta: web → marca → competidores → prompts → primera medición |
| `/dashboard` | Resumen, Prompts, Competitors, Mentions, Searches, Sources, Insights, AI Site Audit, Help, Settings (General, Members, Billing), Plans, Account |
| `/admin` | Interno (solo `PLACTON_ADMIN_EMAILS`): clientes, ingreso recurrente, coste de API y errores |
| `/api/cron` | Disparo externo de la medición (semanal por espacio) (`Authorization: Bearer CRON_SECRET`) |
| `/api/stripe/webhook` | Webhook de Stripe |

## Planes y pasarela

`lib/plans.ts` es la única fuente: prueba de 7 días sin tarjeta (10 prompts, 1 miembro), Starter
$59/mes (20 prompts, 2 miembros), Growth $129 (75, 10), Scale $299 (300, ilimitados), cobrados en
dólares. Anual con 15 % de descuento. La suscripción es por espacio de trabajo.

Stripe: los productos y precios se crean solos la primera vez (`lookup_key` `placton_<plan>_<month|year>_usd`).
Checkout para contratar, cambio de plan con prorrateo sin volver a pasar por caja, portal de cliente
para tarjeta y facturas, cancelación al final del periodo. Al volver del Checkout se confirma leyendo
la sesión (no hace falta esperar al webhook); el webhook mantiene todo al día después:
`checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`.

Para producción: claves de la cuenta de Stripe de Placton, webhook apuntando a
`https://<dominio>/api/stripe/webhook` y activar el portal de cliente en el panel de Stripe.

## Plataformas

| Plataforma | Cómo | Variable |
| --- | --- | --- |
| ChatGPT | Responses API con búsqueda web, ubicada en el país del espacio | `OPENAI_API_KEY` (`PLACTON_CHATGPT_MODEL`, por defecto `gpt-5.4-mini`) |
| Claude | Messages API con búsqueda web del servidor | `ANTHROPIC_API_KEY` (`PLACTON_CLAUDE_MODEL`, por defecto `claude-opus-5-5`) |
| Google AI | AI Overview real de Google vía DataForSEO (si no hay, Gemini con búsqueda) | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` (o `GEMINI_API_KEY`) |
| Perplexity | Sonar (vía OpenRouter si no hay clave propia) | `PERPLEXITY_API_KEY` u `OPENROUTER_API_KEY` |
| Grok | `x-ai/grok-4.7` vía OpenRouter con buscador Exa (`PLACTON_GROK_SEARCH=native` para su búsqueda propia) | `XAI_API_KEY` u `OPENROUTER_API_KEY` |

**OpenRouter** (`OPENROUTER_API_KEY`) cubre cualquier plataforma sin clave directa y las tareas internas
si falta la de OpenAI. `PLACTON_PROVIDER=openrouter` fuerza a pasar todo por OpenRouter (una sola
factura). Modelos configurables con `PLACTON_OR_*_MODEL`. Sin ninguna clave, la plataforma sale como
«próximamente» y no se mide.

## Coste medido (16-10-2026)

Prueba real: 3 prompts × 3 plataformas = 9 respuestas, **0,38 $**.

| Plataforma | Coste por respuesta |
| --- | --- |
| ChatGPT (`gpt-5.4-mini` + búsqueda) | 0,014 – 0,040 $ |
| Claude (`claude-opus-5-5` + búsqueda) | 0,045 – 0,19 $ |
| Google AI Overview (DataForSEO) | 0,005 $ |
| Perplexity (`sonar` vía OpenRouter) | 0,006 $ |
| Grok (`grok-4.7` vía OpenRouter, buscador Exa) | 0,02 $ (con su búsqueda nativa: 0,19-0,23 $) |

Con Claude en el modelo grande, el plan Starter (20 prompts al día en 4 plataformas) cuesta del orden
de 75 $/mes de API frente a 59 $ de precio. Hay que elegir: modelo de Claude más barato
(`PLACTON_CLAUDE_MODEL`), medir Claude en días alternos o subir precios. `/admin` enseña el coste real
por espacio y plataforma.

## Medición semanal

`instrumentation.ts` lanza cada hora (desde las 7:00 de Madrid) la medición de los espacios que aún no
tienen el día. Apagado en desarrollo para no gastar API sin querer (`PLACTON_SCHEDULER=1` lo
enciende). Alternativa: un cron externo llamando a `/api/cron`. La medición es idempotente por día.

## Datos

SQLite nativo de Node 24 (`node:sqlite`) en `data/placton.db` (o `PLACTON_DATA_DIR`). En producción,
un solo servidor Node con volumen persistente (p. ej. Railway). Cambiar a Postgres = reescribir
`lib/db.ts` y los SQL de `lib/repo.ts`, `lib/metrics.ts`, `lib/insights.ts`.

## Correo

Resend (`RESEND_API_KEY` + `PLACTON_EMAIL_FROM` con dominio verificado). Sin configurar, los correos se
apuntan en `email_log` y los enlaces (invitaciones, recuperar contraseña) se enseñan en pantalla.

### Resumen semanal y alertas

`lib/digest.ts`, desde la tarea de cada hora (`lib/lifecycle.ts`). Un correo por medición semanal
terminada (se ancla en `workspaces.lastTrackedDay` y se apunta en `digestSentFor`), entre las 8:00 y las
20:59 de Madrid, a quien administra el espacio más los miembros que lo activen. La medición del alta y
«Medir ahora» no mandan nada, ni los espacios sin acceso. Alertas: la visibilidad baja 10 puntos o más,
un competidor te adelanta (5 puntos o más) o hay menciones negativas nuevas.

- `PLACTON_DIGEST=0` lo apaga entero.
- `PLACTON_EMAIL_SECRET` (o, si falta, `CRON_SECRET`) firma el enlace de baja (`/api/email-off/<token>`,
  con baja en un clic de Gmail y Yahoo). Sin ninguna de las dos, el correo va sin enlace de baja y
  remite a Ajustes.
- Vista previa sin enviar: `node --experimental-transform-types scripts/digest-preview.mts <id del espacio> [salida.html]`.

## Captura de la portada

La portada enseña una captura real del panel (`public/landing/dashboard-en-*.webp` y `-es-*.webp`), no una
recreación. Para rehacerla tras cambiar el diseño del panel:

1. `node scripts/demo-captura.mjs` crea (o rehace) el espacio de demostración «Asana» frente a Notion,
   monday.com, ClickUp y Trello con 14 días de datos de ejemplo, e imprime un token de sesión de un día.
2. Con el servidor estable en marcha (`npm run build` y `next start` en el puerto 3491):
   `node scripts/captura.mjs <token> en shot-en.png` y lo mismo con `es`.
3. Convertir a WebP en `public/landing/dashboard-<idioma>-<versión>.webp` (sharp, calidad 86), poner la
   versión nueva en `SHOT_VERSION` de `components/marketing/HeroShot.tsx` (si no, los navegadores siguen
   enseñando la captura vieja que tienen guardada), borrar las anteriores y volver a compilar.

## Verificar cambios

`npm run typecheck` y `npm run build`.
