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
          candidateId: 'ATTRACTION:kiyomizu-dera',
          time: '09:00',
          title: 'Kiyomizu-dera',
          description: 'Explore the historic temple complex.',
          location: 'Higashiyama',
          transport: 'Train',
          estimatedDuration: '2 hours',
          durationMinutes: 120,
          reason: 'Matches the cultural trip style.',
          estimatedCostLocal: 2500,
          estimatedCostUserCurrency: 80,
          currencyLocal: 'JPY',
          currencyUser: 'MYR',
          priceConfidence: 'ESTIMATED_PRICE',
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
    expect(screen.getAllByText(/Estimated JPY 2,500/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/MYR 80/i).length).toBeGreaterThan(0)
    expect(screen.getByText('2 hrs')).toBeInTheDocument()
    expect(screen.getByText(/Daily total/i)).toBeInTheDocument()
  })

  it('distinguishes free and unknown prices', () => {
    render(
      <DayCard
        day={{
          ...itinerary.days[0],
          morning: [
            {
              ...itinerary.days[0].morning[0],
              title: 'Free Museum',
              estimatedCostLocal: 0,
              estimatedCostUserCurrency: 0,
              priceConfidence: 'KNOWN_PRICE',
              durationMinutes: 45,
              transport: 'public',
            },
            {
              ...itinerary.days[0].morning[0],
              title: 'Unknown Price Garden',
              estimatedCostLocal: 0,
              estimatedCostUserCurrency: 0,
              priceConfidence: 'PRICE_UNKNOWN',
              durationMinutes: 90,
            },
          ],
        }}
      />
    )

    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('Price unavailable')).toBeInTheDocument()
    expect(screen.getByText('Public transport')).toBeInTheDocument()
    expect(screen.getByText('45 min')).toBeInTheDocument()
    expect(screen.getByText('1 hr 30 min')).toBeInTheDocument()
  })

  it('hides the exchange-rate card when local and user currencies match', () => {
    render(
      <ItineraryHeader
        itinerary={{
          ...itinerary,
          currencyLocal: 'MYR',
          currencyUser: 'MYR',
          exchangeRate: {
            ...itinerary.exchangeRate,
            baseCurrency: 'MYR',
            quoteCurrency: 'MYR',
            rate: 1,
          },
        }}
        destination="Kuala Lumpur"
      />
    )

    expect(screen.queryByText('Exchange rate')).not.toBeInTheDocument()
  })

  it('renders roadmap timeline labels in order', () => {
    render(<ItineraryTimeline roadmap={itinerary.roadmap} />)

    expect(screen.getByText('Hotel')).toBeInTheDocument()
    expect(screen.getByText('Kiyomizu-dera')).toBeInTheDocument()
  })
})


