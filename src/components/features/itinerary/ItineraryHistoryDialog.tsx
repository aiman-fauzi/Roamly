'use client'

import {
  ArrowLeftRight,
  Clock3,
  History,
  LoaderCircle,
  Lock,
  MessageSquareText,
  RefreshCw,
  Replace,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/Button'
import type {
  ItineraryEditorDocument,
  ItineraryRevisionAction,
  ItineraryRevisionPreview,
  ItineraryRevisionSummary,
} from '@/types/itinerary'
import { cn } from '@/utils/cn'

interface ItineraryHistoryDialogProps {
  current: ItineraryEditorDocument
  revisions: ItineraryRevisionSummary[]
  loading: boolean
  preview: ItineraryRevisionPreview | null
  previewLoading: boolean
  restoring: boolean
  onPreview: (revisionId: string) => void
  onRestore: (revisionId: string) => void
  onClose: () => void
}

const actionIcons: Record<ItineraryRevisionAction, typeof History> = {
  reorder_item: ArrowLeftRight,
  move_item: ArrowLeftRight,
  lock_item: Lock,
  unlock_item: Lock,
  update_notes: MessageSquareText,
  replace_item: Replace,
  regenerate_day: RefreshCw,
  apply_fallback_day: RefreshCw,
  generate_itinerary: Sparkles,
  restore_revision: RotateCcw,
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function currentCounts(document: ItineraryEditorDocument) {
  const items = document.itinerary.days.flatMap((day) => [
    ...day.morning,
    ...day.afternoon,
    ...day.evening,
  ])
  return {
    days: document.itinerary.days.length,
    items: items.length,
    locked: items.filter((item) => item.locked).length,
  }
}

export function ItineraryHistoryDialog({
  current,
  revisions,
  loading,
  preview,
  previewLoading,
  restoring,
  onPreview,
  onRestore,
  onClose,
}: ItineraryHistoryDialogProps) {
  const [confirmRevisionId, setConfirmRevisionId] = useState<string | null>(null)
  const counts = useMemo(() => currentCounts(current), [current])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/45 md:p-5" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Itinerary revision history"
        className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-elevated md:rounded-lg"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-4 sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-neutral-900">Revision history</h2>
            </div>
            <p className="mt-1 text-xs text-neutral-500">The newest 20 saved changes are retained.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100"
            aria-label="Close revision history"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
          <div className="max-h-[42vh] overflow-y-auto border-b border-neutral-200 md:max-h-none md:border-b-0 md:border-r">
            {loading && (
              <div className="flex items-center gap-2 p-5 text-sm text-neutral-600">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading history...
              </div>
            )}
            {!loading && revisions.length === 0 && (
              <div className="p-5">
                <p className="text-sm font-semibold text-neutral-800">No saved changes yet</p>
                <p className="mt-1 text-sm leading-6 text-neutral-600">Your first successful edit will appear here.</p>
              </div>
            )}
            <ol className="divide-y divide-neutral-200">
              {revisions.map((revision) => {
                const Icon = actionIcons[revision.actionType]
                const selected = preview?.id === revision.id
                return (
                  <li key={revision.id}>
                    <button
                      type="button"
                      onClick={() => onPreview(revision.id)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-neutral-50',
                        selected && 'bg-primary-50'
                      )}
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-5 text-neutral-900">{revision.actionSummary}</span>
                        <span className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                          <Clock3 className="h-3 w-3" aria-hidden="true" />
                          {formatTimestamp(revision.createdAt)}
                        </span>
                        {!revision.isRestorable && (
                          <span className="mt-1 block text-xs font-medium text-error-500">No longer restorable</span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {previewLoading && (
              <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-neutral-600">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Opening revision...
              </div>
            )}
            {!previewLoading && !preview && (
              <div className="flex min-h-52 flex-col items-center justify-center text-center">
                <History className="h-6 w-6 text-neutral-400" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-neutral-800">Select a revision to preview</p>
                <p className="mt-1 max-w-sm text-sm leading-6 text-neutral-600">You can inspect its days and stops before restoring anything.</p>
              </div>
            )}
            {!previewLoading && preview && (
              <div>
                <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-primary-700">Revision {preview.revisionNumber}</p>
                    <h3 className="mt-1 text-lg font-semibold text-neutral-900">{preview.actionSummary}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{formatTimestamp(preview.createdAt)}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!preview.isRestorable || restoring}
                    onClick={() => setConfirmRevisionId(preview.id)}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Restore
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-b border-neutral-200 py-4 text-center">
                  <div>
                    <p className="text-lg font-semibold text-neutral-900">{preview.dayCount}</p>
                    <p className="text-xs text-neutral-500">Days {preview.dayCount === counts.days ? '(same)' : `(now ${counts.days})`}</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-neutral-900">{preview.itemCount}</p>
                    <p className="text-xs text-neutral-500">Stops {preview.itemCount === counts.items ? '(same)' : `(now ${counts.items})`}</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-neutral-900">{preview.lockedItemCount}</p>
                    <p className="text-xs text-neutral-500">Locked {preview.lockedItemCount === counts.locked ? '(same)' : `(now ${counts.locked})`}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {preview.days.map((day) => (
                    <section key={day.dayNumber} className="border-l-2 border-primary-100 pl-4">
                      <p className="text-xs font-semibold uppercase text-primary-700">Day {day.dayNumber}</p>
                      <h4 className="mt-0.5 text-sm font-semibold text-neutral-900">{day.theme}</h4>
                      <ol className="mt-2 space-y-2">
                        {day.items.map((item, index) => (
                          <li key={item.itemId} className="flex items-start gap-2 text-sm text-neutral-700">
                            <span className="mt-0.5 text-xs font-semibold tabular-nums text-neutral-400">{index + 1}</span>
                            <span className="min-w-0">
                              <span className="font-medium text-neutral-900">{item.title}</span>
                              <span className="ml-2 text-xs text-neutral-500">{item.category}</span>
                              {item.locked && <span className="ml-2 text-xs font-semibold text-atlas-700">Locked</span>}
                              {item.notes && <span className="mt-0.5 block text-xs text-neutral-500">{item.notes}</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {confirmRevisionId && preview?.id === confirmRevisionId && (
          <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-4 sm:px-5">
            <p className="text-sm font-semibold text-neutral-900">Restore this revision?</p>
            <p className="mt-1 text-sm leading-6 text-neutral-700">
              Restoring this version will replace your current itinerary. Your current version will remain available in history.
            </p>
            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" disabled={restoring} onClick={() => setConfirmRevisionId(null)}>Cancel</Button>
              <Button type="button" disabled={restoring} onClick={() => onRestore(confirmRevisionId)}>
                {restoring ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                Restore revision
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
