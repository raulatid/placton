'use client'

import { useEffect, useState } from 'react'
import { IconArrow } from '../icons'
import { cx } from '../ui'

/**
 * Botón principal del paso. En móvil (pasos 2 y 3) va fijo abajo mientras se
 * ve el paso, y se oculta con un campo de texto enfocado para no chocar con el
 * teclado. En escritorio, al lado, la pista ⌘ ↵ o Ctrl ↵ (solo con ratón).
 */
export function ActionBar({
  label,
  onClick,
  disabled,
  busy,
  sticky,
  error,
  shortcut = true,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  sticky?: boolean
  error?: string | null
  shortcut?: boolean
}) {
  // Se pinta tras montar: el servidor no sabe si es un Mac.
  const [keys, setKeys] = useState<string | null>(null)
  useEffect(() => {
    if (!shortcut) return
    const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
    setKeys(mac ? '⌘ ↵' : 'Ctrl ↵')
  }, [shortcut])

  return (
    <div
      className={cx(
        'ob-bar col-span-2 mt-6 sm:col-span-1 sm:col-start-2',
        sticky &&
          'sticky bottom-0 z-10 -mx-4 border-t border-white bg-white/80 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none',
      )}
    >
      {error && <p className="mb-3 text-[14px] font-medium text-bad">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-keyshortcuts={shortcut ? 'Meta+Enter Control+Enter' : undefined}
          className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-deep px-6 text-[15px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(4,25,28,.6)] transition-colors hover:bg-deep-2 disabled:bg-[#7d8d90] disabled:shadow-none sm:w-auto"
        >
          {busy && <span aria-hidden="true" className="spin h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white" />}
          {label}
          {!busy && (
            <span className="transition-transform duration-200 group-hover:translate-x-0.5 group-disabled:translate-x-0">
              <IconArrow size={18} />
            </span>
          )}
        </button>
        {keys && (
          <span aria-hidden="true" className="hidden shrink-0 font-mono text-[12px] text-faint sm:[@media(pointer:fine)]:inline-flex">
            {keys}
          </span>
        )}
      </div>
    </div>
  )
}
