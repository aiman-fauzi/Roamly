'use client'

import * as React from 'react'

import { cn } from '@/utils/cn'

export interface StepperProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  className?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function Stepper({ label, value, min, max, onChange, className }: StepperProps) {
  const inputId = React.useId()
  const safeValue = clamp(value, min, max)

  function update(nextValue: number) {
    const clamped = clamp(nextValue, min, max)
    if (clamped !== safeValue) onChange(clamped)
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.value === '') return
    update(Number(event.target.value))
  }

  return (
    <div className={cn('space-y-3', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-neutral-900">
        {label}
      </label>
      <div className="grid grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded-card border border-neutral-200 bg-white shadow-card">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => update(safeValue - 1)}
          disabled={safeValue <= min}
          className="flex h-11 items-center justify-center text-xl font-semibold text-neutral-700 transition-ui hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          -
        </button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={safeValue}
          onChange={handleInputChange}
          className="h-11 border-x border-neutral-200 text-center text-base font-semibold text-neutral-900 focus:outline-none"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => update(safeValue + 1)}
          disabled={safeValue >= max}
          className="flex h-11 items-center justify-center text-xl font-semibold text-neutral-700 transition-ui hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  )
}