'use client'

import { cn } from '@/lib/utils'

export function PlateBadge({
  plate,
  className,
}: {
  plate?: string | null
  className?: string
}) {
  const value = plate?.trim().toUpperCase() || '—'
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap font-mono text-xs font-semibold tracking-wide',
        'rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-slate-800',
        'min-w-[5.5rem] text-center',
        className
      )}
    >
      {value}
    </span>
  )
}
