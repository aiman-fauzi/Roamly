import { z } from 'zod'

const airportCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter IATA airport code.')
const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.')
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')

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
}).refine((value) => !value.returnDate || value.returnDate >= value.departureDate, {
  path: ['returnDate'],
  message: 'Return date must be on or after departure date.',
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
}).refine((value) => value.checkOutDate > value.checkInDate, {
  path: ['checkOutDate'],
  message: 'Check-out date must be after check-in date.',
})

export const tripTravelPlanningRequestSchema = z.object({
  originAirportCode: airportCodeSchema,
  destinationAirportCode: airportCodeSchema.optional(),
  departureDate: isoDateSchema,
  returnDate: isoDateSchema.optional(),
  checkInDate: isoDateSchema.optional(),
  checkOutDate: isoDateSchema.optional(),
  adults: z.coerce.number().int().min(1).max(18).optional(),
  children: z.coerce.number().int().min(0).max(12).optional(),
  infants: z.coerce.number().int().min(0).max(4).optional(),
  rooms: z.coerce.number().int().min(1).max(8).optional(),
  cabinClass: z.enum(['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']).default('ECONOMY'),
  currency: currencySchema.optional(),
  nonStopOnly: z.boolean().optional(),
  selectedFlightOfferId: z.string().min(1).optional(),
  selectedHotelOfferId: z.string().min(1).optional(),
  refreshOffers: z.boolean().optional(),
  persist: z.boolean().optional(),
  maxCandidates: z.coerce.number().int().min(1).max(24).optional(),
  simulationMode: travelOfferSimulationModeSchema,
}).refine((value) => !value.returnDate || value.returnDate >= value.departureDate, {
  path: ['returnDate'],
  message: 'Return date must be on or after departure date.',
}).refine((value) => {
  if (!value.checkInDate || !value.checkOutDate) return true
  return value.checkOutDate > value.checkInDate
}, {
  path: ['checkOutDate'],
  message: 'Check-out date must be after check-in date.',
})

export type FlightSearchRequestInput = z.infer<typeof flightSearchRequestSchema>
export type HotelSearchRequestInput = z.infer<typeof hotelSearchRequestSchema>
export type TripTravelPlanningRequestInput = z.infer<typeof tripTravelPlanningRequestSchema>
