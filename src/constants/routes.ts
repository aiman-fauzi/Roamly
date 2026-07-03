/**
 * Centralised route constants.
 * Always import from here - never hard-code route strings in components.
 */

export const ROUTES = {
  // Public
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  AUTH_CALLBACK: '/api/auth/callback',

  // Protected
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  PROFILE_SETUP: '/profile/setup',
  NEW_TRIP: '/trips/new',

  // Dynamic helpers
  tripQuestionnaire: (tripId: string) => `/trips/${tripId}/questionnaire`,
  tripItinerary: (tripId: string) => `/trips/${tripId}/itinerary`,
} as const