import { describe, expect, it, vi } from 'vitest'

import { buildDestinationEnrichmentPrompt } from '@/enrichment/destinationEnrichmentPrompt'
import type { DestinationEnrichmentProvider, EnrichableDestination } from '@/enrichment/types'
import { DestinationEnrichmentService } from '@/services/enrichment/destinationEnrichmentService'


function createMockDb(destination: EnrichableDestination) {
  const job = {
    id: 'job-1',
    status: 'RUNNING',
    processedRecords: 0,
    skippedRecords: 0,
    failedRecords: 0,
    errorMessage: null as string | null,
  }

  return {
    destinationEnrichmentJob: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(job),
      update: vi.fn().mockImplementation(({ data }) => {
        if (typeof data.status === 'string') job.status = data.status
        if (typeof data.errorMessage === 'string' || data.errorMessage === null) {
          job.errorMessage = data.errorMessage
        }
        if (data.processedRecords?.increment) job.processedRecords += data.processedRecords.increment
        if (data.skippedRecords?.increment) job.skippedRecords += data.skippedRecords.increment
        if (data.failedRecords?.increment) job.failedRecords += data.failedRecords.increment
        return Promise.resolve({ ...job })
      }),
    },
    attraction: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: destination.id,
          name: destination.name,
          description: destination.description,
          address: destination.address,
          latitude: destination.latitude,
          longitude: destination.longitude,
          priceLevel: destination.priceLevel,
          durationMinutes: destination.durationMinutes,
          slug: destination.slug ?? 'central-market',
          websiteUrl: destination.sourceUrl ?? null,
          city: {
            name: destination.cityName,
            slug: destination.citySlug ?? 'kuala-lumpur',
            country: {
              name: destination.countryName,
              slug: destination.countrySlug ?? 'malaysia',
            },
          },
          tags: destination.tags.map((name) => ({ name })),
        },
      ]),
    },
    restaurant: { findMany: vi.fn().mockResolvedValue([]) },
    hotel: { findMany: vi.fn().mockResolvedValue([]) },
    activity: { findMany: vi.fn().mockResolvedValue([]) },
    destinationEnrichment: {
      create: vi.fn().mockResolvedValue({ id: 'enrichment-1' }),
    },
  }
}

