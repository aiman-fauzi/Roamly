import { DestinationImportHttpClient } from '@/services/destinations/importPipeline/httpClient'
import type { LicensedImageAttribution } from '@/services/destinations/importPipeline/types'
import { assertDestinationSourceUsable } from '@/services/destinations/sources/sourceRegistry'

interface CommonsImageInfoPayload {
  query?: {
    pages?: Record<
      string,
      {
        title?: string
        imageinfo?: Array<{
          url?: string
          descriptionurl?: string
          extmetadata?: Record<string, { value?: string }>
        }>
      }
    >
    categorymembers?: Array<{ title?: string }>
  }
}

const FREE_LICENSE_TERMS = [
  'cc0',
  'cc by',
  'cc-by',
  'cc by-sa',
  'cc-by-sa',
  'public domain',
  'pd',
]

function stripHtml(value: string | undefined): string | null {
  if (!value) return null
  const stripped = value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return stripped || null
}

function isFreeLicense(value: string | null): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return FREE_LICENSE_TERMS.some((term) => normalized.includes(term))
}

function commonsApiUrl(params: Record<string, string>): string {
  const url = new URL(assertDestinationSourceUsable('wikimedia-commons').baseUrl)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  return url.toString()
}

function fileTitle(fileName: string): string {
  return fileName.startsWith('File:') ? fileName : `File:${fileName}`
}

function parseImageInfo(payload: string): LicensedImageAttribution | null {
  const parsed = JSON.parse(payload) as CommonsImageInfoPayload
  const page = Object.values(parsed.query?.pages ?? {})[0]
  const image = page?.imageinfo?.[0]
  if (!page?.title || !image?.url || !image.descriptionurl) return null

  const metadata = image.extmetadata ?? {}
  const author = stripHtml(metadata.Artist?.value ?? metadata.Credit?.value)
  const license = stripHtml(metadata.LicenseShortName?.value ?? metadata.License?.value)
  const licenseUrl = stripHtml(metadata.LicenseUrl?.value)
  const attribution = stripHtml(metadata.Attribution?.value ?? metadata.Credit?.value ?? metadata.Artist?.value)
  if (!author || !license || !licenseUrl || !attribution || !isFreeLicense(license)) return null

  return {
    imageUrl: image.url,
    imagePageUrl: image.descriptionurl,
    imageAuthor: author,
    imageLicense: license,
    imageLicenseUrl: licenseUrl,
    imageAttribution: attribution,
    sourceRecordId: page.title,
  }
}

function parseFirstCategoryFile(payload: string): string | null {
  const parsed = JSON.parse(payload) as CommonsImageInfoPayload
  const title = parsed.query?.categorymembers?.find((member) => member.title?.startsWith('File:'))?.title
  return title ?? null
}

export class WikimediaCommonsProvider {
  constructor(private readonly httpClient = new DestinationImportHttpClient()) {}

  async fetchLicensedImageByFileName(fileName: string): Promise<LicensedImageAttribution | null> {
    const response = await this.httpClient.get(
      'wikimedia-commons',
      commonsApiUrl({
        action: 'query',
        titles: fileTitle(fileName),
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
      }),
      { cacheTtlMs: 24 * 60 * 60 * 1000 }
    )
    return parseImageInfo(response.text)
  }

  async fetchFirstLicensedCategoryImage(category: string): Promise<LicensedImageAttribution | null> {
    const categoryTitle = category.startsWith('Category:') ? category : `Category:${category}`
    const categoryResponse = await this.httpClient.get(
      'wikimedia-commons',
      commonsApiUrl({
        action: 'query',
        list: 'categorymembers',
        cmtitle: categoryTitle,
        cmtype: 'file',
        cmlimit: '10',
      }),
      { cacheTtlMs: 24 * 60 * 60 * 1000 }
    )
    const firstFile = parseFirstCategoryFile(categoryResponse.text)
    return firstFile ? this.fetchLicensedImageByFileName(firstFile) : null
  }
}
