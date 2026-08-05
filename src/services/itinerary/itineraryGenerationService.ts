import { generateItinerary } from '@/ai/aiService'
import { GeminiProviderError } from '@/ai/providers/GeminiProvider'
import type { GenerateItineraryRequest, GenerateItineraryResponse } from '@/ai/types'
import { prisma } from '@/db/client'
import {
  DestinationRetrievalService,
  resolveDestinationCity,
  type DestinationCityResolution,
} from '@/services/destinations/destinationRetrievalService'
import { buildGeminiDestinationContext } from '@/services/destinations/geminiContext'
import {
  attachCandidateMetadataToItinerary,
  ItineraryCandidateValidationError,
  validateItineraryCandidateContract,
} from '@/services/destinations/itineraryValidation'
import type {
  DestinationEntityType,
  DestinationRetrievalResult,
  GeminiDestinationContext,
} from '@/services/destinations/types'
import {
  inferDestinationCurrency,
  resolveExchangeRate,
  type ExchangeRateResult,
} from '@/services/exchangeRateService'
import { getPreferenceSet } from '@/services/preferenceService'
import { getProfileSummary } from '@/services/profileService'
import { getTripById, TripStatus, updateTripStatus } from '@/services/tripService'
import type { PreferenceSet, Trip } from '@/types/trip'

export type ItineraryGenerationMode = 'dry-run' | 'persist'

type ItineraryGenerationErrorCategory =
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_TEMPORARY_FAILURE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_AUTHENTICATION_FAILED'
  | 'AI_UNKNOWN_FAILURE'
  | 'AI_CONTRACT_VIOLATION'
  | 'INSUFFICIENT_CANDIDATES'

export interface ItineraryGenerationOptions {
  tripId: string
  userId?: string
  maxCandidates?: number
  persist?: boolean
}

export interface ItineraryGenerationSummary {
  tripId: string
  mode: ItineraryGenerationMode
  destination: string
  cityId: string
  cityName: string
  eligibleCandidates: number
  candidatesSent: number
  candidatesOmitted: number
  contextRawSerializedSize: number
  contextSerializedSize: number
  contextMaxSerializedSize: number
  generationLatencyMs: number
  candidateIds: Array<{
    id: string
    type: string
    name: string
    rankScore: number
  }>
  candidateTypeCounts: Record<DestinationEntityType, number>
  knownOpeningHoursCount: number
  knownPriceCount: number
  staleFactCount: number
  geminiItemsReturned: number
  validItems: number
  rejectedItems: number
  unknownCandidateIds: string[]
  duplicateCandidateIds: string[]
  validationStatus: 'PASSED' | 'FAILED'
  validationIssues: string[]
  persisted: boolean
  persistenceResult?: 'DRY_RUN' | 'REPLACED_TRIP_ITINERARY'
}

export interface ItineraryGenerationResult {
  trip: Trip
  itinerary: GenerateItineraryResponse
  request: GenerateItineraryRequest
  destinationCity: DestinationCityResolution
  destinationRetrieval: DestinationRetrievalResult
  destinationContext: GeminiDestinationContext
  summary: ItineraryGenerationSummary
}

interface LoadedTrip {
  id: string
  userId: string
  title: string
  status: TripStatus
  itineraryJson: unknown | null
  createdAt: Date
  updatedAt: Date
}

const ACTIVE_GENERATION_TRIPS = new Set<string>()
const DEFAULT_ITINERARY_MAX_CANDIDATES = 6
const DEFAULT_ITINERARY_CONTEXT_BUDGET = 6_000

function acquireGenerationLock(tripId: string): boolean {
  if (ACTIVE_GENERATION_TRIPS.has(tripId)) return false
  ACTIVE_GENERATION_TRIPS.add(tripId)
  return true
}

function releaseGenerationLock(tripId: string) {
  ACTIVE_GENERATION_TRIPS.delete(tripId)
}

interface ProfileForGeneration {
  profileComplete: boolean
  preferredCurrency: string | null
  travelInterests: string[]
  preferredLanguage: string | null
}

interface ItineraryGenerationDependencies {
  getTrip?: (tripId: string, userId?: string) => Promise<LoadedTrip | null>
  getPreferenceSet?: (tripId: string) => Promise<PreferenceSet | null>
  getProfile?: (userId: string) => Promise<ProfileForGeneration>
  resolveCity?: (destination: string) => Promise<DestinationCityResolution | null>
  retrieveDestinations?: (query: {
    cityId: string
    travelStyles: string[]
    interests: string[]
    budgetLevel?: string
    limitPerType: number
  }) => Promise<DestinationRetrievalResult>
  resolveExchangeRate?: (input: {
    baseCurrency: string
    quoteCurrency: string
  }) => Promise<ExchangeRateResult>
  generateItinerary?: (request: GenerateItineraryRequest) => Promise<GenerateItineraryResponse>
  persistTrip?: (tripId: string, status: TripStatus, itineraryJson: object) => Promise<Trip>
}

