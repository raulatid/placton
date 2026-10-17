import 'server-only'
import { all, nowIso, one, run } from './db'
import { fetchPage, metaContent, normalizeUrl, pageText } from './ai'
import { bi, type Bi, type Lang } from './i18n-shared'

// Auditoría de preparación para IA: 18 comprobaciones deterministas sobre la
// portada, robots.txt, sitemap y llms.txt. Sin modelos: cada resultado se puede
// reproducir abriendo la web.

export type CheckStatus = 'ok' | 'aviso' | 'fallo'

export type CheckGroup = 'acceso' | 'contenido' | 'datos' | 'tecnico'

export const GROUP_LABEL: Record<CheckGroup, Bi> = {
  acceso: bi('AI access', 'Acceso para IA'),
  contenido: bi('Content', 'Contenido'),
  datos: bi('Structured data', 'Datos estructurados'),
  tecnico: bi('Technical', 'Técnico'),
}

export interface CheckResult {
  id: string
  group: CheckGroup
  label: Bi
  status: CheckStatus
  detail: Bi
  fix: Bi
}

export interface AuditRecord {
  id: number
  workspaceId: number
  url: string
  score: number
  results: CheckResult[]
  createdAt: string
}

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended']

/** Reglas de robots.txt que afectan a un agente concreto (grupo propio o «*»). */
function blockedRoot(robots: string, agent: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = []
  let current: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const [k, ...rest] = line.split(':')
    const field = k.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((field === 'disallow' || field === 'allow') && current) {
      current.rules.push({ allow: field === 'allow', path: value })
      lastWasAgent = false
    } else {
      lastWasAgent = false
    }
  }
  const specific = groups.find((g) => g.agents.includes(agent.toLowerCase()))
  const group = specific ?? groups.find((g) => g.agents.includes('*'))
  if (!group) return false
  const rootDisallow = group.rules.some((r) => !r.allow && r.path === '/')
  const rootAllow = group.rules.some((r) => r.allow && r.path === '/')
  return rootDisallow && !rootAllow
}

