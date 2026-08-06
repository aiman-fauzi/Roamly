import type { PreferenceSet, TripTravelProfile } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { buildTravelSelectionFingerprint } from '@/services/travel/persistence/travelSelectionFingerprint'
import {
  TripTravelSelectionService,
  type SaveTravelSelectionInput,
} from '@/services/travel/persistence/tripTravelSelectionService'
import type { TripTravelPlanningPreviewResult } from '@/services/travel/planning/tripTravelPlanningService'
import type { Trip } from '@/types/trip'

const trip: Trip = {
  id: 'trip-1',
  userId: 'user-1',
  title: 'Phu Quoc test',
  status: 'DRAFT',
  itineraryJson: null,
  createdAt: new Date('2026-08-06T00:00:00.000Z'),
  updatedAt: new Date('2026-08-06T00:00:00.000Z'),
}

const preferences: PreferenceSet = {
  id: 'preferences-1',
  tripId: trip.id,
  destination: 'Phu Quoc',
  budget: 5000,
  travelStyles: ['balanced'],
  foodPreferences: ['local food'],
  accommodationType: 'hotel',
  transportationPreference: 'taxi',
  activityPreferences: ['beach', 'nature'],
  groupSize: 2,
  durationDays: 4,
  createdAt: trip.createdAt,
  updatedAt: trip.updatedAt,
}

const selection: SaveTravelSelectionInput = {
  originAirportCode: 'KUL',
  destinationAirportCode: 'PQC',
  outboundDate: '2026-09-12',
  returnDate: '2026-09-15',
  travellers: 2,
  rooms: 1,
  cabinClass: 'ECONOMY',
  currency: 'MYR',
  selectedOutboundFlightId: 'outbound-1',
  selectedReturnFlightId: 'return-1',
  selectedHotelId: 'hotel-1',
  expectedVersion: 0,
}

const fingerprint = buildTravelSelectionFingerprint({
  destination: preferences.destination!,
  ...selection,
})

function profile(overrides: Partial<TripTravelProfile> = {}): TripTravelProfile {
  return {
    id: 'profile-1',
    tripId: trip.id,
    originCity: 'Kuala Lumpur',
    originCountry: 'Malaysia',
    originAirportCode: selection.originAirportCode,
    destinationAirportCode: selection.destinationAirportCode,
    departureDate: new Date(`${selection.outboundDate}T00:00:00.000Z`),
    returnDate: new Date(`${selection.returnDate}T00:00:00.000Z`),
    adults: selection.travellers,
    children: 0,
    infants: 0,
    rooms: selection.rooms,
    cabinClass: 'ECONOMY',
    nonStopOnly: false,
    currency: selection.currency,
    flightSelectionStrategy: 'BEST_VALUE',
    hotelSelectionStrategy: 'BEST_VALUE',
    selectedOutboundFlightId: selection.selectedOutboundFlightId,
    selectedReturnFlightId: selection.selectedReturnFlightId,
    selectedHotelId: selection.selectedHotelId,
    selectionFingerprint: fingerprint,
    selectionFingerprintVersion: 1,
    selectionProvider: 'mock',
    selectionReviewedAt: new Date('2026-08-06T01:00:00.000Z'),
    selectionVersion: 0,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    ...overrides,
  }
}

function planningPreview(): TripTravelPlanningPreviewResult {
  return {
    flightSearch: {
      status: 'SUCCESS',
      provider: 'mock',
      fetchedAt: '2026-08-06T00:00:00.000Z',
      expiresAt: '2026-08-06T00:15:00.000Z',
      offers: [
        {
          id: 'flight-pair-1',
          mockFlightPair: {
            outboundFlightId: selection.selectedOutboundFlightId,
            returnFlightId: selection.selectedReturnFlightId,
          },
        },
      ],
    },
    hotelSearch: {
      status: 'SUCCESS',
      provider: 'mock',
      fetchedAt: '2026-08-06T00:00:00.000Z',
      expiresAt: '2026-08-06T00:15:00.000Z',
      offers: [
        {
          id: 'hotel-offer-1',
          mockHotel: { hotelId: selection.selectedHotelId },
        },
      ],
    },
    itineraryTravelContext: {
      outboundFlight: { id: selection.selectedOutboundFlightId },
      returnFlight: { id: selection.selectedReturnFlightId },
      hotel: { id: selection.selectedHotelId },
      dataStatus: 'mock',
      planningPreview: { strictCandidateIds: true },
    },
    budgetSummary: { currency: 'MYR' },
    planningPreview: { strictCandidateIds: true },
  } as unknown as TripTravelPlanningPreviewResult
}

