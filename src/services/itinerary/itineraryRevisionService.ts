import type { Prisma } from '@prisma/client'

import { prisma } from '@/db/client'
import {
  buildItineraryMapPoints,
  validateItineraryMapPoints,
} from '@/lib/maps/itineraryMapPoints'
import type { RequestTiming } from '@/lib/observability/requestTiming'
import {
  findActiveItineraryCandidateIds,
  ItineraryEditorError,
  ItineraryEditorService,
  normalizeEditableItinerary,
  parseEditableItinerary,
} from '@/services/itinerary/itineraryEditorService'
import {
  persistItineraryMutation,
  type PersistItineraryMutationInput,
  type PersistItineraryMutationResult,
} from '@/services/itinerary/itineraryRevisionPersistence'
import type {
  Itinerary,
  ItineraryEditorDocument,
  ItineraryPeriod,
  ItineraryRevisionAction,
  ItineraryRevisionPreview,
  ItineraryRevisionSummary,
} from '@/types/itinerary'

const PERIODS: ItineraryPeriod[] = ['morning', 'afternoon', 'evening']
const ACTION_TYPES = new Set<ItineraryRevisionAction>([
  'reorder_item',
  'move_item',
  'lock_item',
  'unlock_item',
  'update_notes',
  'replace_item',
  'regenerate_day',
  'apply_fallback_day',
  'generate_itinerary',
  'restore_revision',
])

interface RevisionRow {
  id: string
  tripId: string
  revisionNumber: number
  editVersion: number
  actionType: string
  actionSummary: string
  itineraryJson: Prisma.JsonValue
  createdAt: Date
}

interface RevisionTrip {
  id: string
  userId: string
  itineraryJson: unknown | null
  itineraryEditVersion: number
}

interface ItineraryRevisionDependencies {
  loadTrip?: (tripId: string, userId: string) => Promise<RevisionTrip | null>
  listRevisions?: (tripId: string) => Promise<RevisionRow[]>
  loadRevision?: (tripId: string, revisionId: string) => Promise<RevisionRow | null>
  findActiveCandidateIds?: (candidateIds: string[]) => Promise<Set<string>>
  persistMutation?: (
    input: PersistItineraryMutationInput
  ) => Promise<PersistItineraryMutationResult>
  loadEditorDocument?: (tripId: string, userId: string) => Promise<ItineraryEditorDocument>
}

function actionType(value: string): ItineraryRevisionAction {
  if (!ACTION_TYPES.has(value as ItineraryRevisionAction)) {
    throw new ItineraryEditorError(
      'ITINERARY_REVISION_INVALID',
      'This itinerary revision has invalid metadata.',
      422
    )
  }
  return value as ItineraryRevisionAction
}

function itineraryItems(itinerary: Itinerary) {
  return itinerary.days.flatMap((day) =>
    PERIODS.flatMap((period) =>
      day[period].map((item, index) => ({ day, item, orderIndex: index }))
    )
  )
}

function parseRevision(row: RevisionRow): Itinerary {
  return normalizeEditableItinerary(parseEditableItinerary(row.itineraryJson))
}

function candidateIds(itinerary: Itinerary): string[] {
  return itineraryItems(itinerary).map(({ item }) => item.candidateId)
}

function isActiveItinerary(itinerary: Itinerary, activeIds: Set<string>): boolean {
  return candidateIds(itinerary).every((candidateId) => activeIds.has(candidateId))
}

function revisionSummary(
  row: RevisionRow,
  isRestorable: boolean
): ItineraryRevisionSummary {
  return {
    id: row.id,
    revisionNumber: row.revisionNumber,
    actionType: actionType(row.actionType),
    actionSummary: row.actionSummary,
    editVersion: row.editVersion,
    createdAt: row.createdAt.toISOString(),
    isRestorable,
  }
}

export type UndoRevisionResult =
  | { state: 'restored'; document: ItineraryEditorDocument }
  | { state: 'empty'; document: ItineraryEditorDocument }

export class ItineraryRevisionService {
  private readonly dependencies: Required<ItineraryRevisionDependencies>

  constructor(dependencies: ItineraryRevisionDependencies = {}) {
    this.dependencies = {
      loadTrip:
        dependencies.loadTrip ??
        ((tripId, userId) =>
          prisma.trip.findFirst({
            where: { id: tripId, userId },
            select: {
              id: true,
              userId: true,
              itineraryJson: true,
              itineraryEditVersion: true,
            },
          })),
      listRevisions:
        dependencies.listRevisions ??
        ((tripId) =>
          prisma.itineraryRevision.findMany({
            where: { tripId },
            orderBy: { revisionNumber: 'desc' },
          })),
      loadRevision:
        dependencies.loadRevision ??
        ((tripId, revisionId) =>
          prisma.itineraryRevision.findFirst({
            where: { id: revisionId, tripId },
          })),
      findActiveCandidateIds:
        dependencies.findActiveCandidateIds ?? findActiveItineraryCandidateIds,
      persistMutation: dependencies.persistMutation ?? persistItineraryMutation,
      loadEditorDocument:
        dependencies.loadEditorDocument ??
        ((tripId, userId) => new ItineraryEditorService().get(tripId, userId)),
    }
  }

  async list(
    tripId: string,
    userId: string,
    timing?: RequestTiming
  ): Promise<ItineraryRevisionSummary[]> {
    await this.requireTrip(tripId, userId)
    const rows = await this.dependencies.listRevisions(tripId)
    const parsed = rows.map((row) => {
      try {
        return { row, itinerary: parseRevision(row) }
      } catch {
        return { row, itinerary: null }
      }
    })
    const allIds = [...new Set(parsed.flatMap(({ itinerary }) => itinerary ? candidateIds(itinerary) : []))]
    const active = await this.dependencies.findActiveCandidateIds(allIds)
    const summaries = parsed.map(({ row, itinerary }) =>
      revisionSummary(row, Boolean(itinerary && isActiveItinerary(itinerary, active)))
    )
    timing?.setResultCount(summaries.length)
    return summaries
  }

