import { prisma } from '@/db/client'

export class UserServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'UserServiceError'
  }
}

export async function ensureUser(userId: string, email: string | null | undefined) {
  if (!email) {
    throw new UserServiceError('MISSING_EMAIL', 'Authenticated user is missing an email address.')
  }

  return prisma.user.upsert({
    where: { id: userId },
    update: { email },
    create: { id: userId, email },
  })
}