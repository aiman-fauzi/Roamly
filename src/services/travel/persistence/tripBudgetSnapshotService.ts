import type { Prisma } from '@prisma/client'
import type { TripBudgetSnapshot, TripBudgetSnapshotStatus } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

import { prisma } from '@/db/client'
import type { TripBudgetSummary } from '@/services/travel/budget/types'
import type { Money } from '@/services/travel/offers/types'

export interface TripBudgetSnapshotResponse {
  id: string
  tripId: string
  currency: string
  flight: TripBudgetSummary['flight']
  accommodation: TripBudgetSummary['accommodation']
  attractions: TripBudgetSummary['attractions']
  food: TripBudgetSummary['food']
  localTransport: TripBudgetSummary['localTransport']
  contingency: TripBudgetSummary['contingency']
  totalAmount?: Money
  perPersonAmount?: Money
  assumptions: string[]
  missingData: string[]
  selectedFlightSnapshotId?: string
  selectedHotelSnapshotId?: string
  calculatedAt: string
  status: TripBudgetSnapshotStatus
  createdAt: string
  updatedAt: string
}

interface TripBudgetSnapshotDependencies {
  db?: typeof prisma
}

function amountDecimal(value?: Money): Decimal | undefined {
  return value ? new Decimal(value.amount) : undefined
}

function moneyFromDecimal(value: unknown, currency: string): Money | undefined {
  if (value == null) return undefined
  const amount =
    value instanceof Decimal
      ? value.toFixed(2)
      : value && typeof value === 'object' && 'toFixed' in value
        ? (value as { toFixed: (decimalPlaces: number) => string }).toFixed(2)
        : Number(value).toFixed(2)
  return { amount, currency }
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function serializeBudgetSnapshot(snapshot: TripBudgetSnapshot): TripBudgetSnapshotResponse {
  return {
    id: snapshot.id,
    tripId: snapshot.tripId,
    currency: snapshot.currency,
    flight: snapshot.flight as unknown as TripBudgetSummary['flight'],
    accommodation: snapshot.accommodation as unknown as TripBudgetSummary['accommodation'],
    attractions: snapshot.attractions as unknown as TripBudgetSummary['attractions'],
    food: snapshot.food as unknown as TripBudgetSummary['food'],
    localTransport: snapshot.localTransport as unknown as TripBudgetSummary['localTransport'],
    contingency: snapshot.contingency as unknown as TripBudgetSummary['contingency'],
    totalAmount: moneyFromDecimal(snapshot.totalAmount, snapshot.currency),
    perPersonAmount: moneyFromDecimal(snapshot.perPersonAmount, snapshot.currency),
    assumptions: jsonArray(snapshot.assumptions),
    missingData: jsonArray(snapshot.missingData),
    selectedFlightSnapshotId: snapshot.selectedFlightSnapshotId ?? undefined,
    selectedHotelSnapshotId: snapshot.selectedHotelSnapshotId ?? undefined,
    calculatedAt: snapshot.calculatedAt.toISOString(),
    status: snapshot.status,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  }
}

export class TripBudgetSnapshotService {
  private readonly db: typeof prisma

  constructor(dependencies: TripBudgetSnapshotDependencies = {}) {
    this.db = dependencies.db ?? prisma
  }

  async getCurrent(tripId: string): Promise<TripBudgetSnapshotResponse | null> {
    const snapshot = await this.db.tripBudgetSnapshot.findFirst({
      where: { tripId, status: 'CURRENT' as TripBudgetSnapshotStatus },
      orderBy: { calculatedAt: 'desc' },
    })
    return snapshot ? serializeBudgetSnapshot(snapshot) : null
  }

  async createCurrent(input: {
    tripId: string
    budgetSummary: TripBudgetSummary
    selectedFlightSnapshotId?: string | null
    selectedHotelSnapshotId?: string | null
    status?: TripBudgetSnapshotStatus
  }): Promise<TripBudgetSnapshotResponse> {
    const snapshot = await this.db.$transaction(async (tx) => {
      await tx.tripBudgetSnapshot.updateMany({
        where: { tripId: input.tripId, status: 'CURRENT' as TripBudgetSnapshotStatus },
        data: { status: 'SUPERSEDED' as TripBudgetSnapshotStatus },
      })

      return tx.tripBudgetSnapshot.create({
        data: {
          tripId: input.tripId,
          currency: input.budgetSummary.currency,
          flight: toJson(input.budgetSummary.flight),
          accommodation: toJson(input.budgetSummary.accommodation),
          attractions: toJson(input.budgetSummary.attractions),
          food: toJson(input.budgetSummary.food),
          localTransport: toJson(input.budgetSummary.localTransport),
          contingency: toJson(input.budgetSummary.contingency),
          totalAmount: amountDecimal(input.budgetSummary.total.amount),
          perPersonAmount: amountDecimal(input.budgetSummary.total.perPersonAmount),
          assumptions: toJson(input.budgetSummary.assumptions),
          missingData: toJson(input.budgetSummary.missingData),
          selectedFlightSnapshotId: input.selectedFlightSnapshotId ?? undefined,
          selectedHotelSnapshotId: input.selectedHotelSnapshotId ?? undefined,
          calculatedAt: new Date(input.budgetSummary.calculatedAt),
          status: input.status ?? ('CURRENT' as TripBudgetSnapshotStatus),
        },
      })
    })

    return serializeBudgetSnapshot(snapshot)
  }
}
