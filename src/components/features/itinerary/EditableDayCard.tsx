'use client'

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  GripVertical,
  Lock,
  LockOpen,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Replace,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import type { DayPlan, ItineraryItem, ItineraryPeriod } from '@/types/itinerary'
import { cn } from '@/utils/cn'
import { formatCurrency } from '@/utils/formatCurrency'

interface ItemPosition {
  dayNumber: number
  period: ItineraryPeriod
  index: number
}

interface EditableDayCardProps {
  day: DayPlan
  date?: string
  notices: string[]
  dayNumbers: number[]
  disabled: boolean
  onMove: (itemId: string, direction: 'up' | 'down') => void
  onMoveToDay: (itemId: string, dayNumber: number) => void
  onDropItem: (itemId: string, target: ItemPosition) => void
  onLock: (itemId: string, locked: boolean) => void
  onNotes: (itemId: string, notes: string) => void
  onReplace: (itemId: string) => void
  onRegenerate: (dayNumber: number) => void
}

const PERIODS: ItineraryPeriod[] = ['morning', 'afternoon', 'evening']

function dateLabel(value?: string): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function itemId(item: ItineraryItem): string {
  return item.itemId ?? item.candidateId
}

function EditorItem({
  item,
  position,
  dayNumbers,
  disabled,
  onMove,
  onMoveToDay,
  onDropItem,
  onLock,
  onNotes,
  onReplace,
}: {
  item: ItineraryItem
  position: ItemPosition
  dayNumbers: number[]
  disabled: boolean
  onMove: EditableDayCardProps['onMove']
  onMoveToDay: EditableDayCardProps['onMoveToDay']
  onDropItem: EditableDayCardProps['onDropItem']
  onLock: EditableDayCardProps['onLock']
  onNotes: EditableDayCardProps['onNotes']
  onReplace: EditableDayCardProps['onReplace']
}) {
  const id = itemId(item)
  const [notes, setNotes] = useState(item.editorNotes ?? '')
  const [showNotes, setShowNotes] = useState(Boolean(item.editorNotes))

  return (
    <li
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/roamly-itinerary-item', id)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const draggedId = event.dataTransfer.getData('text/roamly-itinerary-item')
        if (draggedId && draggedId !== id) onDropItem(draggedId, position)
      }}
      className={cn(
        'group relative border border-neutral-200 bg-white p-4 shadow-sm transition-ui sm:p-5',
        item.locked && 'border-atlas-100 bg-atlas-50/30'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 hidden h-8 w-6 cursor-grab items-center justify-center text-neutral-400 active:cursor-grabbing md:flex"
          title="Drag to reorder"
          aria-hidden="true"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-atlas-700">
                <span>{item.time}</span>
                <span className="text-neutral-300" aria-hidden="true">/</span>
                <span>{item.category ?? item.sourceEntityType?.toLowerCase() ?? 'place'}</span>
                {item.source === 'manual' && (
                  <span className="rounded-sm bg-sunrise-50 px-1.5 py-0.5 text-sunrise-600">Changed</span>
                )}
                {item.source === 'fallback' && (
                  <span className="rounded-sm bg-primary-50 px-1.5 py-0.5 text-primary-700">Fallback</span>
                )}
              </div>
              <h3 className="mt-1 break-words text-base font-semibold text-neutral-900">
                {item.title}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40"
                onClick={() => onLock(id, !item.locked)}
                disabled={disabled}
                aria-label={item.locked ? `Unlock ${item.title}` : `Lock ${item.title}`}
                title={item.locked ? 'Unlock item' : 'Lock item'}
              >
                {item.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40"
                onClick={() => onReplace(id)}
                disabled={disabled || item.locked}
                aria-label={`Replace ${item.title}`}
                title={item.locked ? 'Unlock before replacing' : 'Replace item'}
              >
                <Replace className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-40"
                onClick={() => setShowNotes((current) => !current)}
                aria-label={`Edit notes for ${item.title}`}
                title="Edit notes"
              >
                <MessageSquareText className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className="mt-2 text-sm leading-6 text-neutral-700">{item.description}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-700">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-atlas-600" aria-hidden="true" />
              {item.area ?? item.location}
            </span>
            <span>{item.durationMinutes} min</span>
            <span>{item.reason}</span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              onClick={() => onMove(id, 'up')}
              disabled={disabled}
              aria-label={`Move ${item.title} up`}
              title="Move up"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              onClick={() => onMove(id, 'down')}
              disabled={disabled}
              aria-label={`Move ${item.title} down`}
              title="Move down"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <label className="relative inline-flex items-center">
              <CalendarDays className="pointer-events-none absolute left-2.5 h-4 w-4 text-neutral-500" />
              <span className="sr-only">Move {item.title} to another day</span>
              <select
                value={position.dayNumber}
                disabled={disabled}
                onChange={(event) => onMoveToDay(id, Number(event.target.value))}
                className="h-9 rounded-md border border-neutral-200 bg-white pl-8 pr-7 text-sm font-medium text-neutral-700"
                aria-label={`Move ${item.title} to day`}
              >
                {dayNumbers.map((dayNumber) => (
                  <option key={dayNumber} value={dayNumber}>Day {dayNumber}</option>
                ))}
              </select>
            </label>
          </div>

          {showNotes && (
            <div className="mt-3">
              <label htmlFor={`notes-${id}`} className="text-sm font-medium text-neutral-900">
                Notes
              </label>
              <textarea
                id={`notes-${id}`}
                value={notes}
                disabled={disabled}
                maxLength={500}
                rows={2}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={() => {
                  if (notes !== (item.editorNotes ?? '')) onNotes(id, notes)
                }}
                placeholder="Add a reservation, meeting point, or reminder"
                className="mt-1 w-full resize-y rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400"
              />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function EditableDayCard({
  day,
  date,
  notices,
  dayNumbers,
  disabled,
  onMove,
  onMoveToDay,
  onDropItem,
  onLock,
  onNotes,
  onReplace,
  onRegenerate,
}: EditableDayCardProps) {
  const firstItem = day.morning[0] ?? day.afternoon[0] ?? day.evening[0]
  const userCurrency = firstItem?.currencyUser ?? 'USD'
  const lockedCount = PERIODS.flatMap((period) => day[period]).filter((item) => item.locked).length
  const formattedDate = dateLabel(date)

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50/70">
      <header className="flex flex-col gap-4 border-b border-neutral-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-atlas-700">
            <span>Day {day.dayNumber}</span>
            {formattedDate && <span className="font-medium text-neutral-500">{formattedDate}</span>}
          </div>
          <h2 className="mt-1 text-xl font-semibold text-neutral-900">{day.theme}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {formatCurrency(day.dailyTotalUserCurrency, userCurrency)} planned
            {lockedCount > 0 ? ` / ${lockedCount} locked` : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRegenerate(day.dayNumber)}
          disabled={disabled}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Regenerate day
        </Button>
      </header>

      {notices.length > 0 && (
        <div className="border-b border-sunrise-100 bg-sunrise-50 px-4 py-3 sm:px-5">
          {notices.map((notice) => (
            <p key={notice} className="text-sm font-medium text-neutral-800">{notice}</p>
          ))}
        </div>
      )}

      <div className="space-y-5 p-3 sm:p-4">
        {PERIODS.map((period) => {
          if (day[period].length === 0) return null
          return (
            <div key={period}>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase text-neutral-500">
                {period}
              </h3>
              <ul className="space-y-2">
                {day[period].map((entry, index) => (
                  <EditorItem
                    key={itemId(entry)}
                    item={entry}
                    position={{ dayNumber: day.dayNumber, period, index }}
                    dayNumbers={dayNumbers}
                    disabled={disabled}
                    onMove={onMove}
                    onMoveToDay={onMoveToDay}
                    onDropItem={onDropItem}
                    onLock={onLock}
                    onNotes={onNotes}
                    onReplace={onReplace}
                  />
                ))}
              </ul>
            </div>
          )
        })}
        {day.notes.length > 0 && (
          <div className="border-t border-neutral-200 px-1 pt-4 text-sm text-neutral-700">
            {day.notes.map((note) => <p key={note}>{note}</p>)}
          </div>
        )}
      </div>
    </section>
  )
}