export class ItineraryGenerationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ItineraryGenerationError'
  }
}

async function defaultGetTrip(tripId: string, userId?: string): Promise<LoadedTrip | null> {
  if (userId) return getTripById(tripId, userId)
  return prisma.trip.findUnique({ where: { id: tripId } })
}

async function defaultGetProfile(userId: string): Promise<ProfileForGeneration> {
  return (await getProfileSummary(userId)).profile
}

function requirePreferenceFields(preferences: PreferenceSet) {
  const { destination, budget, durationDays, groupSize } = preferences
  if (!destination || budget == null || durationDays == null || groupSize == null) {
    throw new ItineraryGenerationError(
      'INCOMPLETE_PREFERENCES',
      'Destination, budget, duration, and group size are required before generation.',
      400
    )
  }

  return { destination, budget, durationDays, groupSize }
}

function readBudgetLevel(travelStyles: string[]): string | undefined {
  if (travelStyles.includes('luxury')) return 'luxury'
  if (travelStyles.includes('budget')) return 'budget'
  return undefined
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function defaultMaxCandidates(): number {
  return readPositiveInteger(process.env.ITINERARY_MAX_CANDIDATES, DEFAULT_ITINERARY_MAX_CANDIDATES)
}

function defaultContextBudget(): number {
  return readPositiveInteger(process.env.ITINERARY_CONTEXT_BUDGET, DEFAULT_ITINERARY_CONTEXT_BUDGET)
}

function countItineraryItems(itinerary: GenerateItineraryResponse): number {
  return itinerary.days.reduce(
    (total, day) => total + day.morning.length + day.afternoon.length + day.evening.length,
    0
  )
}

function readCandidateIds(itinerary: GenerateItineraryResponse): string[] {
  return itinerary.days.flatMap((day) => [
    ...day.morning.map((item) => item.candidateId),
    ...day.afternoon.map((item) => item.candidateId),
    ...day.evening.map((item) => item.candidateId),
  ])
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

function candidateTypeCounts(context: GeminiDestinationContext): Record<DestinationEntityType, number> {
  return context.candidates.reduce<Record<DestinationEntityType, number>>(
    (counts, candidate) => {
      counts[candidate.type] += 1
      return counts
    },
    { ATTRACTION: 0, RESTAURANT: 0, HOTEL: 0, ACTIVITY: 0 }
  )
}

function validationSummary(
  itinerary: GenerateItineraryResponse,
  context: GeminiDestinationContext,
  validationIssues: string[],
  base: Omit<
    ItineraryGenerationSummary,
    | 'geminiItemsReturned'
    | 'validItems'
    | 'rejectedItems'
    | 'unknownCandidateIds'
    | 'duplicateCandidateIds'
    | 'validationStatus'
    | 'validationIssues'
    | 'persisted'
    | 'persistenceResult'
  >,
  persist: boolean
): ItineraryGenerationSummary {
  const candidateIdSet = new Set(context.candidates.map((candidate) => candidate.id))
  const returnedCandidateIds = readCandidateIds(itinerary)
  const unknownCandidateIds = [...new Set(returnedCandidateIds.filter((id) => !candidateIdSet.has(id)))]
  const duplicateCandidateIds = duplicateValues(returnedCandidateIds)
  const itemCount = countItineraryItems(itinerary)
  const validationFailed = validationIssues.length > 0

  return {
    ...base,
    geminiItemsReturned: itemCount,
    validItems: validationFailed ? 0 : itemCount,
    rejectedItems: validationFailed ? itemCount : 0,
    unknownCandidateIds,
    duplicateCandidateIds,
    validationStatus: validationFailed ? 'FAILED' : 'PASSED',
    validationIssues,
    persisted: false,
    persistenceResult: persist ? undefined : 'DRY_RUN',
  }
}

function generationFailureSummary(
  base: Omit<
    ItineraryGenerationSummary,
    | 'geminiItemsReturned'
    | 'validItems'
    | 'rejectedItems'
    | 'unknownCandidateIds'
    | 'duplicateCandidateIds'
    | 'validationStatus'
    | 'validationIssues'
    | 'persisted'
    | 'persistenceResult'
  >,
  issue: string,
  persist: boolean
): ItineraryGenerationSummary {
  return {
    ...base,
    geminiItemsReturned: 0,
    validItems: 0,
    rejectedItems: 0,
    unknownCandidateIds: [],
    duplicateCandidateIds: [],
    validationStatus: 'FAILED',
    validationIssues: [issue],
    persisted: false,
    persistenceResult: persist ? undefined : 'DRY_RUN',
  }
}

function aiErrorStatus(error: GeminiProviderError): number {
  if (error.code === 'AI_RATE_LIMITED') return 429
  if (error.code === 'AI_TIMEOUT' || error.code === 'AI_TEMPORARY_FAILURE') return 503
  if (error.code === 'AI_INVALID_RESPONSE') return 502
  return 502
}

function recoverableDetails(input: {
  category: ItineraryGenerationErrorCategory
  previousItineraryPreserved: boolean
  retryAfterMs?: number
  details?: unknown
}) {
  return {
    recoverable: true,
    category: input.category,
    previousItineraryPreserved: input.previousItineraryPreserved,
    retryAfterMs: input.retryAfterMs,
    details: input.details,
  }
}

export class ItineraryGenerationService {
  private readonly dependencies: Required<ItineraryGenerationDependencies>

  constructor(dependencies: ItineraryGenerationDependencies = {}) {
    this.dependencies = {
      getTrip: dependencies.getTrip ?? defaultGetTrip,
      getPreferenceSet: dependencies.getPreferenceSet ?? getPreferenceSet,
      getProfile: dependencies.getProfile ?? defaultGetProfile,
      resolveCity: dependencies.resolveCity ?? resolveDestinationCity,
      retrieveDestinations:
        dependencies.retrieveDestinations ??
        ((query) => new DestinationRetrievalService().retrieve(query)),
      resolveExchangeRate: dependencies.resolveExchangeRate ?? resolveExchangeRate,
      generateItinerary: dependencies.generateItinerary ?? generateItinerary,
      persistTrip: dependencies.persistTrip ?? updateTripStatus,
    }
  }

  async generate(options: ItineraryGenerationOptions): Promise<ItineraryGenerationResult> {
    if (!acquireGenerationLock(options.tripId)) {
      throw new ItineraryGenerationError(
        'GENERATION_IN_PROGRESS',
        'Itinerary generation is already running for this trip. Please retry shortly.',
        409,
        recoverableDetails({
          category: 'AI_TEMPORARY_FAILURE',
          previousItineraryPreserved: true,
        })
      )
    }

    try {
      const trip = await this.dependencies.getTrip(options.tripId, options.userId)
      if (!trip) {
        throw new ItineraryGenerationError('TRIP_NOT_FOUND', 'Trip not found.', 404)
      }

      const preferences = await this.dependencies.getPreferenceSet(options.tripId)
      if (!preferences) {
        throw new ItineraryGenerationError('PREFERENCES_NOT_FOUND', 'Preferences not found.', 400)
      }

      const { destination, budget, durationDays, groupSize } = requirePreferenceFields(preferences)
      const profile = await this.dependencies.getProfile(trip.userId)
      if (!profile.profileComplete || !profile.preferredCurrency) {
        throw new ItineraryGenerationError(
          'PROFILE_INCOMPLETE',
          'Please complete your profile before generating an itinerary.',
          400
        )
      }

      const destinationCity = await this.dependencies.resolveCity(destination)
      if (!destinationCity) {
        throw new ItineraryGenerationError(
          'DESTINATION_CITY_NOT_FOUND',
          'Destination city is not available in the destination database.',
          400
        )
      }

      const destinationCurrency =
        destinationCity.currencyCode ?? inferDestinationCurrency(destination, profile.preferredCurrency)
      const exchangeRate = await this.dependencies.resolveExchangeRate({
        baseCurrency: destinationCurrency,
        quoteCurrency: profile.preferredCurrency,
      })
      const destinationRetrieval = await this.dependencies.retrieveDestinations({
        cityId: destinationCity.id,
        travelStyles: preferences.travelStyles,
        interests: [
          ...preferences.activityPreferences,
          ...preferences.foodPreferences,
          ...profile.travelInterests,
        ],
        budgetLevel: readBudgetLevel(preferences.travelStyles),
        limitPerType: 8,
      })
      const destinationContext = buildGeminiDestinationContext(destinationRetrieval, {
        maxCandidates: options.maxCandidates ?? defaultMaxCandidates(),
        maxSerializedSize: defaultContextBudget(),
      })

      if (destinationContext.candidates.length === 0) {
        throw new ItineraryGenerationError(
          'INSUFFICIENT_DESTINATION_CANDIDATES',
          'Not enough eligible destination records are available for this city yet.',
          400,
          recoverableDetails({
            category: 'INSUFFICIENT_CANDIDATES',
            previousItineraryPreserved: Boolean(trip.itineraryJson),
          })
        )
      }

      const baseSummary = {
        tripId: trip.id,
        mode: options.persist ? 'persist' as const : 'dry-run' as const,
        destination,
        cityId: destinationCity.id,
        cityName: destinationCity.name,
        eligibleCandidates: destinationRetrieval.candidates.length,
        candidatesSent: destinationContext.candidates.length,
        candidatesOmitted: destinationContext.omittedCandidateCount,
        contextRawSerializedSize: JSON.stringify(destinationContext).length,
        contextSerializedSize: destinationContext.serializedSize,
        contextMaxSerializedSize: destinationContext.maxSerializedSize,
        generationLatencyMs: 0,
        candidateIds: destinationContext.candidates.map((candidate) => ({
          id: candidate.id,
          type: candidate.type,
          name: candidate.name,
          rankScore: candidate.rankScore,
        })),
        candidateTypeCounts: candidateTypeCounts(destinationContext),
        knownOpeningHoursCount: destinationContext.candidates.filter((candidate) => candidate.openingHoursKnown).length,
        knownPriceCount: destinationContext.candidates.filter((candidate) => candidate.ticketPriceStatus === 'VERIFIED').length,
        staleFactCount: destinationContext.candidates.reduce((total, candidate) => total + candidate.staleFactCount, 0),
      }

      const request: GenerateItineraryRequest = {
        destination,
        budget,
        durationDays,
        groupSize,
        travelStyles: preferences.travelStyles,
        accommodationType: preferences.accommodationType,
        transportationPreference: preferences.transportationPreference,
        foodPreferences: preferences.foodPreferences,
        activityPreferences: preferences.activityPreferences,
        userCurrency: profile.preferredCurrency,
        destinationCurrency,
        exchangeRate: exchangeRate.rate,
        exchangeRateSource: exchangeRate.source,
        exchangeRateFetchedAt: exchangeRate.fetchedAt.toISOString(),
        exchangeRateFromCache: exchangeRate.fromCache,
        travelInterests: profile.travelInterests,
        preferredLanguage: profile.preferredLanguage,
        destinationContext,
      }
      let itinerary: GenerateItineraryResponse
      try {
        const generationStartedAt = Date.now()
        itinerary = await this.dependencies.generateItinerary(request)
        baseSummary.generationLatencyMs = Date.now() - generationStartedAt
      } catch (error) {
        if (error instanceof GeminiProviderError) {
          throw new ItineraryGenerationError(
            error.code,
            error.message,
            aiErrorStatus(error),
            recoverableDetails({
              category: error.code,
              previousItineraryPreserved: Boolean(trip.itineraryJson),
              retryAfterMs: error.retryAfterMs,
              details: generationFailureSummary(
                baseSummary,
                `AI provider failed before itinerary validation: ${error.code}`,
                Boolean(options.persist)
              ),
            })
          )
        }
        throw error
      }

      try {
        validateItineraryCandidateContract(itinerary, destinationContext, { durationDays })
      } catch (error) {
        if (error instanceof ItineraryCandidateValidationError) {
          const summary = validationSummary(itinerary, destinationContext, error.issues, baseSummary, Boolean(options.persist))
          throw new ItineraryGenerationError(
            'AI_CONTRACT_VIOLATION',
            'Generated itinerary referenced unsupported destination records.',
            422,
            recoverableDetails({
              category: 'AI_CONTRACT_VIOLATION',
              previousItineraryPreserved: Boolean(trip.itineraryJson),
              details: summary,
            })
          )
        }
        throw error
      }

      const validatedItinerary = attachCandidateMetadataToItinerary(itinerary, destinationContext)
      const summary = validationSummary(
        validatedItinerary,
        destinationContext,
        [],
        baseSummary,
        Boolean(options.persist)
      )
      let resultTrip: Trip = trip

      if (options.persist) {
        resultTrip = await this.dependencies.persistTrip(trip.id, TripStatus.COMPLETE, validatedItinerary)
        summary.persisted = true
        summary.persistenceResult = 'REPLACED_TRIP_ITINERARY'
      }

      return {
        trip: resultTrip,
        itinerary: validatedItinerary,
        request,
        destinationCity,
        destinationRetrieval,
        destinationContext,
        summary,
      }
    } finally {
      releaseGenerationLock(options.tripId)
    }
  }
}
