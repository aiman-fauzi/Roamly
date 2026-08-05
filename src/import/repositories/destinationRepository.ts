import type { City, Country, Prisma, PrismaClient } from '@prisma/client'

import { slugify } from '@/import/normalization'
import type { ImportRecordResult, NormalizedDestinationRecord } from '@/import/types'

interface IdReference {
  id: string
}

type DestinationTransactionClient = Prisma.TransactionClient

export class DestinationRepository {
  constructor(private readonly db: PrismaClient) {}

  async importRecord(record: NormalizedDestinationRecord): Promise<ImportRecordResult> {
    return this.db.$transaction((tx) => this.importRecordInTransaction(tx, record))
  }

  private async importRecordInTransaction(
    db: DestinationTransactionClient,
    record: NormalizedDestinationRecord
  ): Promise<ImportRecordResult> {
    const city = await this.matchOrCreateCity(db, record)
    if (!city) return { status: 'skipped', reason: 'No matching city' }

    const tags = await this.resolveTagConnections(db, record.tags)

    switch (record.kind) {
      case 'ATTRACTION':
        return this.upsertAttraction(db, city.id, record, tags)
      case 'RESTAURANT':
        return this.upsertRestaurant(db, city.id, record, tags)
      case 'HOTEL':
        return this.upsertHotel(db, city.id, record, tags)
      case 'ACTIVITY':
        return this.upsertActivity(db, city.id, record, tags)
    }
  }

  private async matchOrCreateCity(
    db: DestinationTransactionClient,
    record: NormalizedDestinationRecord
  ): Promise<City | null> {
    if (record.citySlug && record.countrySlug) {
      const city = await db.city.findFirst({
        where: {
          slug: record.citySlug,
          deletedAt: null,
          country: {
            slug: record.countrySlug,
            deletedAt: null,
          },
        },
      })
      if (city) return city
    }

    if (record.citySlug) {
      const city = await db.city.findFirst({
        where: {
          slug: record.citySlug,
          deletedAt: null,
        },
      })
      if (city) return city
    }

    if (record.cityName) {
      const city = await db.city.findFirst({
        where: {
          name: {
            equals: record.cityName,
            mode: 'insensitive',
          },
          deletedAt: null,
          country: record.countryCode
            ? {
                iso2: record.countryCode,
              }
            : undefined,
        },
      })
      if (city) return city
    }

    return this.createCityFromImportContext(db, record)
  }

  private async createCityFromImportContext(
    db: DestinationTransactionClient,
    record: NormalizedDestinationRecord
  ): Promise<City | null> {
    const citySlug = record.citySlug
    const cityName = record.cityName
    if (!citySlug || !cityName) return null

    const country = await this.resolveOrCreateCountry(db, record)
    if (!country) return null

    return db.city.upsert({
      where: {
        countryId_slug: {
          countryId: country.id,
          slug: citySlug.slice(0, 180),
        },
      },
      update: {
        deletedAt: null,
      },
      create: {
        countryId: country.id,
        name: cityName.slice(0, 160),
        slug: citySlug.slice(0, 180),
      },
    })
  }

  private async resolveOrCreateCountry(
    db: DestinationTransactionClient,
    record: NormalizedDestinationRecord
  ): Promise<Country | null> {
    if (record.countrySlug) {
      const country = await db.country.findFirst({
        where: {
          slug: record.countrySlug,
          deletedAt: null,
        },
      })
      if (country) return country
    }

    if (record.countryCode) {
      const country = await db.country.findFirst({
        where: {
          iso2: record.countryCode,
          deletedAt: null,
        },
      })
      if (country) return country
    }

    const countryName = record.countryName
    const countrySlug = record.countrySlug
    const countryCode = record.countryCode
    if (!countryName || !countrySlug || !countryCode || countryCode.length !== 2) return null

    return db.country.upsert({
      where: { slug: countrySlug.slice(0, 140) },
      update: {
        deletedAt: null,
      },
      create: {
        name: countryName.slice(0, 120),
        slug: countrySlug.slice(0, 140),
        iso2: countryCode,
        iso3: record.countryIso3?.length === 3 ? record.countryIso3 : undefined,
        currencyCode: record.currencyCode?.length === 3 ? record.currencyCode : undefined,
        phoneCode: record.phoneCode?.slice(0, 20),
      },
    })
  }

