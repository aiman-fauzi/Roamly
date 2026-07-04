'use client'

import * as React from 'react'

import { cn } from '@/utils/cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-semibold text-neutral-900">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          aria-invalid={error ? 'true' : undefined}
          className={cn(
            'w-full rounded-xl border border-neutral-200/90 bg-white/90 px-4 py-3 text-base text-neutral-900 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] placeholder:text-neutral-400',
            'transition-ui focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary-100',
            error && 'border-error-500 focus:ring-red-100',
            className
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-sm font-medium text-error-500">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-sm text-neutral-700">
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
