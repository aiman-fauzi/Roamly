'use client'

import * as React from 'react'

import { cn } from '@/utils/cn'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
  className?: string
}

function clampToStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value))
  const stepped = Math.round((clamped - min) / step) * step + min
  return Math.min(max, Math.max(min, stepped))
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue = (nextValue) => String(nextValue),
  className,
}: SliderProps) {
  const inputId = React.useId()
  const displayValue = clampToStep(value, min, max, step)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(clampToStep(Number(event.target.value), min, max, step))
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={inputId} className="text-sm font-medium text-neutral-900">
          {label}
        </label>
        <span className="rounded-full bg-atlas-50 px-3 py-1 text-sm font-semibold text-atlas-700">
          {formatValue(displayValue)}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={handleChange}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-atlas-500 transition-ui focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      />
    </div>
  )
}
