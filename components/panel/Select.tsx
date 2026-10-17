'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { IconCheck, IconChevron } from '../icons'
import { cx } from '../ui'

export interface SelectOption {
  value: string
  label: string
  /** Icono a la izquierda (logo de marca o de plataforma). */
  icon?: React.ReactNode
}

/**
 * Desplegable propio (sustituye al <select> nativo). Botón con icono, etiqueta y
 * chevron; lista flotante con iconos, marca de la opción activa, teclado
 * (flechas, Intro, Escape) y cierre al pulsar fuera. Con `name` envía su valor
 * en formularios mediante un campo oculto.
 */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  name,
  label,
  size = 'md',
  disabled,
  className,
  menuClassName,
  align = 'left',
}: {
  options: SelectOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  name?: string
  label: string
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  menuClassName?: string
  align?: 'left' | 'right'
}) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? '')
  const current = value ?? inner
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const selected = options.find((o) => o.value === current) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Mantiene visible la opción resaltada desplazando solo la lista (nunca la página).
  useEffect(() => {
    if (!open) return
    const ul = list.current
    const el = ul?.children[hi] as HTMLElement | undefined
    if (!ul || !el) return
    if (el.offsetTop < ul.scrollTop) ul.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = el.offsetTop + el.offsetHeight - ul.clientHeight
  }, [open, hi])

  function openMenu() {
    if (disabled) return
    setHi(Math.max(0, options.findIndex((o) => o.value === current)))
    setOpen(true)
  }

  function choose(v: string) {
    setOpen(false)
    if (v === current) return
    if (value === undefined) setInner(v)
    onChange?.(v)
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openMenu()
      setHi((h) => (e.key === 'ArrowDown' ? Math.min(options.length - 1, h + 1) : Math.max(0, h - 1)))
      return
    }
    if (e.key === 'Home' && open) {
      e.preventDefault()
      setHi(0)
    }
    if (e.key === 'End' && open) {
      e.preventDefault()
      setHi(options.length - 1)
    }
    if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      const o = options[hi]
      if (o) choose(o.value)
    }
  }

  return (
    <div ref={root} className={cx('relative inline-block', open && 'z-30', className)} onKeyDown={onKey}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-xl border bg-white text-left font-semibold text-ink shadow-[0_1px_2px_rgba(4,25,28,0.05)] transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60',
          size === 'md' ? 'h-11 px-3.5 text-[14px]' : 'h-9 px-3 text-[13px]',
          open ? 'border-brand-2 shadow-[0_0_0_3px_rgba(0,163,140,0.12)]' : 'border-line hover:border-faint',
        )}
      >
        {selected?.icon && <span className="flex shrink-0 items-center">{selected.icon}</span>}
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <IconChevron size={15} className={cx('shrink-0 text-faint transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className={cx(
            'absolute top-full z-40 mt-1.5 max-h-72 min-w-full animate-[p-rise_0.16s_ease-out_both] overflow-auto rounded-xl border border-line bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(4,25,28,0.3)] motion-reduce:animate-none',
            align === 'right' ? 'right-0' : 'left-0',
            menuClassName,
          )}
        >
          {options.map((o, k) => {
            const active = o.value === current
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHi(k)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
                className={cx(
                  'flex cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13.5px] font-semibold transition-colors',
                  k === hi ? 'bg-line-2' : '',
                  active ? 'text-brand' : 'text-ink-2',
                )}
              >
                {o.icon && <span className="flex shrink-0 items-center">{o.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <IconCheck size={14} className={cx('shrink-0', active ? 'opacity-100' : 'opacity-0')} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
