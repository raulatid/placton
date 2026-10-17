import 'server-only'
import { addDays, all, nowIso, one, run, today } from './db'
import { ask, enginesFor, platformById, type Platform } from './engines'
import { extract } from './extract'
import { refreshInsights } from './insights'
import * as repo from './repo'
import type { Prompt, Run, Workspace } from './types'

// Una medición lanza la matriz prompt × plataforma del día. Cada celda es
// independiente: si una falla se guarda con su error y el resto sigue. Es
// idempotente por día: relanzarla solo rellena las celdas que faltan.

const CONCURRENCY = 4
const STALE_MS = 2 * 60 * 60 * 1000

// El latido (heartbeatAt) se actualiza en cada respuesta. Una medición sin
// latido en 5 minutos se da por cortada (proceso reiniciado). No se usa memoria
// del proceso: en desarrollo cada ruta puede tener su propia copia del módulo.
const ORPHAN_MS = 5 * 60 * 1000

export function activeRun(workspaceId: number): Run | null {
  const r = one<Run>("SELECT * FROM runs WHERE workspaceId = ? AND status = 'corriendo' ORDER BY id DESC LIMIT 1", [workspaceId])
  if (!r) return null
  const beat = (r as Run & { heartbeatAt?: string | null }).heartbeatAt ?? r.startedAt
  if (Date.now() - new Date(beat).getTime() > ORPHAN_MS) {
    run("UPDATE runs SET status = 'error', error = 'Interrumpida', finishedAt = ? WHERE id = ?", [nowIso(), r.id])
    return null
  }
  if (Date.now() - new Date(r.startedAt).getTime() > STALE_MS) {
    run("UPDATE runs SET status = 'error', error = 'Caducada', finishedAt = ? WHERE id = ?", [nowIso(), r.id])
    return null
  }
  return r
}

export function lastRun(workspaceId: number): Run | null {
  return one<Run>('SELECT * FROM runs WHERE workspaceId = ? ORDER BY id DESC LIMIT 1', [workspaceId])
}

export function runById(workspaceId: number, id: number): Run | null {
  return one<Run>('SELECT * FROM runs WHERE id = ? AND workspaceId = ?', [id, workspaceId])
}

interface Cell {
  prompt: Prompt
  platform: Platform
}

/** Celdas del día que aún no tienen respuesta válida. */
/**
 * Cada cuántos días se mide cada prompt en cada plataforma (7 = semanal). Con
 * búsqueda real en internet cada respuesta cuesta ~0,01 $; medir a diario hundía
 * el margen. «Medir ahora» solo mide lo que aún no tenga dato en esta ventana.
 */
export const MEASURE_EVERY_DAYS = Math.max(1, Number(process.env.PLACTON_MEASURE_DAYS) || 7)

function pendingCells(ws: Workspace, day: string): Cell[] {
  const prompts = repo.promptsOf(ws.id, true).slice(0, repo.promptLimit(ws))
  const engines = enginesFor(ws.engines)
    .map((id) => platformById(id))
    .filter((p): p is Platform => Boolean(p?.available))
  const since = addDays(day, -(MEASURE_EVERY_DAYS - 1))
  const done = new Set(
    all<{ promptId: number; engine: string }>('SELECT promptId, engine FROM answers WHERE workspaceId = ? AND day BETWEEN ? AND ? AND error IS NULL', [
      ws.id,
      since,
      day,
    ]).map((r) => `${r.promptId}:${r.engine}`),
  )
  const cells: Cell[] = []
  for (const prompt of prompts) for (const platform of engines) if (!done.has(`${prompt.id}:${platform.id}`)) cells.push({ prompt, platform })
  return cells
}

/**
 * Arranca una medición en segundo plano y devuelve su id al momento. Si ya hay
 * una en marcha para el espacio, devuelve esa.
 */
export function startRun(workspaceId: number, trigger: Run['trigger']): { runId: number | null; reason?: string } {
  const current = activeRun(workspaceId)
  if (current) return { runId: current.id }
  const ws = repo.workspaceById(workspaceId)
  if (!ws) return { runId: null, reason: 'Espacio no encontrado' }
  if (!repo.accessOf(ws).ok) return { runId: null, reason: 'La suscripción no está activa' }

  const day = today()
  const cells = pendingCells(ws, day)
  if (!cells.length) {
    const noPrompts = repo.activePromptCount(ws.id) === 0
    return { runId: null, reason: noPrompts ? 'No hay prompts activos' : 'Esta semana ya está todo medido' }
  }

  const { id: runId } = run('INSERT INTO runs (workspaceId, day, trigger, status, total, startedAt, heartbeatAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    ws.id,
    day,
    trigger,
    'corriendo',
    cells.length,
    nowIso(),
    nowIso(),
  ])
  void execute(ws, runId, day, cells, trigger)
  return { runId }
}