  private async resolveTagConnections(
    db: DestinationTransactionClient,
    tags: string[]
  ): Promise<IdReference[]> {
    const connections: IdReference[] = []
    const uniqueTags = [...new Set(tags)].slice(0, 20)

    for (const tag of uniqueTags) {
      const slug = slugify(tag).slice(0, 120)
      if (!slug) continue
      const destinationTag = await db.destinationTag.upsert({
        where: { slug },
        update: { name: tag.slice(0, 100) },
        create: {
          name: tag.slice(0, 100),
          slug,
        },
        select: { id: true },
      })
      connections.push(destinationTag)
    }

    return connections
  }

  private async upsertAttraction(
    db: DestinationTransactionClient,
    cityId: string,
    record: NormalizedDestinationRecord,
    tags: IdReference[]
  ): Promise<ImportRecordResult> {
    const existing = await db.attraction.findUnique({
      where: { cityId_slug: { cityId, slug: record.slug } },
      select: { id: true },
    })

    const destination = await db.attraction.upsert({
      where: { cityId_slug: { cityId, slug: record.slug } },
      update: {
        name: record.name,
        description: record.description,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        priceLevel: record.priceLevel,
        durationMinutes: record.durationMinutes,
        deletedAt: null,
        tags: tags.length > 0 ? { set: tags } : undefined,
      },
      create: {
        cityId,
        name: record.name,
        slug: record.slug,
        description: record.description,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        priceLevel: record.priceLevel,
        durationMinutes: record.durationMinutes,
        tags: tags.length > 0 ? { connect: tags } : undefined,
      },
      select: { id: true },
    })

    await this.attachAttractionMetadata(db, destination.id, record)
    return { status: existing ? 'updated' : 'created' }
  }

  private async upsertRestaurant(
    db: DestinationTransactionClient,
    cityId: string,
    record: NormalizedDestinationRecord,
    tags: IdReference[]
  ): Promise<ImportRecordResult> {
    const existing = await db.restaurant.findUnique({
      where: { cityId_slug: { cityId, slug: record.slug } },
      select: { id: true },
    })

    const destination = await db.restaurant.upsert({
      where: { cityId_slug: { cityId, slug: record.slug } },
      update: {
        name: record.name,
        description: record.description,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        cuisines: record.cuisines,
        priceLevel: record.priceLevel,
        deletedAt: null,
        tags: tags.length > 0 ? { set: tags } : undefined,
      },
      create: {
        cityId,
        name: record.name,
        slug: record.slug,
        description: record.description,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        cuisines: record.cuisines,
        priceLevel: record.priceLevel,
        tags: tags.length > 0 ? { connect: tags } : undefined,
      },
      select: { id: true },
    })

    await this.attachRestaurantMetadata(db, destination.id, record)
    return { status: existing ? 'updated' : 'created' }
  }

  private async upsertHotel(
    db: DestinationTransactionClient,
    cityId: string,
    record: NormalizedDestinationRecord,
    tags: IdReference[]
  ): Promise<ImportRecordResult> {
    const existing = await db.hotel.findUnique({
      where: { cityId_slug: { cityId, slug: record.slug } },
      select: { id: true },
    })

    const destination = await db.hotel.upsert({
      where: { cityId_slug: { cityId, slug: record.slug } },
      update: {
        name: record.name,
        description: record.description,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        amenities: record.amenities,
        deletedAt: null,
        tags: tags.length > 0 ? { set: tags } : undefined,
      },
      create: {
        cityId,
        name: record.name,
        slug: record.slug,
        description: record.description,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        amenities: record.amenities,
        tags: tags.length > 0 ? { connect: tags } : undefined,
      },
      select: { id: true },
    })

    await this.attachHotelMetadata(db, destination.id, record)
    return { status: existing ? 'updated' : 'created' }
  }

