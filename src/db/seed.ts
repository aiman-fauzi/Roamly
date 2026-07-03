/**
 * Database seed script — development convenience only.
 * Run with: npm run db:seed
 *
 * Creates a single test user with a profile and one draft trip.
 * Safe to run multiple times (idempotent via upsert).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.warn('🌱 Seeding database...')

  const user = await prisma.user.upsert({
    where: { email: 'dev@roamly.app' },
    update: {},
    create: {
      email: 'dev@roamly.app',
      profile: {
        create: {
          displayName: 'Dev User',
          avatarUrl: null,
        },
      },
    },
  })

  console.warn(`✅ Seed user created: ${user.email} (id: ${user.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })

