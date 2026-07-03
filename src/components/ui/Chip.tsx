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
        'min-h-11 rounded-card border px-4 py-2 text-left text-sm font-semibold transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        selected
          ? 'border-primary-600 bg-primary-600 text-white shadow-card'
          : 'border-neutral-200 bg-white text-neutral-700 shadow-card hover:border-primary-500 hover:text-neutral-900',
        className
      )}
      {...props}
    >
      {label}
    </button>
  )
}