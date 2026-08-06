import { describe, expect, it } from 'vitest'

import { InMemoryOfferCache } from '@/services/travel/offers/offerCache'

describe('bounded in-memory offer cache', () => {
  it('evicts the least recently used entry at its configured bound', async () => {
    const cache = new InMemoryOfferCache<{ value: number }>({ maxEntries: 2 })
    const now = new Date('2026-08-06T00:00:00.000Z')
    await cache.getOrSet('first', async () => ({ value: 1 }), { ttlSeconds: 60, now })
    await cache.getOrSet('second', async () => ({ value: 2 }), { ttlSeconds: 60, now })
    expect(cache.get('first', now)).not.toBeNull()
    await cache.getOrSet('third', async () => ({ value: 3 }), { ttlSeconds: 60, now })

    expect(cache.get('first', now)?.value.value).toBe(1)
    expect(cache.get('second', now)).toBeNull()
    expect(cache.get('third', now)?.value.value).toBe(3)
  })

  it('returns clones so callers cannot mutate shared cached values', async () => {
    const cache = new InMemoryOfferCache<{ nested: { value: number } }>()
    const now = new Date('2026-08-06T00:00:00.000Z')
    const first = await cache.getOrSet('key', async () => ({ nested: { value: 1 } }), {
      ttlSeconds: 60,
      now,
    })
    first.value.nested.value = 99

    expect(cache.get('key', now)?.value.nested.value).toBe(1)
  })
})
