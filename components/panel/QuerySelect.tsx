'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Select } from './Select'

/** Desplegable que escribe su valor en la URL (filtros del panel). */
export function QuerySelect({
  name,
  value,
  options,
  label,
  className,
}: {
  name: string
  value: string
  options: { value: string; label: string; icon?: React.ReactNode }[]
  label: string
  className?: string
}) {
  const router = useRouter()
  const path = usePathname()
  const params = useSearchParams()
  // Muestra la elección al instante mientras llega la página filtrada.
  const [shown, setShown] = useState(value)
  const [, start] = useTransition()
  useEffect(() => setShown(value), [value])
  return (
    <Select
      label={label}
      value={shown}
      options={options}
      className={className ?? 'min-w-[200px]'}
      onChange={(v) => {
        setShown(v)
        const q = new URLSearchParams(params.toString())
        if (v) q.set(name, v)
        else q.delete(name)
        q.delete('p')
        start(() => router.push(`${path}?${q}`, { scroll: false }))
      }}
    />
  )
}