describe('destination enrichment', () => {
  it('builds a destination-only enrichment prompt', () => {
    const prompt = buildDestinationEnrichmentPrompt({
      id: 'destination-1',
      kind: 'ATTRACTION',
      name: 'Central Market',
      description: 'Historic market hall.',
      address: 'Kuala Lumpur',
      cityName: 'Kuala Lumpur',
      countryName: 'Malaysia',
      latitude: 3.145,
      longitude: 101.696,
      tags: ['culture', 'shopping'],
    })

    expect(prompt).toContain('Central Market')
    expect(prompt).toContain('hiddenGemScore')
    expect(prompt).not.toContain('itinerary')
  })

  it('runs a background batch and stores generated enrichment', async () => {
    const destination: EnrichableDestination = {
      id: 'destination-1',
      kind: 'ATTRACTION',
      name: 'Central Market',
      description: 'Historic market hall.',
      address: 'Kuala Lumpur',
      cityName: 'Kuala Lumpur',
      countryName: 'Malaysia',
      latitude: 3.145,
      longitude: 101.696,
      tags: ['culture'],
    }

    const db = createMockDb(destination)
    const provider: DestinationEnrichmentProvider = {
      generate: vi.fn().mockResolvedValue({
        shortSummary: 'A lively heritage market known for crafts and local culture.',
        bestFor: ['culture', 'souvenirs'],
        hiddenGemScore: 62,
        photographyScore: 78,
        familyFriendly: true,
        coupleFriendly: true,
        kidsFriendly: true,
        budgetLevel: 'BUDGET',
        estimatedVisitDurationMinutes: 90,
        bestVisitingHours: ['Morning', 'Late afternoon'],
        indoorOutdoor: 'INDOOR',
        rainFriendly: true,
        searchTags: ['market', 'culture'],
        provider: 'test',
        model: 'mock',
      }),
    }

    const summary = await new DestinationEnrichmentService({
      db: db as never,
      provider,
    }).runBackgroundJob({ batchSize: 10 })

    expect(summary).toMatchObject({ status: 'COMPLETED', processedRecords: 1 })
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ id: 'destination-1' }))
    expect(db.destinationEnrichment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attractionId: 'destination-1',
          hiddenGemScore: 62,
          provider: 'test',
        }),
      })
    )
    expect(db.attraction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ enrichment: null }) })
    )
  })

  it('marks the job failed when every generated enrichment fails validation', async () => {
    const destination: EnrichableDestination = {
      id: 'destination-1',
      kind: 'ATTRACTION',
      name: 'Central Market',
      description: 'Historic market hall.',
      address: 'Kuala Lumpur',
      cityName: 'Kuala Lumpur',
      countryName: 'Malaysia',
      latitude: 3.145,
      longitude: 101.696,
      tags: ['culture'],
    }

    const db = createMockDb(destination)
    const provider: DestinationEnrichmentProvider = {
      generate: vi.fn().mockRejectedValue(new Error('Destination enrichment JSON is missing required fields.')),
    }

    const summary = await new DestinationEnrichmentService({
      db: db as never,
      provider,
    }).runBackgroundJob({ batchSize: 1 })

    expect(summary).toMatchObject({
      status: 'FAILED',
      processedRecords: 0,
      failedRecords: 1,
    })
    expect(db.destinationEnrichment.create).not.toHaveBeenCalled()
    expect(db.destinationEnrichmentJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Destination enrichment persisted no enrichment records.',
        }),
      })
    )
  })

  it('skips low-quality persisted records before calling the provider', async () => {
    const acceptedDestination: EnrichableDestination = {
      id: 'accepted-1',
      kind: 'ATTRACTION',
      name: 'Central Market',
      slug: 'central-market',
      description: 'Historic market hall.',
      address: 'Kuala Lumpur',
      cityName: 'Kuala Lumpur',
      citySlug: 'kuala-lumpur',
      countryName: 'Malaysia',
      countrySlug: 'malaysia',
      latitude: 3.145,
      longitude: 101.696,
      sourceUrl: 'https://example.com/central-market',
      tags: ['culture'],
    }
    const db = createMockDb(acceptedDestination)
    db.attraction.findMany.mockResolvedValue([
      {
        id: 'rejected-1',
        name: 'Malaysia',
        slug: 'malaysia',
        description: 'Malaysia is a country in Southeast Asia.',
        address: null,
        latitude: 3,
        longitude: 108,
        priceLevel: null,
        durationMinutes: null,
        websiteUrl: 'https://en.wikivoyage.org/wiki/Malaysia',
        city: {
          name: 'Kuala Lumpur',
          slug: 'kuala-lumpur',
          country: { name: 'Malaysia', slug: 'malaysia' },
        },
        tags: [{ name: 'wikivoyage' }],
      },
      {
        id: acceptedDestination.id,
        name: acceptedDestination.name,
        slug: acceptedDestination.slug,
        description: acceptedDestination.description,
        address: acceptedDestination.address,
        latitude: acceptedDestination.latitude,
        longitude: acceptedDestination.longitude,
        priceLevel: null,
        durationMinutes: null,
        websiteUrl: acceptedDestination.sourceUrl,
        city: {
          name: acceptedDestination.cityName,
          slug: acceptedDestination.citySlug,
          country: { name: acceptedDestination.countryName, slug: acceptedDestination.countrySlug },
        },
        tags: acceptedDestination.tags.map((name) => ({ name })),
      },
    ])
    const provider: DestinationEnrichmentProvider = {
      generate: vi.fn().mockResolvedValue({
        shortSummary: 'A lively heritage market known for crafts and local culture.',
        bestFor: ['culture', 'souvenirs'],
        hiddenGemScore: 62,
        photographyScore: 78,
        familyFriendly: true,
        coupleFriendly: true,
        kidsFriendly: true,
        budgetLevel: 'BUDGET',
        estimatedVisitDurationMinutes: 90,
        bestVisitingHours: ['Morning', 'Late afternoon'],
        indoorOutdoor: 'INDOOR',
        rainFriendly: true,
        searchTags: ['market', 'culture'],
        provider: 'test',
        model: 'mock',
      }),
    }

    const summary = await new DestinationEnrichmentService({
      db: db as never,
      provider,
    }).runBackgroundJob({ batchSize: 10 })

    expect(summary).toMatchObject({ status: 'COMPLETED', processedRecords: 1 })
    expect(provider.generate).toHaveBeenCalledTimes(1)
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ id: 'accepted-1' }))
    expect(provider.generate).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'rejected-1' }))
  })
})
