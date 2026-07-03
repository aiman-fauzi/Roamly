import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DayCard } from '@/components/features/itinerary/DayCard'
import { ItineraryHeader } from '@/components/features/itinerary/ItineraryHeader'
import { ItineraryTimeline } from '@/components/features/itinerary/ItineraryTimeline'
import type { Itinerary } from '@/types/itinerary'

const itinerary: Itinerary = {
  title: 'Kyoto in Five Days',
  summary: 'A balanced Kyoto itinerary.',
  currencyLocal: 'JPY',
  currencyUser: 'MYR',
  exchangeRate: {
    baseCurrency: 'JPY',
    quoteCurrency: 'MYR',
    rate: 0.032,
    source: 'frankfurter',
    fetchedAt: '2026-07-03T00:00:00.000Z',
    fromCache: false,
  },
  budget: {
    totalBudgetUserCurrency: 3200,
    estimatedTotalLocal: 10000,
    estimatedTotalUserCurrency: 320,
    remainingBudgetUserCurrency: 2880,
    isBudgetExceeded: false,
  },
  days: [
    {
      dayNumber: 1,
      theme: 'Arrival and temples',
      morning: [
        {
          time: '09:00',
          title: 'Kiyomizu-dera',
          description: 'Explore the historic temple complex.',
          location: 'Higashiyama',
          transport: 'Train',
          estimatedDuration: '2 hours',
          estimatedCostLocal: 2500,
          estimatedCostUserCurrency: 80,
          currencyLocal: 'JPY',
          currencyUser: 'MYR',
          tips: ['Arrive early.'],
        },
      ],
      afternoon: [],
      evening: [],
      dailyTotalLocal: 2500,
      dailyTotalUserCurrency: 80,
      notes: ['Wear comfortable shoes.'],
    },
  ],
  roadmap: [
    {
      dayNumber: 1,
      items: [
        { label: 'Hotel', kind: 'hotel', time: '08:00' },
        { label: 'Kiyomizu-dera', kind: 'activity', time: '09:00' },
      ],
    },
  ],
}

describe('rich itinerary rendering', () => {
  it('renders budget, exchange-rate, and remaining-budget details', () => {
    render(<ItineraryHeader itinerary={itinerary} destination="Kyoto" />)

    expect(screen.getByText('Kyoto in Five Days')).toBeInTheDocument()
    expect(screen.getByText(/Remaining budget/i)).toBeInTheDocument()
    expect(screen.getByText(/MYR 2,880/i)).toBeInTheDocument()
    expect(screen.getByText(/1 JPY = MYR 0.03/i)).toBeInTheDocument()
  })

  it('renders time-of-day items with local and user costs', () => {
    render(<DayCard day={itinerary.days[0]} />)

    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('Kiyomizu-dera')).toBeInTheDocument()
    expect(screen.getAllByText(/JPY 2,500/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/MYR 80/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Daily total/i)).toBeInTheDocument()
  })

  it('renders roadmap timeline labels in order', () => {
    render(<ItineraryTimeline roadmap={itinerary.roadmap} />)

    expect(screen.getByText('Hotel')).toBeInTheDocument()
    expect(screen.getByText('Kiyomizu-dera')).toBeInTheDocument()
  })
})