export async function runAudit(rawUrl: string, ui: Lang = 'en'): Promise<{ url: string; score: number; results: CheckResult[] } | { error: string }> {
  const t = (en: string, es: string) => (ui === 'es' ? es : en)
  const url = normalizeUrl(rawUrl)
  if (!url) return { error: t('That address is not valid.', 'La dirección no es válida.') }
  const page = await fetchPage(url, 15000)
  if (!page) return { error: t('We could not open that website. Check it is online and try again.', 'No hemos podido abrir esa web. Comprueba que está publicada y vuelve a intentarlo.') }
  if (page.status >= 400) return { error: t(`The website answered with error ${page.status}.`, `La web respondió con un error ${page.status}.`) }

  const origin = new URL(page.finalUrl).origin
  const [robotsRes, llmsRes] = await Promise.all([fetchPage(`${origin}/robots.txt`, 8000), fetchPage(`${origin}/llms.txt`, 8000)])
  const robots = robotsRes && robotsRes.status < 400 && !/<html/i.test(robotsRes.html.slice(0, 200)) ? robotsRes.html : null
  const sitemapUrl = robots?.match(/^\s*sitemap:\s*(\S+)/im)?.[1] ?? `${origin}/sitemap.xml`
  const sitemapRes = await fetchPage(sitemapUrl, 8000)

  const html = page.html
  const text = pageText(html)
  const words = text.split(/\s+/).filter((w) => w.length > 1).length
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
  const description = metaContent(html, 'description')
  const h1s = html.match(/<h1[\s>]/gi)?.length ?? 0
  const lang = html.match(/<html[^>]*\blang=["']?([a-zA-Z-]+)/i)?.[1] ?? ''
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const ldText = jsonLd.join(' ')
  const robotsMeta = metaContent(html, 'robots')
  const imgs = html.match(/<img\b[^>]*>/gi) ?? []
  const withAlt = imgs.filter((i) => /\balt=["'][^"']+["']/i.test(i)).length

  const results: CheckResult[] = []
  const add = (r: CheckResult) => results.push(r)
  const blocked = robots ? AI_BOTS.filter((b) => blockedRoot(robots, b)) : []
  const sitemapOk = Boolean(sitemapRes && sitemapRes.status < 400 && /<(urlset|sitemapindex)/i.test(sitemapRes.html))
  const llmsOk = Boolean(llmsRes && llmsRes.status < 400 && llmsRes.html.trim().length > 30 && !/<html/i.test(llmsRes.html.slice(0, 300)))
  const https = page.finalUrl.startsWith('https://')
  const noindex = /noindex/i.test(robotsMeta)
  const canonical = /<link[^>]+rel=["']canonical["']/i.test(html)
  const secs = (page.ms / 1000).toFixed(1)
  const faqLd = /FAQPage/i.test(ldText)
  const faqVisible = /preguntas frecuentes|faq|frequently asked/i.test(text)
  const altRatio = imgs.length ? withAlt / imgs.length : 1
  const orgLd = /"@type"\s*:\s*"?(Organization|LocalBusiness|Corporation|ProfessionalService|Store|Restaurant|[A-Za-z]+Business)/i.test(ldText)
  const ogTitle = metaContent(html, 'og:title')
  const ogDesc = metaContent(html, 'og:description')

  // Técnico
  add({
    id: 'https',
    group: 'tecnico',
    label: bi('Secure connection (HTTPS)', 'Conexión segura (HTTPS)'),
    status: https ? 'ok' : 'fallo',
    detail: https ? bi('The site is served over HTTPS.', 'La web se sirve por HTTPS.') : bi('The site is served unencrypted.', 'La web se sirve sin cifrar.'),
    fix: bi('Install an SSL certificate and redirect all traffic to https.', 'Activa un certificado SSL y redirige todo el tráfico a https.'),
  })
  add({
    id: 'velocidad',
    group: 'tecnico',
    label: bi('Fast response', 'Respuesta rápida'),
    status: page.ms < 1500 ? 'ok' : page.ms < 3500 ? 'aviso' : 'fallo',
    detail: bi(`The homepage took ${secs} s to respond.`, `La portada tardó ${secs.replace('.', ',')} s en responder.`),
    fix: bi('AI crawlers give up on slow pages. Enable caching, compress images and review your hosting.', 'Los rastreadores de IA abandonan las páginas lentas. Activa caché, comprime imágenes y revisa el alojamiento.'),
  })
  add({
    id: 'indexable',
    group: 'tecnico',
    label: bi('Indexable page', 'Página indexable'),
    status: noindex ? 'fallo' : 'ok',
    detail: noindex ? bi('The homepage asks not to be indexed (noindex).', 'La portada pide no ser indexada (noindex).') : bi('Nothing prevents indexing the homepage.', 'Nada impide indexar la portada.'),
    fix: bi('Remove "noindex" from the meta robots tag of the pages you want to be found.', 'Quita «noindex» de la etiqueta meta robots de las páginas que quieras que encuentren.'),
  })
  add({
    id: 'canonica',
    group: 'tecnico',
    label: bi('Canonical URL', 'URL canónica'),
    status: canonical ? 'ok' : 'aviso',
    detail: canonical ? bi('A canonical URL is declared.', 'Declara su URL canónica.') : bi('No canonical URL declared.', 'No declara URL canónica.'),
    fix: bi('Add <link rel="canonical"> so citations are not split between versions of the same page.', 'Añade <link rel="canonical"> para que no se repartan las citas entre versiones de la misma página.'),
  })
  add({
    id: 'idioma',
    group: 'tecnico',
    label: bi('Declared language', 'Idioma declarado'),
    status: lang ? 'ok' : 'aviso',
    detail: lang ? bi(`Declared language: ${lang}.`, `Idioma declarado: ${lang}.`) : bi('The <html> tag does not declare a language.', 'La etiqueta <html> no declara idioma.'),
    fix: bi('Add lang="en" (or the right one) to the <html> tag.', 'Añade lang="es" (o el que toque) a la etiqueta <html>.'),
  })

  // Acceso para IA
  add({
    id: 'robots',
    group: 'acceso',
    label: bi('robots.txt file', 'Archivo robots.txt'),
    status: robots ? 'ok' : 'aviso',
    detail: robots ? bi('robots.txt is published.', 'Hay robots.txt publicado.') : bi('There is no robots.txt.', 'No hay robots.txt.'),
    fix: bi('Publish a robots.txt with your crawl rules and the address of your sitemap.', 'Publica un robots.txt con las reglas de rastreo y la dirección de tu sitemap.'),
  })
  add({
    id: 'bots-ia',
    group: 'acceso',
    label: bi('AI crawlers allowed', 'Rastreadores de IA permitidos'),
    status: blocked.length === 0 ? 'ok' : blocked.length >= 3 ? 'fallo' : 'aviso',
    detail: blocked.length ? bi(`Blocked: ${blocked.join(', ')}.`, `Bloqueados: ${blocked.join(', ')}.`) : bi('No AI crawler is blocked.', 'Ningún rastreador de IA está bloqueado.'),
    fix: bi(
      'If you want to appear in their answers, allow GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Google-Extended in robots.txt.',
      'Si quieres aparecer en sus respuestas, deja pasar a GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot y Google-Extended en robots.txt.',
    ),
  })
  add({
    id: 'sitemap',
    group: 'acceso',
    label: bi('XML sitemap', 'Sitemap XML'),
    status: sitemapOk ? 'ok' : 'aviso',
    detail: sitemapOk ? bi('The sitemap is reachable.', 'El sitemap es accesible.') : bi('No valid sitemap found.', 'No encontramos un sitemap válido.'),
    fix: bi('Publish /sitemap.xml with all your important pages and link it from robots.txt.', 'Publica /sitemap.xml con todas tus páginas importantes y enlázalo desde robots.txt.'),
  })
  add({
    id: 'llms',
    group: 'acceso',
    label: bi('llms.txt file', 'Archivo llms.txt'),
    status: llmsOk ? 'ok' : 'aviso',
    detail: llmsOk ? bi('llms.txt is published.', 'Publica llms.txt.') : bi('There is no llms.txt.', 'No hay llms.txt.'),
    fix: bi(
      'Publish /llms.txt: a plain-text summary of who you are, what you sell and your key pages, written for language models.',
      'Publica /llms.txt: un resumen en texto de quién eres, qué vendes y tus páginas clave, pensado para modelos de lenguaje.',
    ),
  })
  add({
    id: 'sin-js',
    group: 'acceso',
    label: bi('Content visible without JavaScript', 'Contenido visible sin JavaScript'),
    status: words >= 300 ? 'ok' : words >= 120 ? 'aviso' : 'fallo',
    detail: bi(`The homepage delivers ${words} words in its initial HTML.`, `La portada entrega ${words} palabras en el HTML inicial.`),
    fix: bi('Many AI crawlers do not run JavaScript. Serve the important text in the HTML (server-side rendering).', 'Muchos rastreadores de IA no ejecutan JavaScript. Sirve el texto importante en el HTML (renderizado en servidor).'),
  })

  // Contenido
  add({
    id: 'titulo',
    group: 'contenido',
    label: bi('Descriptive title', 'Título descriptivo'),
    status: title.length >= 10 && title.length <= 65 ? 'ok' : title ? 'aviso' : 'fallo',
    detail: title ? bi(`"${title.slice(0, 80)}" (${title.length} characters).`, `«${title.slice(0, 80)}» (${title.length} caracteres).`) : bi('The page has no title.', 'La página no tiene título.'),
    fix: bi('A 10 to 65 character title that says what you do and where.', 'Un título de 10 a 65 caracteres que diga qué haces y dónde.'),
  })
  add({
    id: 'descripcion',
    group: 'contenido',
    label: bi('Meta description', 'Meta descripción'),
    status: description.length >= 50 && description.length <= 170 ? 'ok' : description ? 'aviso' : 'fallo',
    detail: description ? bi(`${description.length} characters.`, `${description.length} caracteres.`) : bi('There is no meta description.', 'No tiene meta descripción.'),
    fix: bi('Write a 50 to 170 character description that sums up your offer.', 'Escribe una descripción de 50 a 170 caracteres que resuma tu propuesta.'),
  })
  add({
    id: 'h1',
    group: 'contenido',
    label: bi('One main heading (H1)', 'Un encabezado principal (H1)'),
    status: h1s === 1 ? 'ok' : h1s === 0 ? 'fallo' : 'aviso',
    detail: h1s === 1 ? bi('It has a single H1.', 'Tiene un único H1.') : h1s === 0 ? bi('It has no H1.', 'No tiene H1.') : bi(`It has ${h1s} H1 tags.`, `Tiene ${h1s} H1.`),
    fix: bi('Use one H1 that clearly says what you offer.', 'Usa un solo H1 que diga claramente qué ofreces.'),
  })
  add({
    id: 'faq',
    group: 'contenido',
    label: bi('Frequently asked questions', 'Preguntas frecuentes'),
    status: faqLd ? 'ok' : faqVisible ? 'aviso' : 'fallo',
    detail: faqLd
      ? bi('FAQs are marked up with FAQPage.', 'Tiene preguntas frecuentes marcadas con FAQPage.')
      : faqVisible
        ? bi('There are FAQs, but without markup.', 'Tiene preguntas frecuentes, pero sin marcar.')
        : bi('No FAQs found.', 'No encontramos preguntas frecuentes.'),
    fix: bi('AI assistants love direct answers. Add an FAQ section and mark it up with FAQPage.', 'Las IA citan mucho las respuestas directas. Añade una sección de preguntas frecuentes y márcala con FAQPage.'),
  })
  add({
    id: 'alt',
    group: 'contenido',
    label: bi('Images with alt text', 'Imágenes con texto alternativo'),
    status: altRatio >= 0.8 ? 'ok' : altRatio >= 0.4 ? 'aviso' : 'fallo',
    detail: imgs.length ? bi(`${withAlt} of ${imgs.length} images have alt text.`, `${withAlt} de ${imgs.length} imágenes tienen alt.`) : bi('There are no images on the homepage.', 'No hay imágenes en la portada.'),
    fix: bi('Describe every image in its alt attribute: it is text models do read.', 'Describe cada imagen en su atributo alt: es texto que los modelos sí leen.'),
  })

  // Datos estructurados
  add({
    id: 'jsonld',
    group: 'datos',
    label: bi('Structured data (JSON-LD)', 'Datos estructurados (JSON-LD)'),
    status: jsonLd.length ? 'ok' : 'fallo',
    detail: jsonLd.length ? bi(`${jsonLd.length} JSON-LD block(s).`, `${jsonLd.length} bloque(s) JSON-LD.`) : bi('There is no structured data.', 'No hay datos estructurados.'),
    fix: bi('Add schema.org JSON-LD: it helps AI understand who you are without guessing.', 'Añade JSON-LD de schema.org: ayuda a las IA a entender quién eres sin adivinar.'),
  })
  add({
    id: 'organizacion',
    group: 'datos',
    label: bi('Organization profile', 'Ficha de organización'),
    status: orgLd ? 'ok' : 'fallo',
    detail: orgLd ? bi('Declares Organization or LocalBusiness.', 'Declara Organization o LocalBusiness.') : bi('Does not declare Organization or LocalBusiness.', 'No declara Organization ni LocalBusiness.'),
    fix: bi(
      'Add an Organization (or LocalBusiness) block with name, logo, address, phone and social profiles (sameAs).',
      'Añade un bloque Organization (o LocalBusiness) con nombre, logo, dirección, teléfono y perfiles sociales (sameAs).',
    ),
  })
  add({
    id: 'opengraph',
    group: 'datos',
    label: bi('Open Graph tags', 'Etiquetas Open Graph'),
    status: ogTitle && ogDesc ? 'ok' : ogTitle ? 'aviso' : 'fallo',
    detail: ogTitle ? bi('Open Graph tags are present.', 'Tiene etiquetas Open Graph.') : bi('Open Graph tags are missing.', 'Faltan etiquetas Open Graph.'),
    fix: bi('Add og:title, og:description and og:image so your site is summarised well when shared and cited.', 'Añade og:title, og:description y og:image para que tu web se resuma bien al compartirse y citarse.'),
  })

  const score = Math.round((results.reduce((s, r) => s + (r.status === 'ok' ? 1 : r.status === 'aviso' ? 0.5 : 0), 0) / results.length) * 100)
  return { url: page.finalUrl, score, results }
}

export function saveAudit(workspaceId: number, url: string, score: number, results: CheckResult[]): number {
  return run('INSERT INTO audits (workspaceId, url, score, results, createdAt) VALUES (?, ?, ?, ?, ?)', [workspaceId, url, score, JSON.stringify(results), nowIso()]).id
}

export function auditsOf(workspaceId: number): AuditRecord[] {
  return all<Omit<AuditRecord, 'results'> & { results: string }>('SELECT * FROM audits WHERE workspaceId = ? ORDER BY createdAt DESC LIMIT 20', [workspaceId]).map((r) => ({
    ...r,
    results: JSON.parse(r.results) as CheckResult[],
  }))
}

export function auditById(workspaceId: number, id: number): AuditRecord | null {
  const r = one<Omit<AuditRecord, 'results'> & { results: string }>('SELECT * FROM audits WHERE id = ? AND workspaceId = ?', [id, workspaceId])
  return r ? { ...r, results: JSON.parse(r.results) as CheckResult[] } : null
}
