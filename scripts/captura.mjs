// Captura del panel real con Chrome sin ventana (protocolo DevTools).
// Uso: node scripts/captura.mjs <token> <en|es> <salida.png> (con el servidor estable en :3491)
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const [token, lang, out] = process.argv.slice(2)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const prof = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), 'cap-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let targets
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    if (targets.some((t) => t.type === 'page')) break
  } catch {}
  await sleep(250)
}
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
const events = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  } else if (m.method) events.push(m.method)
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
    ws.send(JSON.stringify({ id: n, method, params }))
  })

await send('Network.enable')
await send('Page.enable')
await send('Network.setCookie', { name: 'placton_sesion', value: token, url: 'http://localhost:3491' })
await send('Network.setCookie', { name: 'placton_lang', value: lang, url: 'http://localhost:3491' })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false })
// Sin animaciones de entrada: todo en su estado final.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await send('Page.navigate', { url: 'http://localhost:3491/dashboard' })
for (let i = 0; i < 60 && !events.includes('Page.loadEventFired'); i++) await sleep(250)
await sleep(4000) // logos de /api/logo y fuentes
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 1000, scale: 1 } })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
const loc = await send('Runtime.evaluate', { expression: 'location.pathname + " | " + document.title', returnByValue: true })
console.log('ok', out, loc.result.value)
ws.close()
chrome.kill()
