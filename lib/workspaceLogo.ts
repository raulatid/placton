import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nowIso, run } from './db'
import { uploadedLogoTile } from './logo'
import type { Workspace } from './types'

// Logo propio de cada espacio: el cliente lo sube en Ajustes y sustituye al
// icono de su web en el panel (barra lateral, gráficas y listas). Se guarda ya
// recortado en un cuadrado de 256 px, junto a la base de datos.

const DIR = path.join(process.env.PLACTON_DATA_DIR || path.join(process.cwd(), 'data'), 'workspace-logos')
export const LOGO_MAX_BYTES = 3_000_000

const file = (id: number) => path.join(DIR, `${id}.png`)

/** Guarda el logo; false si el archivo no es una imagen que se pueda usar. */
export async function saveWorkspaceLogo(id: number, raw: Buffer): Promise<boolean> {
  if (!raw.length || raw.length > LOGO_MAX_BYTES) return false
  const tile = await uploadedLogoTile(raw).catch(() => null)
  if (!tile) return false
  await mkdir(DIR, { recursive: true })
  await writeFile(file(id), tile)
  run('UPDATE workspaces SET logoUpdatedAt = ? WHERE id = ?', [nowIso(), id])
  return true
}

export async function removeWorkspaceLogo(id: number) {
  await rm(file(id), { force: true })
  run('UPDATE workspaces SET logoUpdatedAt = NULL WHERE id = ?', [id])
}

export async function readWorkspaceLogo(id: number): Promise<Buffer | null> {
  try {
    return await readFile(file(id))
  } catch {
    return null
  }
}

/** Dirección del logo propio (con versión, para que el cambio se vea al momento) o null. */
export function workspaceLogoUrl(ws: Pick<Workspace, 'id' | 'logoUpdatedAt'>): string | null {
  return ws.logoUpdatedAt ? `/api/workspace-logo/${ws.id}?v=${Date.parse(ws.logoUpdatedAt) || 0}` : null
}
