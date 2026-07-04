'use client'

import * as React from 'react'

import { cn } from '@/utils/cn'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  loadingLabel?: string
}

export function Button({
  variant = 'default',
  size = 'md',
  isLoading = false,
  loadingLabel = 'Loading...',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]'

  const variants = {
    default:
      'bg-neutral-900 text-white shadow-card hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-card-hover',
    outline:
      'border border-neutral-200/90 bg-white/90 text-neutral-900 shadow-card backdrop-blur hover:-translate-y-0.5 hover:border-primary-100 hover:bg-white hover:shadow-card-hover',
    ghost: 'text-neutral-700 hover:bg-neutral-100/80 hover:text-neutral-900',
    destructive: 'bg-error-500 text-white shadow-card hover:-translate-y-0.5 hover:opacity-90',
  }

  const sizes = {
    sm: 'min-h-9 px-3.5 py-1.5 text-sm',
    md: 'min-h-11 px-5 py-2.5 text-base',
    lg: 'min-h-12 px-7 py-3 text-lg',
  }

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading ? 'true' : undefined}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {loadingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
