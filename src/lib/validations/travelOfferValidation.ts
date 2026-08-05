import { z } from 'zod'

const airportCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter IATA airport code.')
const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.')
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(isValidDateOnly, {
  message: 'Use a valid calendar date.',
})

const DEFAULT_MAX_TRAVELERS = 18

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function readMaxTravelers(): number {
  const value = process.env.MAX_TRAVELERS_PER_TRIP
  if (!value) return DEFAULT_MAX_TRAVELERS
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_MAX_TRAVELERS
}

function allowRoomsGreaterThanTravelers(): boolean {
  return process.env.ALLOW_ROOMS_GREATER_THAN_TRAVELERS === 'true'
}

function validateTravelerRoomRules(
  value: {
    adults?: number
    children?: number
    infants?: number
    rooms?: number
    departureDate?: string
    returnDate?: string
  },
  ctx: z.RefinementCtx
) {
  const adults = value.adults
  const children = value.children ?? 0
  const infants = value.infants ?? 0
  const rooms = value.rooms

  if (adults != null && infants > adults) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['infants'],
      message: 'Infants cannot exceed adults.',
    })
  }

  if (adults != null) {
    const totalTravelers = adults + children + infants
    if (totalTravelers > readMaxTravelers()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adults'],
        message: `Total travelers cannot exceed ${readMaxTravelers()}.`,
      })
    }
    if (rooms != null && rooms > totalTravelers && !allowRoomsGreaterThanTravelers()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rooms'],
        message: 'Room count cannot be greater than total travelers.',
      })
    }
  }

  if (value.departureDate && value.returnDate && value.returnDate <= value.departureDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['returnDate'],
      message: 'Return date must be after departure date.',
    })
  }
}

export const travelOfferSimulationModeSchema = z.enum([
  'NORMAL',
  'EMPTY',
  'RATE_LIMITED',
  'TEMPORARY_FAILURE',
]).optional()

export const flightSearchRequestSchema = z.object({
  originAirportCode: airportCodeSchema,
  destinationAirportCode: airportCodeSchema,
  departureDate: isoDateSchema,
  returnDate: isoDateSchema.optional(),
  adults: z.coerce.number().int().min(1).max(9),
  children: z.coerce.number().int().min(0).max(8).optional(),
  infants: z.coerce.number().int().min(0).max(4).optional(),
  cabinClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']).default('ECONOMY'),
  currency: currencySchema,
  nonStopOnly: z.boolean().optional(),
  simulationMode: travelOfferSimulationModeSchema,
  refresh: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.returnDate && value.returnDate < value.departureDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['returnDate'],
      message: 'Return date must be on or after departure date.',
    })
  }
  validateTravelerRoomRules(value, ctx)
})

export const hotelSearchRequestSchema = z.object({
  cityId: z.string().uuid(),
  checkInDate: isoDateSchema,
  checkOutDate: isoDateSchema,
  adults: z.coerce.number().int().min(1).max(18),
  children: z.coerce.number().int().min(0).max(12).optional(),
  rooms: z.coerce.number().int().min(1).max(8),
  currency: currencySchema,
  itineraryCenter: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
  simulationMode: travelOfferSimulationModeSchema,
  refresh: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.checkOutDate <= value.checkInDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkOutDate'],
      message: 'Check-out date must be after check-in date.',
    })
  }
  validateTravelerRoomRules(value, ctx)
})

const cabinClassSchema = z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'])

const tripTravelProfileFieldsSchema = z.object({
  originCity: z.string().trim().min(1).max(160).optional(),
  originCountry: z.string().trim().min(1).max(120).optional(),
  originAirportCode: airportCodeSchema.optional(),
  destinationAirportCode: airportCodeSchema.optional(),
  departureDate: isoDateSchema.optional(),
  returnDate: isoDateSchema.optional(),
  checkInDate: isoDateSchema.optional(),
  checkOutDate: isoDateSchema.optional(),
  adults: z.coerce.number().int().min(1).max(18).optional(),
  children: z.coerce.number().int().min(0).max(12).optional(),
  infants: z.coerce.number().int().min(0).max(4).optional(),
  rooms: z.coerce.number().int().min(1).max(8).optional(),
  cabinClass: cabinClassSchema.optional(),
  currency: currencySchema.optional(),
  nonStopOnly: z.boolean().optional(),
  flightSelectionStrategy: z.enum(['CHEAPEST', 'SHORTEST', 'FEWEST_STOPS', 'BEST_VALUE']).optional(),
  hotelSelectionStrategy: z.enum(['CHEAPEST', 'REFUNDABLE', 'NEAREST_TO_ITINERARY', 'BEST_VALUE']).optional(),
})

export const tripTravelProfileUpdateSchema = tripTravelProfileFieldsSchema.partial().superRefine((value, ctx) => {
  validateTravelerRoomRules(value, ctx)
  if (value.checkInDate && value.checkOutDate && value.checkOutDate <= value.checkInDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkOutDate'],
      message: 'Check-out date must be after check-in date.',
    })
  }
})

export const tripTravelPlanningRequestSchema = tripTravelProfileFieldsSchema.extend({
  originAirportCode: airportCodeSchema,
  departureDate: isoDateSchema,
  cabinClass: cabinClassSchema.default('ECONOMY'),
  selectedFlightOfferId: z.string().min(1).optional(),
  selectedHotelOfferId: z.string().min(1).optional(),
  refreshOffers: z.boolean().optional(),
  persist: z.boolean().optional(),
  maxCandidates: z.coerce.number().int().min(1).max(24).optional(),
  simulationMode: travelOfferSimulationModeSchema,
}).superRefine((value, ctx) => {
  if (value.returnDate && value.returnDate < value.departureDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['returnDate'],
      message: 'Return date must be on or after departure date.',
    })
  }
  if (value.checkInDate && value.checkOutDate && value.checkOutDate <= value.checkInDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkOutDate'],
      message: 'Check-out date must be after check-in date.',
    })
  }
  validateTravelerRoomRules(value, ctx)
})

export const persistedTripTravelPlanningRequestSchema = tripTravelProfileFieldsSchema.partial().extend({
  selectedFlightOfferId: z.string().min(1).optional(),
  selectedHotelOfferId: z.string().min(1).optional(),
  refreshOffers: z.boolean().optional(),
  persist: z.boolean().optional(),
  maxCandidates: z.coerce.number().int().min(1).max(24).optional(),
  simulationMode: travelOfferSimulationModeSchema,
}).superRefine((value, ctx) => {
  validateTravelerRoomRules(value, ctx)
  if (value.checkInDate && value.checkOutDate && value.checkOutDate <= value.checkInDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checkOutDate'],
      message: 'Check-out date must be after check-in date.',
    })
  }
})

export const offerSelectionRequestSchema = z.object({
  offerId: z.string().min(1),
  simulationMode: travelOfferSimulationModeSchema,
  refreshOffers: z.boolean().optional(),
})

export type FlightSearchRequestInput = z.infer<typeof flightSearchRequestSchema>
export type HotelSearchRequestInput = z.infer<typeof hotelSearchRequestSchema>
export type PersistedTripTravelPlanningRequestInput = z.infer<typeof persistedTripTravelPlanningRequestSchema>
export type TripTravelProfileUpdateInput = z.infer<typeof tripTravelProfileUpdateSchema>
export type TripTravelPlanningRequestInput = z.infer<typeof tripTravelPlanningRequestSchema>
export type OfferSelectionRequestInput = z.infer<typeof offerSelectionRequestSchema>
