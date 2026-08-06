import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profileFindUnique: vi.fn(),
  profileUpsert: vi.fn(),
  profileUpdate: vi.fn(),
  tripCount: vi.fn(),
  userFindUnique: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  prisma: {
    profile: {
      findUnique: mocks.profileFindUnique,
      upsert: mocks.profileUpsert,
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
  ensureProfile,
  getProfileSummary,
  updateProfileDetails,
} from '@/services/profileService'

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes a profile with an atomic upsert', async () => {
    const profile = { id: 'profile-id', userId: 'user-id' }
    mocks.profileUpsert.mockResolvedValue(profile)

    await expect(
      ensureProfile('user-id', null, null, 'smoke.user@example.com')
    ).resolves.toEqual(profile)
    expect(mocks.profileUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      update: {},
      create: {
        userId: 'user-id',
        displayName: 'smoke.user',
        avatarUrl: null,
        profileComplete: false,
      },
    })
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
