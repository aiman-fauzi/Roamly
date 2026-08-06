'use client'

import { useEffect, useMemo, useState } from 'react'

import { FlightOptionCard } from './FlightOptionCard'
import { HotelOptionCard } from './HotelOptionCard'
import { MockDataNotice } from './MockDataBadge'
import { TravelContextSummary } from './TravelContextSummary'
import { TripCostSummary } from './TripCostSummary'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { API } from '@/constants/api'
import type { TripBudgetSummary } from '@/services/travel/budget/types'
import type {
  FlightOffer,
  FlightSearchResult,
  HotelOffer,
  HotelSearchResult,
} from '@/services/travel/offers/types'
import type {
  TravelSelectionResponse,
  TravelSelectionSearchInputs,
  ValidTravelSelectionResponse,
} from '@/services/travel/persistence/tripTravelSelectionService'
import type { ItineraryTravelContext } from '@/services/travel/planning/liveTravelContext'
import type { ApiErrorResponse } from '@/types/api'
import type { TripWithPreferences } from '@/types/trip'

interface TravelPlanningWorkspaceProps {
  trip: TripWithPreferences
  onComplete: () => void
}

interface PlanResponse {
  itineraryStatus?: {
    status: 'generated' | 'not_generated' | 'planning_preview_due_to_ai_failure'
    code?: string
    message?: string
  }
  itineraryTravelContext?: ItineraryTravelContext
  flightSearch?: FlightSearchResult
  hotelSearch?: HotelSearchResult
  budgetSummary?: TripBudgetSummary
}

