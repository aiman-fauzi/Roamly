import type { RankedDestinationCandidate } from '@/services/destinations/types'
import { resolveExchangeRate, type ExchangeRateResult } from '@/services/exchangeRateService'
import type { BudgetCategory, TripBudgetSummary } from '@/services/travel/budget/types'
import {
  addMoney,
  compareMoney,
  convertMoney,
  divideMoney,
  money,
  multiplyMoney,
  percentMoney,
  subtractMoney,
} from '@/services/travel/offers/money'
import type { ConvertedMoney, FlightOffer, HotelOffer, Money } from '@/services/travel/offers/types'

export interface TripBudgetInput {
  currency: string
  destinationCurrency: string
  travelerCount: number
  durationDays: number
  userBudget?: Money
  selectedFlightOffer?: FlightOffer | null
  selectedHotelOffer?: HotelOffer | null
  destinationCandidates?: RankedDestinationCandidate[]
  dailyFoodBudget?: Money
  dailyLocalTransportBudget?: Money
  contingencyPercent?: number
}

export interface TripBudgetServiceOptions {
  resolveRate?: (input: { baseCurrency: string; quoteCurrency: string }) => Promise<ExchangeRateResult>
  now?: () => Date
}

const DEFAULT_DAILY_FOOD_BUDGET = '80.00'
const DEFAULT_DAILY_LOCAL_TRANSPORT_BUDGET = '30.00'
const DEFAULT_CONTINGENCY_PERCENT = 10

function readMoneyEnv(name: string, fallback: string, currency: string): Money {
  const value = process.env[name]
  return money(value && /^\d+(\.\d{1,2})?$/.test(value) ? value : fallback, currency)
}

function readPercentEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback
}

function zero(currency: string): Money {
  return money('0.00', currency)
}

async function convertIfNeeded(
  value: Money,
  targetCurrency: string,
  resolveRate: TripBudgetServiceOptions['resolveRate']
): Promise<ConvertedMoney> {
  const rate =
    value.currency === targetCurrency
      ? {
          baseCurrency: value.currency,
          quoteCurrency: targetCurrency,
          rate: 1,
          source: 'same_currency',
          fetchedAt: new Date(),
          fromCache: false,
        }
      : await (resolveRate ?? resolveExchangeRate)({
          baseCurrency: value.currency,
          quoteCurrency: targetCurrency,
        })

  return convertMoney(value, rate)
}

function category(input: {
  status: BudgetCategory['status']
  amount: Money
  assumptions?: string[]
  missingData?: string[]
  converted?: ConvertedMoney
  travelerCount: number
}): BudgetCategory {
  return {
    status: input.status,
    amount: input.amount,
    original: input.converted?.original,
    converted: input.converted,
    perPersonAmount: divideMoney(input.amount, Math.max(1, input.travelerCount)),
    assumptions: input.assumptions ?? [],
    missingData: input.missingData ?? [],
  }
}

function applicableTicketPrice(candidate: RankedDestinationCandidate): Money | null {
  if (candidate.ticketPriceStatus !== 'VERIFIED') return null
  const price =
    candidate.ticketPrices.find((entry) => entry.audience === 'GENERAL') ??
    (candidate.ticketPrices.length === 1 ? candidate.ticketPrices[0] : undefined)
  if (!price || price.priceType === 'UNKNOWN') return null
  if (price.priceType === 'FREE') return money('0.00', price.currency)
  if (price.priceType !== 'FIXED' || price.amount == null) return null
  return money(price.amount.toFixed(2), price.currency)
}

export class TripBudgetService {
  constructor(private readonly options: TripBudgetServiceOptions = {}) {}

  async calculate(input: TripBudgetInput): Promise<TripBudgetSummary> {
    const currency = input.currency.toUpperCase()
    const travelerCount = Math.max(1, input.travelerCount)
    const durationDays = Math.max(1, input.durationDays)
    const assumptions: string[] = []
    const missingData: string[] = []

    const flightConverted = input.selectedFlightOffer
      ? await convertIfNeeded(input.selectedFlightOffer.totalPrice, currency, this.options.resolveRate)
      : null
    const flight = category({
      status: flightConverted ? 'KNOWN' : 'UNKNOWN',
      amount: flightConverted?.converted ?? zero(currency),
      converted: flightConverted ?? undefined,
      travelerCount,
      missingData: flightConverted ? [] : ['No selected flight offer.'],
    })

    const hotelConverted = input.selectedHotelOffer
      ? await convertIfNeeded(input.selectedHotelOffer.totalPrice, currency, this.options.resolveRate)
      : null
    const accommodation = category({
      status: hotelConverted ? 'KNOWN' : 'UNKNOWN',
      amount: hotelConverted?.converted ?? zero(currency),
      converted: hotelConverted ?? undefined,
      travelerCount,
      missingData: hotelConverted ? [] : ['No selected hotel offer.'],
    })

    const attractionCandidates = input.destinationCandidates ?? []
    const attractionPrices: Money[] = []
    for (const candidate of attractionCandidates) {
      if (candidate.entityType !== 'ATTRACTION') continue
      const price = applicableTicketPrice(candidate)
      if (price) {
        const converted = await convertIfNeeded(multiplyMoney(price, travelerCount), currency, this.options.resolveRate)
        attractionPrices.push(converted.converted)
      } else {
        missingData.push(`Unknown verified ticket price for ${candidate.name}.`)
      }
    }
    const attractionsAmount = addMoney(attractionPrices, currency)
    const attractions = category({
      status:
        attractionPrices.length === 0
          ? 'UNKNOWN'
          : missingData.some((entry) => entry.startsWith('Unknown verified ticket price'))
            ? 'PARTIAL'
            : 'KNOWN',
      amount: attractionsAmount,
      travelerCount,
      assumptions: attractionPrices.length > 0 ? ['Verified attraction ticket prices are multiplied by traveler count.'] : [],
      missingData: missingData.filter((entry) => entry.startsWith('Unknown verified ticket price')),
    })

    const dailyFoodBudget =
      input.dailyFoodBudget ?? readMoneyEnv('DEFAULT_DAILY_FOOD_BUDGET', DEFAULT_DAILY_FOOD_BUDGET, currency)
    const food = category({
      status: 'ESTIMATED',
      amount: multiplyMoney(dailyFoodBudget, durationDays * travelerCount),
      travelerCount,
      assumptions: [`Food uses configured daily allowance ${dailyFoodBudget.amount} ${currency} per traveler.`],
    })

    const dailyLocalTransportBudget =
      input.dailyLocalTransportBudget ??
      readMoneyEnv('DEFAULT_DAILY_LOCAL_TRANSPORT_BUDGET', DEFAULT_DAILY_LOCAL_TRANSPORT_BUDGET, currency)
    const localTransport = category({
      status: 'ESTIMATED',
      amount: multiplyMoney(dailyLocalTransportBudget, durationDays * travelerCount),
      travelerCount,
      assumptions: [
        `Local transport uses configured daily allowance ${dailyLocalTransportBudget.amount} ${currency} per traveler.`,
      ],
    })

    const subtotal = addMoney(
      [flight.amount, accommodation.amount, attractions.amount, food.amount, localTransport.amount],
      currency
    )
    const contingencyPercent =
      input.contingencyPercent ?? readPercentEnv('TRIP_BUDGET_CONTINGENCY_PERCENT', DEFAULT_CONTINGENCY_PERCENT)
    const contingency = category({
      status: 'ESTIMATED',
      amount: percentMoney(subtotal, contingencyPercent),
      travelerCount,
      assumptions: [`Contingency is ${contingencyPercent}% of known and estimated subtotal.`],
    })
    const totalAmount = addMoney([subtotal, contingency.amount], currency)
    const userBudgetOriginal = input.userBudget ? money(input.userBudget.amount, input.userBudget.currency) : undefined
    const userBudget = userBudgetOriginal
      ? (await convertIfNeeded(userBudgetOriginal, currency, this.options.resolveRate)).converted
      : undefined
    const remainingBudget = userBudget ? subtractMoney(userBudget, totalAmount) : undefined

    const categories = [flight, accommodation, attractions, food, localTransport, contingency]
    for (const item of categories) {
      assumptions.push(...item.assumptions)
      missingData.push(...item.missingData)
    }

    return {
      currency,
      flight,
      accommodation,
      attractions,
      food,
      localTransport,
      contingency,
      total: {
        amount: totalAmount,
        perPersonAmount: divideMoney(totalAmount, travelerCount),
        userBudget,
        remainingBudget,
        isBudgetExceeded: remainingBudget ? compareMoney(remainingBudget, zero(currency)) < 0 : undefined,
      },
      assumptions,
      missingData: [...new Set(missingData)],
      calculatedAt: (this.options.now ?? (() => new Date()))().toISOString(),
    }
  }
}
