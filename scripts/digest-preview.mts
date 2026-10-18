// Vista previa del resumen semanal por correo de un espacio, SIN enviarlo:
// guarda el HTML y enseña el asunto, la versión en texto y por qué se mandaría
// o no. Lee la base de siempre (data/placton.db o PLACTON_DATA_DIR).
//
//   node --experimental-transform-types scripts/digest-preview.mts <id del espacio> [salida.html] [día AAAA-MM-DD]
//
// (La opción hace falta porque lib/engines usa sintaxis de TypeScript que Node no
// quita por sí solo.)
//
// Por defecto el día es el de su última medición (lastTrackedDay) y la salida,
// digest-<id>.html en la carpeta actual.

import { existsSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Los módulos de lib/ se escriben para Next (rutas sin extensión, alias @/ y el
// candado 'server-only'). Esto deja cargarlos con Node tal cual, sin compilar.
const root = fileURLToPath(new URL('..', import.meta.url))
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }
    let target: string | null = null
    if (specifier.startsWith('@/')) target = path.join(root, specifier.slice(2))
    else if (/^\.{1,2}\//.test(specifier) && context.parentURL?.startsWith('file:')) target = path.join(path.dirname(fileURLToPath(context.parentURL)), specifier)
    if (target && !path.extname(target)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        if (existsSync(target + ext)) return { url: pathToFileURL(target + ext).href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const [idArg, outArg, dayArg] = process.argv.slice(2)
const id = Number(idArg)
if (!Number.isInteger(id) || id <= 0) {
  console.error('Uso: node --experimental-transform-types scripts/digest-preview.mts <id del espacio> [salida.html] [día AAAA-MM-DD]')
  process.exit(1)
}

const { buildDigest, hasAlerts, recipients } = await import('../lib/digest')
const { renderEmail } = await import('../lib/email')
const repo = await import('../lib/repo')

const ws = repo.workspaceById(id)
if (!ws) {
  console.error(`No existe el espacio ${id}`)
  process.exit(1)
}
const end = dayArg || ws.lastTrackedDay
if (!end) {
  console.error(`El espacio ${id} aún no tiene ninguna medición terminada`)
  process.exit(1)
}

const { data, email } = buildDigest(ws, undefined, end)
const { html, text } = renderEmail(email)
const out = path.resolve(outArg || `digest-${id}.html`)
writeFileSync(out, html)

const to = recipients(ws.id)
console.log(`Espacio ${ws.id} · ${ws.name} · idioma ${data.lang} · modo ${ws.digestMode ?? 'all'}`)
console.log(`Semana ${data.from} a ${data.to}: ${data.searches} respuestas (anterior: ${data.prevSearches})`)
console.log(`Destinatarios: ${to.length ? to.map((r) => `${r.email} (${r.role})`).join(', ') : 'nadie'}`)
console.log(`Alertas: ${hasAlerts(data) ? [data.drop && 'caída', data.overtaken && 'te adelantan', data.freshNegative && 'tono negativo'].filter(Boolean).join(', ') : 'ninguna'}`)
if (data.searches < 3) console.log('Aviso: menos de 3 respuestas en la semana, no se enviaría.')
console.log(`Asunto: ${email.subject}`)
console.log(`HTML guardado en ${out}\n`)
console.log(text)
