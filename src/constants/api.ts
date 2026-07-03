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
} as const

