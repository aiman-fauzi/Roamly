'use client'

import * as React from 'react'

import { cn } from '@/utils/cn'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
}

interface ToastItem extends Required<ToastOptions> {
  id: number
}

interface ToastContextValue {
  showToast: (options: ToastOptions | string, variant?: ToastVariant) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const noop = () => undefined

const ToastContext = React.createContext<ToastContextValue>({
  showToast: noop,
  success: noop,
  error: noop,
  info: noop,
})

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-success-500 bg-white text-neutral-900',
  error: 'border-error-500 bg-white text-neutral-900',
  info: 'border-primary-500 bg-white text-neutral-900',
}

const variantLabels: Record<ToastVariant, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Update',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const nextId = React.useRef(1)

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = React.useCallback(
    (options: ToastOptions | string, variant: ToastVariant = 'info') => {
      const toast: ToastItem = {
        id: nextId.current,
        title: typeof options === 'string' ? options : options.title,
        description: typeof options === 'string' ? '' : options.description ?? '',
        variant: typeof options === 'string' ? variant : options.variant ?? variant,
      }
      nextId.current += 1
      setToasts((current) => [...current.slice(-2), toast])
      window.setTimeout(() => dismiss(toast.id), 4200)
    },
    [dismiss]
  )

  const value = React.useMemo<ToastContextValue>(
    () => ({
      showToast,
      success: (title, description) => showToast({ title, description, variant: 'success' }),
      error: (title, description) => showToast({ title, description, variant: 'error' }),
      info: (title, description) => showToast({ title, description, variant: 'info' }),
    }),
    [showToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-4 top-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-card border-l-4 p-4 shadow-elevated transition-ui',
              variantStyles[toast.variant]
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-neutral-700">
                  {variantLabels[toast.variant]}
                </p>
                <p className="mt-1 font-semibold text-neutral-900">{toast.title}</p>
                {toast.description && (
                  <p className="mt-1 text-sm text-neutral-700">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="rounded-md px-2 py-1 text-sm font-semibold text-neutral-700 transition-ui hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return React.useContext(ToastContext)
}
