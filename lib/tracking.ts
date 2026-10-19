import 'server-only'
import { addDays, all, nowIso, one, run, today } from './db'
import { ask, enginesFor, getGoogleTask, platformById, postGoogleTasks, type AskResult, type Platform } from './engines'
import { extract, type ExtractedCompany } from './extract'
import { refreshInsights } from './insights'
import { reportError } from './monitor'
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
  if (Date.now() - new Date(r.startedAt).getTime() > STALE_MS && Date.now() - new Date(beat).getTime() > ORPHAN_MS) {
    run("UPDATE runs SET status = 'error', error = 'Caducada', finishedAt = ? WHERE id = ?", [nowIso(), r.id])
    return null
  }
  return r
}

/**
 * Al arrancar el servidor (cada despliegue) ninguna medición puede seguir en
 * marcha: las que estaban «corriendo» se cortaron. Se marcan como interrumpidas
 * y se relanzan para completar lo que faltase (la ventana semanal evita repetir).
 */
export function resumeInterrupted(): number[] {
  const cut = all<{ id: number; workspaceId: number; trigger: Run['trigger'] }>("SELECT id, workspaceId, trigger FROM runs WHERE status = 'corriendo'")
  const recent = all<{ id: number; workspaceId: number; trigger: Run['trigger'] }>(
    "SELECT id, workspaceId, trigger FROM runs WHERE status = 'error' AND error = 'Interrumpida' AND finishedAt > ?",
    [new Date(Date.now() - 6 * 3_600_000).toISOString()],
  )
  for (const r of cut) run("UPDATE runs SET status = 'error', error = 'Interrumpida', finishedAt = ? WHERE id = ?", [nowIso(), r.id])
  const resumed: number[] = []
  const seen = new Set<number>()
  for (const r of [...cut, ...recent]) {
    if (seen.has(r.workspaceId)) continue
    seen.add(r.workspaceId)
    const { runId } = startRun(r.workspaceId, r.trigger)
    if (runId) resumed.push(r.workspaceId)
  }
  return resumed
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

/**
 * Cada cuántos días se mide cada prompt en cada plataforma (7 = semanal). Con
 * búsqueda real en internet cada respuesta cuesta ~0,01 $; medir a diario hundía
 * el margen. «Medir ahora» solo mide lo que aún no tenga dato en esta ventana.
 */
export const MEASURE_EVERY_DAYS = Math.max(1, Number(process.env.PLACTON_MEASURE_DAYS) || 7)

/**
 * Desde qué día cuenta una respuesta: `done`, las del propio espacio que ya no se
 * vuelven a medir; `share`, las de otros espacios que se pueden reutilizar.
 */
interface MeasureWindow {
  done: string
  share: string
}

/** La ventana normal: la semana que acaba hoy. */
function weekWindow(day: string): MeasureWindow {
  const since = addDays(day, -(MEASURE_EVERY_DAYS - 1))
  return { done: since, share: since }
}

/* ───────────── Prueba gratis: dos mediciones automáticas como mucho ─────────────
 * Cada medición de una prueba cuesta ≈0,46 $ (10 prompts × 5 IA). En vez de la
 * semanal del día 7 (cuando la prueba ya se acaba), la prueba tiene:
 *   1. La medición del alta.
 *   2. UNA segunda medición, a partir del día 4 (día de la primera medición + 3,
 *      en días naturales de Madrid) y solo si la persona ha vuelto al panel después
 *      de la primera: 6 horas después de que terminara, o ya otro día.
 * Y un solo «Medir ahora» en toda la prueba. Los espacios de pago no cambian. */

/** La segunda medición, como pronto este número de días naturales después de la primera. */
export const TRIAL_SECOND_AFTER_DAYS = 3
/** Ha vuelto si entra al panel estas horas después de terminar la primera medición (o ya otro día). */
export const TRIAL_RETURN_GAP_MS = 6 * 3_600_000
/** «Medir ahora» en toda la prueba. */
export const TRIAL_MANUAL_RUNS = 1

const AUTO_TRIGGERS = "trigger IN ('alta', 'diario')"

export interface TrialMeasurements {
  /**
   * La primera medición terminada bien, por orden de creación: la del alta (o su
   * reintento automático). Si el alta falló y la persona la rehízo con «Medir
   * ahora», cuenta esa, y una automática posterior ya es la segunda.
   */
  first: { id: number; day: string; finishedAt: string } | null
  /** ¿Ya terminó bien la segunda? */
  second: boolean
  /** Día en que empezó la segunda (aunque fallara y se esté reintentando). */
  secondStartDay: string | null
}

/** Las mediciones automáticas de una prueba, leídas de `runs`. */
export function trialMeasurements(workspaceId: number): TrialMeasurements {
  const first = one<{ id: number; day: string; finishedAt: string }>(
    `SELECT id, day, COALESCE(finishedAt, startedAt) AS finishedAt FROM runs WHERE workspaceId = ? AND status = 'ok' ORDER BY id LIMIT 1`,
    [workspaceId],
  )
  if (!first) return { first: null, second: false, secondStartDay: null }
  // Lo que se relance el mismo día o al siguiente (una medición cortada por un
  // reinicio) sigue siendo la primera; la segunda empieza como pronto el día 4.
  const from = addDays(first.day, TRIAL_SECOND_AFTER_DAYS)
  const later = one<{ start: string | null; ok: number | null }>(
    `SELECT MIN(day) AS start, MAX(status = 'ok') AS ok FROM runs WHERE workspaceId = ? AND ${AUTO_TRIGGERS} AND id > ? AND day >= ?`,
    [workspaceId, first.id, from],
  )
  return { first, second: Boolean(later?.ok), secondStartDay: later?.start ?? null }
}

/** ¿Ha vuelto al panel después de la primera medición? */
export function returnedAfter(lastVisitAt: string | null | undefined, firstFinishedAt: string): boolean {
  if (!lastVisitAt) return false
  const visit = new Date(lastVisitAt)
  const end = new Date(firstFinishedAt)
  if (Number.isNaN(visit.getTime()) || Number.isNaN(end.getTime())) return false
  return visit.getTime() - end.getTime() >= TRIAL_RETURN_GAP_MS || today(visit) > today(end)
}

export type TrialStep =
  | { run: true; why: 'primera' | 'segunda' }
  | { run: false; why: 'correo' | 'antes-del-dia-4' | 'no-ha-vuelto' | 'hecha' }

/**
 * Lo que toca hoy a una prueba gratis en la medición automática. Sin base de
 * datos ni reloj: todo entra como datos, así se puede probar con fechas.
 *  - Sin primera medición terminada: se (re)intenta, salvo que el correo esté sin confirmar.
 *  - Con las dos hechas: nada más en toda la prueba.
 *  - Con la primera: la segunda a partir del día 4 y solo si ha vuelto al panel.
 */
export function trialStep(s: { day: string; m: TrialMeasurements; lastVisitAt: string | null | undefined; emailPending: boolean }): TrialStep {
  if (!s.m.first) return s.emailPending ? { run: false, why: 'correo' } : { run: true, why: 'primera' }
  if (s.m.second) return { run: false, why: 'hecha' }
  if (s.day < addDays(s.m.first.day, TRIAL_SECOND_AFTER_DAYS)) return { run: false, why: 'antes-del-dia-4' }
  if (!returnedAfter(s.lastVisitAt, s.m.first.finishedAt)) return { run: false, why: 'no-ha-vuelto' }
  return { run: true, why: 'segunda' }
}

/** «Medir ahora» que le quedan a una prueba gratis; null = sin límite (de pago). Las que fallaron enteras no cuentan. */
export function trialManualRunsLeft(ws: Workspace): number | null {
  if (!repo.isFreeTrial(ws)) return null
  const used = one<{ n: number }>("SELECT COUNT(*) AS n FROM runs WHERE workspaceId = ? AND trigger = 'manual' AND status IN ('ok', 'corriendo')", [ws.id])?.n ?? 0
  return Math.max(0, TRIAL_MANUAL_RUNS - used)
}

/**
 * Freno de startRun para una prueba gratis (también cubre las mediciones que se
 * reanudan tras un reinicio). La segunda medición vuelve a medirlo todo: su
 * ventana empieza el día en que empezó ella, y solo reutiliza respuestas de otros
 * espacios posteriores a la primera (si no, la semana de la primera la daría por hecha).
 */
function trialGate(ws: Workspace, trigger: Run['trigger'], day: string): { window: MeasureWindow } | { reason: string } {
  if (trigger === 'alta') return { window: weekWindow(day) }
  if (trigger === 'manual') {
    return trialManualRunsLeft(ws) === 0 ? { reason: 'La prueba gratis incluye un «Medir ahora» y ya lo has usado' } : { window: weekWindow(day) }
  }
  const m = trialMeasurements(ws.id)
  // Sin primera medición terminada (el alta falló o se cortó): se completa la primera.
  if (!m.first) return { window: weekWindow(day) }
  if (m.second) return { reason: 'La prueba gratis ya tiene sus dos mediciones' }
  if (day < addDays(m.first.day, TRIAL_SECOND_AFTER_DAYS)) return { reason: 'La segunda medición de la prueba es a partir del cuarto día' }
  const week = weekWindow(day)
  const afterFirst = addDays(m.first.day, 1)
  return { window: { done: m.secondStartDay ?? day, share: afterFirst > week.share ? afterFirst : week.share } }
}

/** Celdas que aún no tienen respuesta válida desde `since` (por defecto, en la semana). */
function pendingCells(ws: Workspace, day: string, since = weekWindow(day).done): Cell[] {
  const prompts = repo.promptsOf(ws.id, true).slice(0, repo.promptLimit(ws))
  const engines = enginesFor(ws.engines)
    .map((id) => platformById(id))
    .filter((p): p is Platform => Boolean(p?.available))
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
export function startRun(workspaceId: number, trigger: Run['trigger'], opts: { bypassTrial?: boolean } = {}): { runId: number | null; reason?: string } {
  const current = activeRun(workspaceId)
  if (current) return { runId: current.id }
  const ws = repo.workspaceById(workspaceId)
  if (!ws) return { runId: null, reason: 'Espacio no encontrado' }
  if (!repo.accessOf(ws).ok) return { runId: null, reason: 'La suscripción no está activa' }

  const day = today()
  let window = weekWindow(day)
  // Los administradores (pruebas internas) no tienen los límites de la prueba gratis.
  if (repo.isFreeTrial(ws) && !opts.bypassTrial) {
    const gate = trialGate(ws, trigger, day)
    if ('reason' in gate) return { runId: null, reason: gate.reason }
    window = gate.window
  }
  const cells = pendingCells(ws, day, window.done)
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
  void execute(ws, runId, day, cells, trigger, window.share)
  return { runId }
}

/** Clave de la pregunta para compartir respuestas: texto normalizado + país + idioma. */
export function promptKey(text: string, country: string, language: string): string {
  const t = text.toLowerCase().replace(/\s+/g, ' ').replace(/^[¿¡\s]+|[?!.\s]+$/g, '').trim()
  return `${t}|${country.toLowerCase()}|${language.toLowerCase()}`
}

/**
 * Lectura de la IA (empresas, tono y cita) guardada con cada respuesta original,
 * para que sus copias en otros espacios no la vuelvan a pagar. La columna la crea
 * db.ts al abrir la base; esto cubre un proceso que ya la tenía abierta antes de
 * esa migración. Solo se da por creada si existe: cualquier otro fallo (base
 * bloqueada…) se relanza y la medición acaba en error, y la siguiente lo reintenta.
 */
let companiesColumn = false
function ensureCompaniesColumn() {
  if (companiesColumn) return
  try {
    run('ALTER TABLE answers ADD COLUMN companies TEXT')
  } catch (err) {
    if (!/duplicate column/i.test((err as Error).message ?? '')) throw err
  }
  companiesColumn = true
}

type SharedAnswer = AskResult & { sourceId: number; companies: ExtractedCompany[] | null }

/**
 * Respuesta ya obtenida esta semana por otro espacio para la misma pregunta,
 * plataforma, país e idioma. Las IA no saben quién pregunta: la respuesta es la
 * misma muestra que habría salido, sin volver a pagar la búsqueda. Tampoco se
 * repite la lectura de la IA, que solo ve la pregunta y la respuesta: se
 * reutiliza la de la original y en cada espacio solo se cruzan sus marcas (en
 * código). Así la misma respuesta da las mismas menciones en todos los espacios.
 * `since` es el primer día que vale (la semana, o después de la primera medición
 * en la segunda de una prueba gratis, para que no repita la misma muestra).
 */
function sharedAnswer(key: string, engine: string, wsId: number, day: string, since: string): SharedAnswer | null {
  if (process.env.PLACTON_SHARE_ANSWERS === '0') return null
  const a = one<{ id: number; reusedFrom: number | null; text: string; model: string; empty: number; searchQueries: string; companies: string | null }>(
    // Solo respuestas originales (pagadas esa semana): reutilizar una copia la iría arrastrando semana tras semana.
    "SELECT id, reusedFrom, text, model, empty, searchQueries, companies FROM answers WHERE promptKey = ? AND engine = ? AND error IS NULL AND reusedFrom IS NULL AND (empty = 0 OR engine = 'google') AND day BETWEEN ? AND ? AND workspaceId <> ? ORDER BY day DESC, id DESC LIMIT 1",
    [key, engine, since, day, wsId],
  )
  if (!a) return null
  const citations = all<{ url: string; title: string }>('SELECT url, title FROM citations WHERE answerId = ? ORDER BY id', [a.id])
  let searchQueries: string[] = []
  try {
    searchQueries = JSON.parse(a.searchQueries)
  } catch {}
  // Las originales de antes de guardar la lectura no la tienen: entonces se lee esa vez.
  let companies: ExtractedCompany[] | null = null
  try {
    const parsed: unknown = a.companies ? JSON.parse(a.companies) : null
    if (Array.isArray(parsed)) companies = parsed as ExtractedCompany[]
  } catch {}
  return { text: a.text, citations, searchQueries, model: a.model, costUsd: 0, empty: Boolean(a.empty), sourceId: a.reusedFrom ?? a.id, companies }
}

async function execute(ws: Workspace, runId: number, day: string, cells: Cell[], trigger: Run['trigger'], shareSince: string) {
  const brands = repo.trackedBrands(ws)
  let done = 0
  let costUsd = 0
  const ctx = { country: ws.country, language: ws.language }
  const beat = () => run('UPDATE runs SET heartbeatAt = ? WHERE id = ?', [nowIso(), runId])
  const pulse = setInterval(beat, 60_000)
  try {
    ensureCompaniesColumn()

    // 1) Lo que otro espacio ya preguntó esta semana no se vuelve a pagar.
    const keyOf = (c: Cell) => promptKey(c.prompt.text, ws.country, ws.language)
    const shared = new Map<Cell, SharedAnswer>()
    for (const c of cells) {
      const hit = sharedAnswer(keyOf(c), c.platform.id, ws.id, day, shareSince)
      if (hit) shared.set(c, hit)
    }

    // 2) En la medición semanal, Google va por la cola normal de DataForSEO (más
    //    barata): se encargan todas las búsquedas ahora y se recogen al final.
    const queued = new Map<Cell, { id: string; cost: number }>()
    const googleCells = cells.filter((c) => c.platform.id === 'google' && c.platform.model === 'ai-overview' && !shared.has(c))
    if (trigger === 'diario' && googleCells.length && process.env.PLACTON_GOOGLE_QUEUE !== '0') {
      try {
        const tasks = await postGoogleTasks(
          googleCells.map((c) => ({ tag: String(c.prompt.id), prompt: c.prompt.text })),
          ctx,
        )
        for (const c of googleCells) {
          const t = tasks.get(String(c.prompt.id))
          if (t) queued.set(c, t)
        }
      } catch (err) {
        console.error('[placton] cola de Google, se usa la búsqueda al momento', err)
      }
    }

    // Las búsquedas encargadas a la cola, al final: así tienen tiempo de estar hechas.
    const queue = [...cells.filter((c) => !queued.has(c)), ...cells.filter((c) => queued.has(c))]

    const worker = async () => {
      while (queue.length) {
        const cell = queue.shift()
        if (!cell) break
        const { prompt, platform } = cell
        const started = Date.now()
        // Todo lo pagado en esta celda, se guarde o no la respuesta (vacía, con error o
        // de un prompt borrado a mitad): así el coste apuntado es el que se paga.
        let spent = 0
        // Lo que ya costaron los intentos fallidos de esta celda hoy: su fila se sustituye
        // y el coste pasa a la nueva, para que la suma de answers.costUsd no lo pierda.
        const priorCost = (onlyErrors: boolean) =>
          one<{ c: number }>(
            `SELECT COALESCE(SUM(costUsd), 0) AS c FROM answers WHERE workspaceId = ? AND day = ? AND promptId = ? AND engine = ?${onlyErrors ? ' AND error IS NOT NULL' : ''}`,
            [ws.id, day, prompt.id, platform.id],
          )?.c ?? 0
        try {
          const reuse = shared.get(cell)
          const task = queued.get(cell)
          let res: AskResult
          if (reuse) res = reuse
          else if (task) {
            // La búsqueda en cola se pagó al encargarla: cuenta aunque haya que repetirla al momento.
            spent += task.cost
            res = await getGoogleTask(task, prompt.text, beat)
              .then((r) => ({ ...r, costUsd: 0 }))
              .catch((err) => {
                console.error('[placton] búsqueda en cola fallida, se repite al momento', err)
                return ask(platform, prompt.text, ctx)
              })
          } else res = await ask(platform, prompt.text, ctx)
          spent += res.costUsd
          // Solo Google puede no dar respuesta (sin AI Overview); en las demás, vacío es un fallo y se reintenta.
          if (res.empty && platform.id !== 'google') throw new Error(`${platform.name} devolvió una respuesta vacía`)
          const analysis = res.empty
            ? { mentions: [], citations: [], costUsd: 0, companies: null }
            : await extract(prompt.text, res.text, res.citations, brands, { companies: reuse?.companies })
          spent += analysis.costUsd
          // El prompt se pudo borrar mientras se medía: entonces no hay nada que guardar (lo pagado
          // cuenta igual en la medición, en el finally).
          if (!one('SELECT id FROM prompts WHERE id = ? AND deletedAt IS NULL', [prompt.id])) continue
          const cellCost = spent + priorCost(false)

          // Si un reintento del mismo día deja una celda con error previo, se sustituye.
          run('DELETE FROM answers WHERE workspaceId = ? AND day = ? AND promptId = ? AND engine = ?', [ws.id, day, prompt.id, platform.id])
          const { id: answerId } = run(
            `INSERT INTO answers (runId, workspaceId, promptId, engine, model, day, text, empty, searchQueries, latencyMs, costUsd, promptKey, reusedFrom, companies, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              runId,
              ws.id,
              prompt.id,
              platform.id,
              res.model,
              day,
              res.text,
              res.empty ? 1 : 0,
              JSON.stringify(res.searchQueries),
              Date.now() - started,
              cellCost,
              keyOf(cell),
              reuse ? reuse.sourceId : null,
              // Solo las originales guardan la lectura: las copias nunca se reutilizan.
              !reuse && analysis.companies ? JSON.stringify(analysis.companies) : null,
              nowIso(),
            ],
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
          try {
            // Una respuesta vacía o una búsqueda en cola repetida también se pagan: el coste va en la fila del error.
            const failedCost = spent + priorCost(true)
            run('DELETE FROM answers WHERE workspaceId = ? AND day = ? AND promptId = ? AND engine = ? AND error IS NOT NULL', [ws.id, day, prompt.id, platform.id])
            run(
              `INSERT INTO answers (runId, workspaceId, promptId, engine, model, day, latencyMs, costUsd, error, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [runId, ws.id, prompt.id, platform.id, platform.model, day, Date.now() - started, failedCost, message, nowIso()],
            )
          } catch {
            // El prompt ya no existe (borrado a mitad): nada que apuntar, y la medición sigue con el resto.
          }
        } finally {
          costUsd += spent
          done++
          run('UPDATE runs SET done = ?, costUsd = ?, heartbeatAt = ? WHERE id = ?', [done, costUsd, nowIso(), runId])
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cells.length) }, worker))
    // Si falla más de la mitad (sin saldo en un proveedor, caída…), la medición no
    // cuenta como hecha: el programador vuelve a intentar las celdas que faltan.
    const failed = one<{ n: number }>('SELECT COUNT(*) AS n FROM answers WHERE runId = ? AND error IS NOT NULL', [runId])?.n ?? 0
    if (failed > cells.length / 2) {
      const why = one<{ error: string }>('SELECT error FROM answers WHERE runId = ? AND error IS NOT NULL ORDER BY id DESC LIMIT 1', [runId])?.error ?? ''
      run("UPDATE runs SET status = 'error', error = ?, finishedAt = ?, costUsd = ? WHERE id = ?", [`Fallaron ${failed} de ${cells.length}: ${why}`.slice(0, 500), nowIso(), costUsd, runId])
      // Solo se avisa por correo si fallan varias: un «Medir ahora» con 1 respuesta pendiente
      // que da un error puntual del proveedor no es una avería (se reintenta sola).
      if (failed >= 3) reportError(new Error(`Medición con ${failed} de ${cells.length} respuestas fallidas: ${why}`.slice(0, 300)), `medición ${ws.name}`)
      return
    }
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
    reportError(err, `medición ${ws.name}`)
  } finally {
    clearInterval(pulse)
  }
}

/** ¿Le toca hoy la medición automática a este espacio? */
export function dueToday(ws: Workspace, day: string): boolean {
  // Prueba gratis: sin semanal; la segunda medición solo para quien vuelve (ver trialStep).
  if (repo.isFreeTrial(ws)) {
    const m = trialMeasurements(ws.id)
    // El correo solo frena la primera medición: ni se mira una vez hecha.
    const emailPending = !m.first && repo.creatorEmailPending(ws)
    return trialStep({ day, m, lastVisitAt: ws.lastVisitAt, emailPending }).run
  }
  // De pago: una medición completa por ventana (semanal): se espera a que pasen los días.
  return !(ws.lastTrackedDay && ws.lastTrackedDay > addDays(day, -MEASURE_EVERY_DAYS))
}

/** Lo que llama el programador cada hora: mide los espacios que aún no tienen el día. */
export async function runDaily(): Promise<{ started: number[]; skipped: number }> {
  const day = today()
  const started: number[] = []
  let skipped = 0
  for (const ws of repo.allWorkspaces()) {
    if (!ws.onboarded || !repo.accessOf(ws).ok || !dueToday(ws, day)) {
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
