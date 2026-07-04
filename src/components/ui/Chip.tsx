'use client'

import * as React from 'react'

import { cn } from '@/utils/cn'

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  label: string
  selected?: boolean
}

export function Chip({ label, selected = false, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'transition-ui min-h-11 rounded-full border px-4 py-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.98]',
        selected
          ? 'border-primary-600 bg-neutral-900 text-white shadow-card'
          : 'border-neutral-200/90 bg-white/90 text-neutral-700 shadow-card hover:-translate-y-0.5 hover:border-primary-100 hover:bg-white hover:text-neutral-900 hover:shadow-card-hover',
        className
      )}
      {...props}
    >
      {label}
    </button>
  )
}
