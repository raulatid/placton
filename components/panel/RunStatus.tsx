'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { runNowAction } from '@/app/dashboard/actions'
import { IconRefresh } from '../icons'
import { useLang, useT } from '../LangProvider'
import { btnClass } from '../ui'

interface Status {
  active: { id: number; done: number; total: number } | null
  last: { status: string; finishedAt: string | null; day: string } | null
}

/** Barra de progreso de la medición en curso; refresca el panel al terminar. */
export function RunStatus({ initial, canRun }: { initial: Status; canRun: boolean }) {
  const [status, setStatus] = useState<Status>(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const wasActive = useRef(Boolean(initial.active))
  const t = useT()
  const lang = useLang()

  useEffect(() => {
    if (!status.active) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/run-status', { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as Status
        setStatus(next)
        if (!next.active && wasActive.current) {
          wasActive.current = false
          router.refresh()
        } else if (next.active) {
          wasActive.current = true
          // Ir pintando datos parciales cada pocas celdas.
          if (next.active.done % 4 === 0) router.refresh()
        }
      } catch {}
    }, 3000)
    return () => clearInterval(timer)
  }, [status.active, router])

  if (status.active) {
    const pct = Math.round((status.active.done / Math.max(1, status.active.total)) * 100)
    return (
      <div className="anim-rise mb-6 w-full rounded-2xl border border-brand-2/25 bg-white/90 px-4 py-3.5 shadow-[0_12px_32px_-22px_rgba(0,163,140,0.55)] backdrop-blur" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex shrink-0 items-center rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-2">
              {t('Tracking', 'Midiendo')}
            </span>
            <span className="truncate text-[13px] font-semibold text-ink-2 num">
              {t(
                `Asking the AI assistants… ${status.active.done} of ${status.active.total} answers`,
                `Preguntando a las IA… ${status.active.done} de ${status.active.total} respuestas`,
              )}
            </span>
          </div>
          <span className="text-[13px] font-bold text-brand num">{lang === 'es' ? `${pct} %` : `${pct}%`}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line-2">
          <div className="indeterminate h-full rounded-full bg-gradient-to-r from-brand-2 to-[#2a78d6] transition-[width] duration-700 ease-out" style={{ width: `${Math.max(6, pct)}%` }} />
        </div>
      </div>
    )
  }

  if (!canRun) return null
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="anim-fade text-[12px] font-medium text-mute">{msg}</span>}
      <button
        className={btnClass('secondary', 'sm')}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await runNowAction()
            if (res.error) setMsg(res.error)
            else {
              setMsg(null)
              // La página se vuelve a pintar con la medición en marcha y una sola barra de progreso.
              router.refresh()
            }
          })
        }
        title={t('Fills in any answers still missing today', 'Rellena las respuestas que falten hoy')}
      >
        <IconRefresh size={15} className={pending ? 'spin' : undefined} /> {t('Run now', 'Medir ahora')}
      </button>
    </div>
  )
}
