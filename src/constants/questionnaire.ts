/**
 * Questionnaire step metadata and option lists.
 * Centralised here so step components never hard-code labels or values.
 */

export const QUESTIONNAIRE_STEPS = [
  { step: 1, key: 'destination', label: 'Where do you want to go?', required: true },
  { step: 2, key: 'budget', label: 'What is your budget?', required: true },
  { step: 3, key: 'durationDays', label: 'How long is your trip?', required: true },
  { step: 4, key: 'groupSize', label: 'How many people are travelling?', required: true },
  { step: 5, key: 'travelStyles', label: 'What is your travel style?', required: false },
  { step: 6, key: 'accommodationType', label: 'Where would you like to stay?', required: false },
  {
    step: 7,
    key: 'transportationPreference',
    label: 'How do you prefer to get around?',
    required: false,
  },
  { step: 8, key: 'foodPreferences', label: 'Any food preferences?', required: false },
  { step: 9, key: 'activityPreferences', label: 'What activities interest you?', required: false },
] as const

export const TOTAL_STEPS = QUESTIONNAIRE_STEPS.length // 9

export const BUDGET_MIN = 100
export const BUDGET_MAX = 50_000
export const BUDGET_STEP = 100

export const GROUP_SIZE_MIN = 1
export const GROUP_SIZE_MAX = 20

export const DURATION_MIN = 1
export const DURATION_MAX = 30

export const TRAVEL_STYLE_OPTIONS = [
  { value: 'adventure', label: 'Adventure' },
  { value: 'relaxation', label: 'Relaxation' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'family', label: 'Family' },
  { value: 'budget', label: 'Budget' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'backpacking', label: 'Backpacking' },
] as const

export const ACCOMMODATION_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'airbnb', label: 'Airbnb / Apartment' },
  { value: 'resort', label: 'Resort' },
  { value: 'camping', label: 'Camping' },
  { value: 'boutique', label: 'Boutique Hotel' },
] as const

export const TRANSPORTATION_OPTIONS = [
  { value: 'public', label: 'Public Transport' },
  { value: 'rental_car', label: 'Rental Car' },
  { value: 'taxi', label: 'Taxi / Rideshare' },
  { value: 'walking', label: 'Walking / Cycling' },
  { value: 'tours', label: 'Guided Tours' },
] as const

export const FOOD_OPTIONS = [
  { value: 'local', label: 'Local Cuisine' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'halal', label: 'Halal' },
  { value: 'seafood', label: 'Seafood' },
  { value: 'street_food', label: 'Street Food' },
  { value: 'fine_dining', label: 'Fine Dining' },
] as const

export const ACTIVITY_OPTIONS = [
  { value: 'sightseeing', label: 'Sightseeing' },
  { value: 'hiking', label: 'Hiking' },
  { value: 'beaches', label: 'Beaches' },
  { value: 'museums', label: 'Museums' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'sports', label: 'Sports' },
  { value: 'wellness', label: 'Wellness & Spa' },
  { value: 'photography', label: 'Photography' },
] as const