async function execute(ws: Workspace, runId: number, day: string, cells: Cell[], trigger: Run['trigger']) {
  const brands = repo.trackedBrands(ws)
  let done = 0
  let costUsd = 0
  const queue = [...cells]

  const worker = async () => {
    while (queue.length) {
      const cell = queue.shift()
      if (!cell) break
      const { prompt, platform } = cell
      const started = Date.now()
      try {
        const res = await ask(platform, prompt.text, { country: ws.country, language: ws.language })
        const analysis = res.empty ? { mentions: [], citations: [], costUsd: 0 } : await extract(prompt.text, res.text, res.citations, brands)
        const cellCost = res.costUsd + analysis.costUsd
        costUsd += cellCost

        // Si un reintento del mismo día deja una celda con error previo, se sustituye.
        run('DELETE FROM answers WHERE workspaceId = ? AND day = ? AND promptId = ? AND engine = ?', [ws.id, day, prompt.id, platform.id])
        const { id: answerId } = run(
          `INSERT INTO answers (runId, workspaceId, promptId, engine, model, day, text, empty, searchQueries, latencyMs, costUsd, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [runId, ws.id, prompt.id, platform.id, res.model, day, res.text, res.empty ? 1 : 0, JSON.stringify(res.searchQueries), Date.now() - started, cellCost, nowIso()],
        )
        for (const m of analysis.mentions) {
          run(
            `INSERT INTO mentions (answerId, workspaceId, day, engine, promptId, brandKey, name, kind, competitorId, direct, rank, sentiment, quote)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [answerId, ws.id, day, platform.id, prompt.id, m.brandKey, m.name, m.kind, m.competitorId, m.direct ? 1 : 0, m.rank, m.sentiment, m.quote],
          )
        }
        for (const c of analysis.citations) {
          run('INSERT INTO citations (answerId, workspaceId, day, engine, url, domain, title, brandKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            answerId,
            ws.id,
            day,
            platform.id,
            c.url,
            c.domain,
            c.title,
            c.brandKey,
          ])
        }
      } catch (err) {
        const message = ((err as Error).message ?? 'Error desconocido').slice(0, 500)
        run('DELETE FROM answers WHERE workspaceId = ? AND day = ? AND promptId = ? AND engine = ? AND error IS NOT NULL', [ws.id, day, prompt.id, platform.id])
        run(
          `INSERT INTO answers (runId, workspaceId, promptId, engine, model, day, latencyMs, error, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [runId, ws.id, prompt.id, platform.id, platform.model, day, Date.now() - started, message, nowIso()],
        )
      } finally {
        done++
        run('UPDATE runs SET done = ?, costUsd = ?, heartbeatAt = ? WHERE id = ?', [done, costUsd, nowIso(), runId])
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cells.length) }, worker))
    run("UPDATE runs SET status = 'ok', error = NULL, finishedAt = ?, costUsd = ? WHERE id = ?", [nowIso(), costUsd, runId])
    // Solo las mediciones completas (alta y semanal) marcan el ciclo; «Medir ahora»
    // mide prompts nuevos y no debe retrasar la medición de la semana.
    if (trigger !== 'manual') repo.updateWorkspace(ws.id, { lastTrackedDay: day })
    try {
      refreshInsights(repo.workspaceById(ws.id)!)
    } catch (err) {
      console.error('[placton] ideas', err)
    }
  } catch (err) {
    run("UPDATE runs SET status = 'error', error = ?, finishedAt = ?, costUsd = ? WHERE id = ?", [
      ((err as Error).message ?? 'Error').slice(0, 500),
      nowIso(),
      costUsd,
      runId,
    ])
  }
}

/** Lo que llama el programador cada hora: mide los espacios que aún no tienen el día. */
export async function runDaily(): Promise<{ started: number[]; skipped: number }> {
  const day = today()
  const started: number[] = []
  let skipped = 0
  for (const ws of repo.allWorkspaces()) {
    // Una medición completa por ventana (semanal): se espera a que pasen los días.
    const recent = ws.lastTrackedDay && ws.lastTrackedDay > addDays(day, -MEASURE_EVERY_DAYS)
    if (!ws.onboarded || !repo.accessOf(ws).ok || recent) {
      skipped++
      continue
    }
    const { runId } = startRun(ws.id, 'diario')
    if (!runId) {
      skipped++
      continue
    }
    started.push(ws.id)
    // De uno en uno: así no se pisan los límites de las APIs entre clientes.
    while (activeRun(ws.id)) await new Promise((r) => setTimeout(r, 5000))
  }
  return { started, skipped }
}
