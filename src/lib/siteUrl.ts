import { ROUTES } from '@/constants/routes'

const PRODUCTION_SITE_URL = 'https://roamly-lemon.vercel.app/'
const DEVELOPMENT_SITE_URL = 'http://localhost:3000'

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, '')
}

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL
  const siteUrl =
    configuredUrl ??
    (process.env.NODE_ENV === 'development'
      ? process.env.NEXT_PUBLIC_APP_URL ?? DEVELOPMENT_SITE_URL
      : PRODUCTION_SITE_URL)

  return trimTrailingSlash(siteUrl)
}

export function getAuthCallbackUrl() {
  return `${getSiteUrl()}${ROUTES.AUTH_CALLBACK}`
}