function setup(options: {
  currentProfile?: TripTravelProfile | null
  updateCount?: number
  preview?: TripTravelPlanningPreviewResult
  ownedTrip?: Trip | null
} = {}) {
  const findUnique = vi.fn().mockResolvedValue(
    options.currentProfile === undefined ? profile() : options.currentProfile
  )
  const updateMany = vi.fn().mockResolvedValue({ count: options.updateCount ?? 1 })
  const previewBudget = vi.fn().mockResolvedValue(options.preview ?? planningPreview())
  const service = new TripTravelSelectionService({
    db: {
      tripTravelProfile: { findUnique, updateMany },
    } as never,
    getTrip: vi.fn().mockResolvedValue(options.ownedTrip === undefined ? trip : options.ownedTrip),
    getPreferenceSet: vi.fn().mockResolvedValue(preferences),
    previewBudget,
    now: () => new Date('2026-08-06T02:00:00.000Z'),
  })
  return { service, findUnique, updateMany, previewBudget }
}

describe('TripTravelSelectionService', () => {
  it('saves only trusted identifiers and server-created fingerprint metadata', async () => {
    const { service, updateMany, previewBudget } = setup()

    const result = await service.save({ tripId: trip.id, userId: trip.userId, selection })

    expect(result.state).toBe('valid')
    expect(result.version).toBe(1)
    expect(previewBudget).toHaveBeenCalledTimes(2)
    expect(updateMany).toHaveBeenCalledWith({
      where: { tripId: trip.id, selectionVersion: 0 },
      data: expect.objectContaining({
        selectedOutboundFlightId: selection.selectedOutboundFlightId,
        selectedReturnFlightId: selection.selectedReturnFlightId,
        selectedHotelId: selection.selectedHotelId,
        selectionFingerprint: fingerprint,
        selectionFingerprintVersion: 1,
        selectionProvider: 'mock',
        selectionVersion: { increment: 1 },
      }),
    })
    const written = updateMany.mock.calls[0][0].data
    expect(JSON.stringify(written)).not.toContain('totalPrice')
    expect(JSON.stringify(written)).not.toContain('budgetSummary')
    expect(JSON.stringify(written)).not.toContain('mockFlightPair')
    expect(JSON.stringify(written)).not.toContain('mockHotel')
  })

  it('restores a valid selection from regenerated trusted offers', async () => {
    const { service, previewBudget } = setup({ currentProfile: profile({ selectionVersion: 3 }) })

    const result = await service.get({ tripId: trip.id, userId: trip.userId })

    expect(result).toMatchObject({
      state: 'valid',
      version: 3,
      selectedOutboundFlightId: selection.selectedOutboundFlightId,
      selectedReturnFlightId: selection.selectedReturnFlightId,
      selectedHotelId: selection.selectedHotelId,
    })
    expect(previewBudget).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['departure date', { departureDate: new Date('2026-09-13T00:00:00.000Z') }],
    ['traveller count', { adults: 3 }],
  ])('marks a changed %s stale without regenerating offers', async (_field, change) => {
    const { service, previewBudget } = setup({
      currentProfile: profile(change),
    })

    await expect(service.get({ tripId: trip.id, userId: trip.userId })).resolves.toMatchObject({
      state: 'stale',
      reasonCode: 'FINGERPRINT_MISMATCH',
    })
    expect(previewBudget).not.toHaveBeenCalled()
  })

  it('returns invalid state when regenerated offers do not contain saved IDs', async () => {
    const missing = planningPreview()
    missing.flightSearch.offers = []
    const { service } = setup({ preview: missing })

    const result = await service.get({ tripId: trip.id, userId: trip.userId })

    expect(result).toMatchObject({ state: 'invalid', reasonCode: 'OFFER_IDS_UNSUPPORTED' })
    expect(result).not.toHaveProperty('budgetSummary')
    expect(result).not.toHaveProperty('flightSearch')
  })

  it('rejects stale browser writes using the expected selection version', async () => {
    const { service } = setup({ updateCount: 0 })

    await expect(
      service.save({ tripId: trip.id, userId: trip.userId, selection })
    ).rejects.toMatchObject({
      code: 'TRAVEL_SELECTION_VERSION_CONFLICT',
      status: 409,
    })
  })

  it('enforces ownership before reading selection data', async () => {
    const { service, findUnique } = setup({ ownedTrip: null })

    await expect(service.get({ tripId: trip.id, userId: 'other-user' })).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
      status: 404,
    })
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('clears identifiers atomically and advances the version', async () => {
    const { service, updateMany } = setup({ currentProfile: profile({ selectionVersion: 4 }) })

    await expect(
      service.clear({ tripId: trip.id, userId: trip.userId, expectedVersion: 4 })
    ).resolves.toMatchObject({ state: 'none', version: 5 })
    expect(updateMany).toHaveBeenCalledWith({
      where: { tripId: trip.id, selectionVersion: 4 },
      data: expect.objectContaining({
        selectedOutboundFlightId: null,
        selectedReturnFlightId: null,
        selectedHotelId: null,
        selectionFingerprint: null,
        selectionVersion: { increment: 1 },
      }),
    })
  })
})
