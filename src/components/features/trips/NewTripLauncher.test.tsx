import { render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NewTripLauncher } from './NewTripLauncher'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
  }),
}))

describe('NewTripLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          id: 'trip-id',
          userId: 'user-id',
          title: 'My New Trip',
          status: 'DRAFT',
          itineraryJson: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      )
    )
  })

  it('creates a trip once even when effects are replayed in React Strict Mode', async () => {
    render(
      <StrictMode>
        <NewTripLauncher />
      </StrictMode>
    )

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/trips/trip-id/questionnaire')
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/trips', { method: 'POST' })
  })
})