  async preview(
    tripId: string,
    userId: string,
    revisionId: string,
    timing?: RequestTiming
  ): Promise<ItineraryRevisionPreview> {
    await this.requireTrip(tripId, userId)
    const row = await this.requireRevision(tripId, revisionId)
    const itinerary = parseRevision(row)
    const active = await this.dependencies.findActiveCandidateIds(candidateIds(itinerary))
    const restorable = isActiveItinerary(itinerary, active)
    const points = validateItineraryMapPoints(buildItineraryMapPoints(itinerary)).validPoints
      .filter((point) => active.has(point.candidateId))
    const items = itineraryItems(itinerary)
    timing?.setResultCount(items.length)
    return {
      ...revisionSummary(row, restorable),
      dayCount: itinerary.days.length,
      itemCount: items.length,
      lockedItemCount: items.filter(({ item }) => item.locked).length,
      days: itinerary.days.map((day) => {
        let orderIndex = 0
        return {
          dayNumber: day.dayNumber,
          theme: day.theme,
          items: PERIODS.flatMap((period) =>
            day[period].map((item) => ({
              itemId: item.itemId ?? item.candidateId,
              title: item.title,
              category: item.category ?? item.sourceEntityType?.toLowerCase() ?? 'place',
              orderIndex: orderIndex++,
              locked: item.locked === true,
              notes: item.editorNotes || null,
            }))
          ),
        }
      }),
      mapPoints: points,
    }
  }

  async restore(
    tripId: string,
    userId: string,
    revisionId: string,
    expectedVersion: number,
    timing?: RequestTiming
  ): Promise<ItineraryEditorDocument> {
    const trip = await this.requireTrip(tripId, userId)
    this.assertVersion(trip, expectedVersion)
    const row = await this.requireRevision(tripId, revisionId)
    const restored = parseRevision(row)
    await this.assertActive(restored)
    const current = parseEditableItinerary(trip.itineraryJson)
    await this.persist({
      trip,
      previous: current,
      next: restored,
      summary: `Restored revision ${row.revisionNumber}: ${row.actionSummary}`,
      timing,
    })
    return this.dependencies.loadEditorDocument(tripId, userId)
  }

  async undo(
    tripId: string,
    userId: string,
    expectedVersion: number,
    timing?: RequestTiming
  ): Promise<UndoRevisionResult> {
    const trip = await this.requireTrip(tripId, userId)
    this.assertVersion(trip, expectedVersion)
    const latest = (await this.dependencies.listRevisions(tripId))[0]
    if (!latest) {
      timing?.setResultCount(0)
      return {
        state: 'empty',
        document: await this.dependencies.loadEditorDocument(tripId, userId),
      }
    }
    const restored = parseRevision(latest)
    await this.assertActive(restored)
    const current = parseEditableItinerary(trip.itineraryJson)
    await this.persist({
      trip,
      previous: current,
      next: restored,
      summary: `Undid ${latest.actionSummary}`,
      timing,
    })
    return {
      state: 'restored',
      document: await this.dependencies.loadEditorDocument(tripId, userId),
    }
  }

  private async persist(input: {
    trip: RevisionTrip
    previous: Itinerary
    next: Itinerary
    summary: string
    timing?: RequestTiming
  }) {
    const result = await this.dependencies.persistMutation({
      tripId: input.trip.id,
      userId: input.trip.userId,
      expectedVersion: input.trip.itineraryEditVersion,
      previousItinerary: input.previous,
      nextItinerary: input.next,
      actionType: 'restore_revision',
      actionSummary: input.summary,
      timing: input.timing,
    })
    if (!result.updated) {
      throw new ItineraryEditorError(
        'ITINERARY_VERSION_CONFLICT',
        'This itinerary changed in another session. Reload before saving again.',
        409
      )
    }
    input.timing?.setResultCount(result.revisionCount)
  }

  private async assertActive(itinerary: Itinerary) {
    const ids = candidateIds(itinerary)
    const active = await this.dependencies.findActiveCandidateIds(ids)
    if (ids.some((candidateId) => !active.has(candidateId))) {
      throw new ItineraryEditorError(
        'ITINERARY_REVISION_NOT_RESTORABLE',
        'This revision contains destination records that are no longer active.',
        422
      )
    }
  }

  private assertVersion(trip: RevisionTrip, expectedVersion: number) {
    if (trip.itineraryEditVersion !== expectedVersion) {
      throw new ItineraryEditorError(
        'ITINERARY_VERSION_CONFLICT',
        'This itinerary changed in another session. Reload before saving again.',
        409
      )
    }
  }

  private async requireTrip(tripId: string, userId: string) {
    const trip = await this.dependencies.loadTrip(tripId, userId)
    if (!trip) throw new ItineraryEditorError('TRIP_NOT_FOUND', 'Trip not found.', 404)
    if (!trip.itineraryJson) {
      throw new ItineraryEditorError('ITINERARY_NOT_FOUND', 'Generate an itinerary first.', 404)
    }
    return trip
  }

  private async requireRevision(tripId: string, revisionId: string) {
    const revision = await this.dependencies.loadRevision(tripId, revisionId)
    if (!revision) {
      throw new ItineraryEditorError(
        'ITINERARY_REVISION_NOT_FOUND',
        'Itinerary revision not found.',
        404
      )
    }
    return revision
  }
}
