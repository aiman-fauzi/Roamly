import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profileCreate: vi.fn(),
  profileFindUnique: vi.fn(),
  profileUpdate: vi.fn(),
  tripCount: vi.fn(),
  userFindUnique: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  prisma: {
    profile: {
      create: mocks.profileCreate,
      findUnique: mocks.profileFindUnique,
      update: mocks.profileUpdate,
    },
    trip: {
      count: mocks.tripCount,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}))

import {
  getProfileSummary,
  updateProfileDetails,
} from '@/services/profileService'

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates profile details and marks complete when required fields are present', async () => {
    const updatedProfile = {
      id: 'profile-id',
      userId: 'user-id',
      displayName: 'Aiman',
      avatarUrl: null,
      country: 'Malaysia',
      region: 'Selangor',
      preferredCurrency: 'MYR',
      travelInterests: ['food'],
      preferredLanguage: null,
      profileComplete: true,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    }
    mocks.profileUpdate.mockResolvedValue(updatedProfile)

    const result = await updateProfileDetails('user-id', {
      displayName: ' Aiman ',
      country: ' Malaysia ',
      region: ' Selangor ',
      preferredCurrency: 'myr',
      travelInterests: ['food'],
      preferredLanguage: '',
    })

    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      data: {
        displayName: 'Aiman',
        country: 'Malaysia',
        region: 'Selangor',
        preferredCurrency: 'MYR',
        travelInterests: ['food'],
        preferredLanguage: null,
        profileComplete: true,
      },
    })
    expect(result).toEqual(updatedProfile)
  })

  it('returns profile summary with trip counts', async () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z')
    const profile = {
      id: 'profile-id',
      userId: 'user-id',
      displayName: 'Aiman',
      avatarUrl: null,
      country: 'Malaysia',
      region: 'Selangor',
      preferredCurrency: 'MYR',
      travelInterests: [],
      preferredLanguage: 'en',
      profileComplete: true,
      createdAt,
      updatedAt: createdAt,
    }
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-id',
      email: 'aimanfau13@gmail.com',
      createdAt,
      updatedAt: createdAt,
      profile,
    })
    mocks.tripCount.mockResolvedValueOnce(3).mockResolvedValueOnce(2)

    await expect(getProfileSummary('user-id')).resolves.toEqual({
      profile,
      email: 'aimanfau13@gmail.com',
      accountCreatedAt: createdAt,
      tripCount: 3,
      completedTripCount: 2,
    })
  })
})
