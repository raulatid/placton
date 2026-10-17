// Markdown mínimo y seguro para enseñar respuestas de IA: escapa todo el HTML y
// solo reconoce encabezados, listas, negritas y enlaces. Además resalta las
// marcas seguidas. Es solo presentación: la respuesta se guarda intacta.

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function inline(s: string, marks: { term: string; own: boolean }[]): string {
  let out = escape(s)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>')
  for (const m of marks) {
    if (m.term.length < 3) continue
    const re = new RegExp(`(?<![\\w>])(${escapeRe(escape(m.term))})(?![\\w<])`, 'gi')
    out = out.replace(re, `<mark${m.own ? '' : ' class="rival"'}>$1</mark>`)
  }
  return out
}

export function answerHtml(text: string, marks: { term: string; own: boolean }[] = []): string {
  const lines = text.replace(/\r/g, '').split('\n')
  const html: string[] = []
  let list: 'ul' | 'ol' | null = null
  const close = () => {
    if (list) html.push(`</${list}>`)
    list = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      close()
      continue
    }
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) {
      close()
      html.push(`<h4>${inline(h[1], marks)}</h4>`)
      continue
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol'
      if (list !== kind) {
        close()
        html.push(`<${kind}>`)
        list = kind
      }
      html.push(`<li>${inline((ul ?? ol)![1], marks)}</li>`)
      continue
    }
    if (/^\s*\|/.test(line)) {
      // Tablas: se enseñan como texto plano legible.
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue
      close()
      html.push(`<p>${inline(line.replace(/\|/g, ' · ').replace(/^\s*·\s*|\s*·\s*$/g, ''), marks)}</p>`)
      continue
    }
    close()
    html.push(`<p>${inline(line, marks)}</p>`)
  }
  close()
  return html.join('')
}
