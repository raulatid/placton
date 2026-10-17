import 'server-only'
import { redirect } from 'next/navigation'
import { requireCtx, type Ctx } from './auth'
import { accessOf } from './repo'

/** Contexto para las páginas de datos: sin suscripción viva, a elegir plan. */
export async function pageCtx(): Promise<Ctx> {
  const ctx = await requireCtx()
  if (!accessOf(ctx.workspace).ok) redirect('/dashboard/plans')
  return ctx
}
