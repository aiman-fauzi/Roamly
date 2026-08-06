/**
 * Centralised API endpoint constants.
 * Always import from here — never hard-code API paths in hooks or components.
 */

export const API = {
  PROFILE: '/api/profile',
  AVATAR: '/api/avatar',
  TRIPS: '/api/trips',
  AUTH_CALLBACK: '/api/auth/callback',

  // Dynamic helpers
  trip: (tripId: string) => `/api/trips/${tripId}`,
  tripPreferences: (tripId: string) => `/api/trips/${tripId}/preferences`,
  tripGenerate: (tripId: string) => `/api/trips/${tripId}/generate`,
  tripTravelProfile: (tripId: string) => `/api/trips/${tripId}/travel-profile`,
  tripFlights: (tripId: string) => `/api/trips/${tripId}/flights`,
  tripHotels: (tripId: string) => `/api/trips/${tripId}/hotels`,
  tripBudget: (tripId: string) => `/api/trips/${tripId}/budget`,
  tripTravelSelection: (tripId: string) => `/api/trips/${tripId}/travel-selection`,
  tripPlan: (tripId: string) => `/api/trips/${tripId}/plan`,
} as const