interface TravelForm {
  originAirportCode: string
  destinationAirportCode: string
  departureDate: string
  returnDate: string
  adults: number
  rooms: number
  cabinClass: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  currency: string
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function destinationAirport(destination?: string | null): string {
  return destination?.toLowerCase().includes('phu quoc') ? 'PQC' : 'PQC'
}

function initialForm(trip: TripWithPreferences): TravelForm {
  const departureDate = '2026-09-12'
  const durationDays = Math.max(1, trip.preferenceSet?.durationDays ?? 4)
  return {
    originAirportCode: 'KUL',
    destinationAirportCode: destinationAirport(trip.preferenceSet?.destination),
    departureDate,
    returnDate: addDays(departureDate, Math.max(1, durationDays) - 1),
    adults: Math.max(1, trip.preferenceSet?.groupSize ?? 2),
    rooms: 1,
    cabinClass: 'ECONOMY',
    currency: 'MYR',
  }
}

function formFromSearchInputs(input: TravelSelectionSearchInputs): TravelForm {
  return {
    originAirportCode: input.originAirportCode,
    destinationAirportCode: input.destinationAirportCode,
    departureDate: input.outboundDate,
    returnDate: input.returnDate,
    adults: input.travellers,
    rooms: input.rooms,
    cabinClass: input.cabinClass,
    currency: input.currency,
  }
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function parseError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  return (data as ApiErrorResponse).error ?? fallback
}

function isValidSelection(
  response: TravelSelectionResponse
): response is ValidTravelSelectionResponse {
  return response.state === 'valid'
}

export function TravelPlanningWorkspace({ trip, onComplete }: TravelPlanningWorkspaceProps) {
  const [form, setForm] = useState<TravelForm>(() => initialForm(trip))
  const [flightSearch, setFlightSearch] = useState<FlightSearchResult | null>(null)
  const [hotelSearch, setHotelSearch] = useState<HotelSearchResult | null>(null)
  const [selectedOutboundFlightId, setSelectedOutboundFlightId] = useState<string | null>(null)
  const [selectedReturnFlightId, setSelectedReturnFlightId] = useState<string | null>(null)
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null)
  const [budgetSummary, setBudgetSummary] = useState<TripBudgetSummary | null>(null)
  const [travelContext, setTravelContext] = useState<ItineraryTravelContext | null>(null)
  const [generationStatus, setGenerationStatus] = useState<PlanResponse['itineraryStatus'] | null>(
    null
  )
  const [selectionState, setSelectionState] = useState<
    'loading' | TravelSelectionResponse['state']
  >('loading')
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isEstimating, setIsEstimating] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function restoreSelection() {
      setSelectionState('loading')
      setError(null)
      try {
        const response = await fetch(API.tripTravelSelection(trip.id))
        const data = (await readResponseJson(response)) as TravelSelectionResponse | ApiErrorResponse | null
        if (cancelled) return
        if (!response.ok) {
          setSelectionState('invalid')
          setError(parseError(data, 'Unable to restore reviewed sample travel options.'))
          return
        }

        const selection = data as TravelSelectionResponse
        setSelectionVersion(selection.version)
        setSelectionState(selection.state)
        setSelectionMessage(selection.message ?? null)
        if (selection.searchInputs) setForm(formFromSearchInputs(selection.searchInputs))

        if (isValidSelection(selection)) {
          setFlightSearch(selection.flightSearch)
          setHotelSearch(selection.hotelSearch)
          setSelectedOutboundFlightId(selection.selectedOutboundFlightId)
          setSelectedReturnFlightId(selection.selectedReturnFlightId)
          setSelectedHotelId(selection.selectedHotelId)
          setBudgetSummary(selection.budgetSummary)
          setTravelContext(selection.itineraryTravelContext)
        }
      } catch {
        if (!cancelled) {
          setSelectionState('invalid')
          setError('Unable to restore reviewed sample travel options.')
        }
      }
    }

    void restoreSelection()
    return () => {
      cancelled = true
    }
  }, [trip.id])

  const outboundOptions = useMemo(
    () =>
      uniqueById(
        flightSearch?.offers
          .map((offer) => offer.mockFlightPair?.outbound)
          .filter((option): option is NonNullable<FlightOffer['mockFlightPair']>['outbound'] =>
            Boolean(option)
          ) ?? []
      ),
    [flightSearch]
  )
  const returnOptions = useMemo(
    () =>
      uniqueById(
        flightSearch?.offers
          .map((offer) => offer.mockFlightPair?.return)
          .filter((option): option is NonNullable<FlightOffer['mockFlightPair']>['return'] =>
            Boolean(option)
          ) ?? []
      ),
    [flightSearch]
  )
  const hotelOptions = useMemo(
    () =>
      hotelSearch?.offers
        .map((offer) => offer.mockHotel?.option)
        .filter((option): option is NonNullable<HotelOffer['mockHotel']>['option'] =>
          Boolean(option)
        ) ?? [],
    [hotelSearch]
  )
  const selectedFlightOfferId = useMemo(
    () =>
      flightSearch?.offers.find(
        (offer) =>
          offer.mockFlightPair?.outboundFlightId === selectedOutboundFlightId &&
          offer.mockFlightPair?.returnFlightId === selectedReturnFlightId
      )?.id ?? null,
    [flightSearch, selectedOutboundFlightId, selectedReturnFlightId]
  )
  const selectedHotelOfferId = useMemo(
    () =>
      hotelSearch?.offers.find((offer) => offer.mockHotel?.hotelId === selectedHotelId)?.id ?? null,
    [hotelSearch, selectedHotelId]
  )

  function updateForm<Key extends keyof TravelForm>(key: Key, value: TravelForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFlightSearch(null)
    setHotelSearch(null)
    setSelectedOutboundFlightId(null)
    setSelectedReturnFlightId(null)
    setSelectedHotelId(null)
    invalidateReviewedPlan(true)
  }

  function invalidateReviewedPlan(tripDetailsChanged = false) {
    setBudgetSummary(null)
    setTravelContext(null)
    setGenerationStatus(null)
    if (selectionVersion > 0) {
      setSelectionState('stale')
      setSelectionMessage(
        tripDetailsChanged
          ? 'Your trip details changed, so please review the latest sample travel options.'
          : 'Your sample travel selection changed, so please review the updated estimate.'
      )
    }
  }

  function selectOutboundFlight(id: string) {
    setSelectedOutboundFlightId(id)
    invalidateReviewedPlan()
  }

  function selectReturnFlight(id: string) {
    setSelectedReturnFlightId(id)
    invalidateReviewedPlan()
  }

  function selectHotel(id: string) {
    setSelectedHotelId(id)
    invalidateReviewedPlan()
  }

  async function readResponseJson(response: Response) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  async function searchTravel() {
    setIsSearching(true)
    setError(null)
    setGenerationStatus(null)
    try {
      const requestBody = {
        ...form,
        children: 0,
        infants: 0,
        checkInDate: form.departureDate,
        checkOutDate: form.returnDate,
        refreshOffers: true,
      }
      const [flightResponse, hotelResponse] = await Promise.all([
        fetch(API.tripFlights(trip.id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }),
        fetch(API.tripHotels(trip.id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }),
      ])
      const [flightData, hotelData] = await Promise.all([
        readResponseJson(flightResponse),
        readResponseJson(hotelResponse),
      ])
      if (!flightResponse.ok) {
        setError(parseError(flightData, 'Unable to search sample flights.'))
        return
      }
      if (!hotelResponse.ok) {
        setError(parseError(hotelData, 'Unable to search sample hotels.'))
        return
      }

      const flights = flightData as FlightSearchResult
      const hotels = hotelData as HotelSearchResult
      setFlightSearch(flights)
      setHotelSearch(hotels)
      setSelectedOutboundFlightId(flights.offers[0]?.mockFlightPair?.outboundFlightId ?? null)
      setSelectedReturnFlightId(flights.offers[0]?.mockFlightPair?.returnFlightId ?? null)
      setSelectedHotelId(hotels.offers[0]?.mockHotel?.hotelId ?? null)
      invalidateReviewedPlan(selectionVersion > 0)
    } finally {
      setIsSearching(false)
    }
  }

  async function reviewBudget() {
    if (!selectedOutboundFlightId || !selectedReturnFlightId || !selectedHotelId) {
      setError('Select one outbound flight, one return flight, and one hotel first.')
      return
    }

    setIsEstimating(true)
    setError(null)
    try {
      const response = await fetch(API.tripTravelSelection(trip.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originAirportCode: form.originAirportCode,
          destinationAirportCode: form.destinationAirportCode,
          outboundDate: form.departureDate,
          returnDate: form.returnDate,
          travellers: form.adults,
          rooms: form.rooms,
          cabinClass: form.cabinClass,
          currency: form.currency,
          selectedOutboundFlightId,
          selectedReturnFlightId,
          selectedHotelId,
          expectedVersion: selectionVersion,
        }),
      })
      const data = (await readResponseJson(response)) as TravelSelectionResponse | ApiErrorResponse | null
      if (!response.ok) {
        setError(parseError(data, 'Unable to estimate the sample trip budget.'))
        return
      }

      const reviewed = data as TravelSelectionResponse
      if (!isValidSelection(reviewed)) {
        setSelectionState(reviewed.state)
        setSelectionMessage(reviewed.message ?? null)
        setError('The selected sample travel options could not be verified.')
        return
      }
      setSelectionVersion(reviewed.version)
      setSelectionState('valid')
      setSelectionMessage('Your reviewed sample travel options have been saved.')
      setFlightSearch(reviewed.flightSearch)
      setHotelSearch(reviewed.hotelSearch)
      setBudgetSummary(reviewed.budgetSummary)
      setTravelContext(reviewed.itineraryTravelContext)
      setGenerationStatus(null)
    } finally {
      setIsEstimating(false)
    }
  }

  async function clearSelection() {
    setIsClearing(true)
    setError(null)
    try {
      const response = await fetch(
        `${API.tripTravelSelection(trip.id)}?expectedVersion=${selectionVersion}`,
        { method: 'DELETE' }
      )
      const data = (await readResponseJson(response)) as TravelSelectionResponse | ApiErrorResponse | null
      if (!response.ok) {
        setError(parseError(data, 'Unable to clear the reviewed sample travel selection.'))
        return
      }

      const cleared = data as TravelSelectionResponse
      setSelectionVersion(cleared.version)
      setSelectionState('none')
      setSelectionMessage('Reviewed sample travel selection cleared.')
      setFlightSearch(null)
      setHotelSearch(null)
      setSelectedOutboundFlightId(null)
      setSelectedReturnFlightId(null)
      setSelectedHotelId(null)
      setBudgetSummary(null)
      setTravelContext(null)
      setGenerationStatus(null)
    } finally {
      setIsClearing(false)
    }
  }

  async function generatePlan() {
    if (!selectedFlightOfferId || !selectedHotelOfferId) {
      setError('Select one outbound flight, one return flight, and one hotel first.')
      return
    }
    if (!budgetSummary) {
      setError('Review the estimated trip budget before generating the itinerary.')
      return
    }

    setIsGenerating(true)
    setError(null)
    try {
      const response = await fetch(API.tripPlan(trip.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          children: 0,
          infants: 0,
          checkInDate: form.departureDate,
          checkOutDate: form.returnDate,
          selectedFlightOfferId,
          selectedHotelOfferId,
          persist: true,
          maxCandidates: 12,
        }),
      })
      const data = (await readResponseJson(response)) as PlanResponse | ApiErrorResponse | null
      if (!response.ok) {
        setError(parseError(data, 'Unable to generate itinerary.'))
        return
      }

      const plan = data as PlanResponse
      setBudgetSummary(plan.budgetSummary ?? budgetSummary)
      setTravelContext(plan.itineraryTravelContext ?? null)
      setGenerationStatus(plan.itineraryStatus ?? null)
      if (plan.itineraryStatus?.status === 'generated') {
        onComplete()
      }
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="space-y-5" aria-label="Sample travel planning">
      {selectionState === 'loading' && (
        <Card className="space-y-3" aria-live="polite">
          <p className="text-sm font-medium text-neutral-700">
            Restoring reviewed sample travel options...
          </p>
          <div className="h-2 w-full animate-pulse rounded bg-neutral-100" />
          <div className="h-2 w-2/3 animate-pulse rounded bg-neutral-100" />
        </Card>
      )}
      <Card className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-atlas-700">Sample travel setup</p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
              Choose travel before generating
            </h1>
          </div>
          <p className="max-w-sm text-sm text-neutral-700">
            {trip.preferenceSet?.destination ?? 'Destination'} - {form.adults} travellers
          </p>
        </div>
        <MockDataNotice />

        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm font-medium text-neutral-800">
            Origin
            <input
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 uppercase"
              value={form.originAirportCode}
              maxLength={3}
              onChange={(event) =>
                updateForm('originAirportCode', event.target.value.toUpperCase())
              }
            />
          </label>
          <label className="text-sm font-medium text-neutral-800">
            Destination
            <input
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 uppercase"
              value={form.destinationAirportCode}
              maxLength={3}
              onChange={(event) =>
                updateForm('destinationAirportCode', event.target.value.toUpperCase())
              }
            />
          </label>
          <label className="text-sm font-medium text-neutral-800">
            Depart
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2"
              value={form.departureDate}
              onChange={(event) => updateForm('departureDate', event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-neutral-800">
            Return
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2"
              value={form.returnDate}
              onChange={(event) => updateForm('returnDate', event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-neutral-800">
            Travellers
            <input
              type="number"
              min={1}
              max={18}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2"
              value={form.adults}
              onChange={(event) => updateForm('adults', Number(event.target.value))}
            />
          </label>
          <label className="text-sm font-medium text-neutral-800">
            Rooms
            <input
              type="number"
              min={1}
              max={8}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2"
              value={form.rooms}
              onChange={(event) => updateForm('rooms', Number(event.target.value))}
            />
          </label>
          <label className="text-sm font-medium text-neutral-800">
            Cabin
            <select
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2"
              value={form.cabinClass}
              onChange={(event) =>
                updateForm('cabinClass', event.target.value as TravelForm['cabinClass'])
              }
            >
              <option value="ECONOMY">Economy</option>
              <option value="PREMIUM_ECONOMY">Premium economy</option>
              <option value="BUSINESS">Business</option>
              <option value="FIRST">First</option>
            </select>
          </label>
          <label className="text-sm font-medium text-neutral-800">
            Currency
            <input
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 uppercase"
              value={form.currency}
              maxLength={3}
              onChange={(event) => updateForm('currency', event.target.value.toUpperCase())}
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={searchTravel} isLoading={isSearching} loadingLabel="Searching...">
            Search sample travel
          </Button>
          <Button
            variant="outline"
            onClick={reviewBudget}
            isLoading={isEstimating}
            loadingLabel="Estimating..."
            disabled={!selectedFlightOfferId || !selectedHotelOfferId}
          >
            Review estimated budget
          </Button>
          <Button
            variant="outline"
            onClick={generatePlan}
            isLoading={isGenerating}
            loadingLabel="Generating..."
            disabled={!budgetSummary}
          >
            Generate itinerary
          </Button>
          {selectionState !== 'none' && selectionState !== 'loading' && (
            <Button
              variant="ghost"
              onClick={clearSelection}
              isLoading={isClearing}
              loadingLabel="Clearing..."
            >
              Clear reviewed selection
            </Button>
          )}
        </div>
        {selectionMessage && (
          <p
            role="status"
            className={
              selectionState === 'valid'
                ? 'rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                : 'rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800'
            }
          >
            {selectionMessage}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-error-500">
            {error}
          </p>
        )}
        {generationStatus?.status === 'planning_preview_due_to_ai_failure' && (
          <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {generationStatus.message}
          </p>
        )}
      </Card>

      {outboundOptions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900">Outbound flight</h2>
          <div className="grid gap-3">
            {outboundOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="text-left"
                onClick={() => selectOutboundFlight(option.id)}
              >
                <FlightOptionCard
                  option={option}
                  title="Outbound"
                  selected={selectedOutboundFlightId === option.id}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {returnOptions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900">Return flight</h2>
          <div className="grid gap-3">
            {returnOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="text-left"
                onClick={() => selectReturnFlight(option.id)}
              >
                <FlightOptionCard
                  option={option}
                  title="Return"
                  selected={selectedReturnFlightId === option.id}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {hotelOptions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900">Sample hotel</h2>
          <div className="grid gap-3">
            {hotelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="text-left"
                onClick={() => selectHotel(option.id)}
              >
                <HotelOptionCard option={option} selected={selectedHotelId === option.id} />
              </button>
            ))}
          </div>
        </div>
      )}

      {budgetSummary && !travelContext && <TripCostSummary budgetSummary={budgetSummary} />}

      {travelContext && <TravelContextSummary context={travelContext} />}
    </section>
  )
}
