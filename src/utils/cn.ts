import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility for conditionally joining Tailwind CSS class names.
 * Merges conflicting Tailwind classes correctly (e.g. `p-2` + `p-4` → `p-4`).
 *
 * Usage:
 *   cn('px-4 py-2', isActive && 'bg-primary-500', className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
