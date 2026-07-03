export interface Profile {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  country: string | null
  region: string | null
  preferredCurrency: string | null
  travelInterests: string[]
  preferredLanguage: string | null
  profileComplete: boolean
  createdAt: Date
  updatedAt: Date
}

export type ProfileDetails = Profile

export interface ProfileSummary {
  profile: ProfileDetails
  email: string
  accountCreatedAt: Date
  tripCount: number
  completedTripCount: number
}

export interface ProfileUpdateInput {
  displayName: string
  country: string
  region: string
  preferredCurrency: string
  travelInterests?: string[]
  preferredLanguage?: string | null
}