  private async upsertActivity(
    db: DestinationTransactionClient,
    cityId: string,
    record: NormalizedDestinationRecord,
    tags: IdReference[]
  ): Promise<ImportRecordResult> {
    const existing = await db.activity.findUnique({
      where: { cityId_slug: { cityId, slug: record.slug } },
      select: { id: true },
    })

    const destination = await db.activity.upsert({
      where: { cityId_slug: { cityId, slug: record.slug } },
      update: {
        name: record.name,
        description: record.description,
        category: record.category,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        priceLevel: record.priceLevel,
        durationMinutes: record.durationMinutes,
        deletedAt: null,
        tags: tags.length > 0 ? { set: tags } : undefined,
      },
      create: {
        cityId,
        name: record.name,
        slug: record.slug,
        description: record.description,
        category: record.category,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        websiteUrl: record.websiteUrl,
        phone: record.phone,
        priceLevel: record.priceLevel,
        durationMinutes: record.durationMinutes,
        tags: tags.length > 0 ? { connect: tags } : undefined,
      },
      select: { id: true },
    })

    await this.attachActivityMetadata(db, destination.id, record)
    return { status: existing ? 'updated' : 'created' }
  }

  private async attachAttractionMetadata(
    db: DestinationTransactionClient,
    id: string,
    record: NormalizedDestinationRecord
  ) {
    await Promise.all([
      this.attachImages(db, record, { attractionId: id }),
      this.attachOpeningHours(db, record, { attractionId: id }),
    ])
  }

  private async attachRestaurantMetadata(
    db: DestinationTransactionClient,
    id: string,
    record: NormalizedDestinationRecord
  ) {
    await Promise.all([
      this.attachImages(db, record, { restaurantId: id }),
      this.attachOpeningHours(db, record, { restaurantId: id }),
    ])
  }

  private async attachHotelMetadata(
    db: DestinationTransactionClient,
    id: string,
    record: NormalizedDestinationRecord
  ) {
    await Promise.all([
      this.attachImages(db, record, { hotelId: id }),
      this.attachOpeningHours(db, record, { hotelId: id }),
    ])
  }

  private async attachActivityMetadata(
    db: DestinationTransactionClient,
    id: string,
    record: NormalizedDestinationRecord
  ) {
    await Promise.all([
      this.attachImages(db, record, { activityId: id }),
      this.attachOpeningHours(db, record, { activityId: id }),
    ])
  }

  private async attachImages(
    db: DestinationTransactionClient,
    record: NormalizedDestinationRecord,
    parent: { attractionId?: string; restaurantId?: string; hotelId?: string; activityId?: string }
  ) {
    if (record.images.length === 0) return

    const existingCount = await db.destinationImage.count({ where: parent })
    if (existingCount > 0) return

    await db.destinationImage.createMany({
      data: record.images.map((image, index) => ({
        ...parent,
        url: image.url,
        altText: image.altText,
        caption: image.caption,
        attribution: image.attribution,
        isPrimary: image.isPrimary,
        sortOrder: index,
      })),
    })
  }

  private async attachOpeningHours(
    db: DestinationTransactionClient,
    record: NormalizedDestinationRecord,
    parent: { attractionId?: string; restaurantId?: string; hotelId?: string; activityId?: string }
  ) {
    const hours = record.openingHours.filter((hour) => {
      if (hour.isClosed) return !hour.opensAt && !hour.closesAt
      return Boolean(hour.opensAt && hour.closesAt)
    })

    if (hours.length === 0) return

    const existingCount = await db.openingHour.count({ where: parent })
    if (existingCount > 0) return

    await db.openingHour.createMany({
      data: hours.map((hour) => ({
        ...parent,
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        isClosed: hour.isClosed,
        note: hour.note,
      })),
    })
  }
}
