import { DestinationImportSource } from '@prisma/client'

import { asNumber, asRecordArray, asString, isRecord, parseJsonObject } from './helpers'

import { slugify } from '@/import/normalization'
import type { DestinationKind, DestinationParser, ImportSourceConfig, RawDestinationRecord } from '@/import/types'


function readPages(data: unknown): Array<Record<string, unknown>> {
  if (!isRecord(data) || !isRecord(data.query)) return []
  const geosearch = asRecordArray(data.query.geosearch)
  if (geosearch.length > 0) return geosearch

  if (isRecord(data.query.pages)) return Object.values(data.query.pages).filter(isRecord)
  return []
}

function readRevisionContent(page: Record<string, unknown>): string | undefined {
  const revisions = asRecordArray(page.revisions)
  const revision = revisions[0]
  if (!revision) return undefined
  if (isRecord(revision.slots) && isRecord(revision.slots.main)) {
    return asString(revision.slots.main['*']) ?? asString(revision.slots.main.content)
  }
  return asString(revision['*']) ?? asString(revision.content)
}

function splitTemplateFields(template: string): string[] {
  const fields: string[] = []
  let current = ''
  let linkDepth = 0
  let templateDepth = 0

  for (let index = 0; index < template.length; index += 1) {
    const pair = template.slice(index, index + 2)
    if (pair === '[[') {
      linkDepth += 1
      current += pair
      index += 1
    } else if (pair === ']]') {
      linkDepth = Math.max(0, linkDepth - 1)
      current += pair
      index += 1
    } else if (pair === '{{') {
      templateDepth += 1
      current += pair
      index += 1
    } else if (pair === '}}') {
      templateDepth = Math.max(0, templateDepth - 1)
      current += pair
      index += 1
    } else if (template[index] === '|' && linkDepth === 0 && templateDepth === 0) {
      fields.push(current.trim())
      current = ''
    } else {
      current += template[index]
    }
  }

  fields.push(current.trim())
  return fields
}

interface ExtractedTemplate {
  content: string
  start: number
}

function extractTemplates(content: string): ExtractedTemplate[] {
  const templates: ExtractedTemplate[] = []
  let depth = 0
  let start = -1

  for (let index = 0; index < content.length - 1; index += 1) {
    const pair = content.slice(index, index + 2)
    if (pair === '{{') {
      if (depth === 0) start = index + 2
      depth += 1
      index += 1
    } else if (pair === '}}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        templates.push({ content: content.slice(start, index), start: start - 2 })
        start = -1
      }
      index += 1
    }
  }

  return templates
}

function parseTemplate(template: string): { name: string; fields: Record<string, string> } {
  const [templateName, ...fields] = splitTemplateFields(template)
  const parsed: Record<string, string> = {}
  for (const field of fields) {
    const separator = field.indexOf('=')
    if (separator < 0) continue
    const key = field.slice(0, separator).trim().toLowerCase()
    const value = field.slice(separator + 1).trim()
    if (key && value) parsed[key] = value
  }

  return { name: templateName.trim().toLowerCase(), fields: parsed }
}

function readSectionForIndex(content: string, index: number): string | undefined {
  const before = content.slice(0, index)
  const headings = [...before.matchAll(/^==+\s*([^=\n]+?)\s*==+\s*$/gm)]
  return headings.at(-1)?.[1]?.trim().toLowerCase()
}

function cleanWikiText(value: string | undefined): string | undefined {
  if (!value) return undefined
  const cleaned = value
    .replace(/<!--.*?-->/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^{}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || undefined
}

function listingKind(
  templateName: string,
  fields: Record<string, string>,
  section: string | undefined
): DestinationKind | undefined {
  const type = (fields.type ?? (templateName === 'listing' ? section : templateName) ?? '').trim().toLowerCase()
  if (type === 'see') return 'ATTRACTION'
  if (type === 'do') return 'ACTIVITY'
  if (type === 'eat') return 'RESTAURANT'
  if (type === 'sleep') return 'HOTEL'
  return undefined
}

function readKind(page: Record<string, unknown>, fallback: DestinationKind | undefined): DestinationKind {
  const title = asString(page.title)?.toLowerCase() ?? ''
  const type = asString(page.type)?.toLowerCase() ?? ''
  if (title.includes('hotel') || type.includes('hotel')) return 'HOTEL'
  if (title.includes('restaurant') || type.includes('restaurant')) return 'RESTAURANT'
  return fallback ?? 'ATTRACTION'
}

function readCoordinates(page: Record<string, unknown>): { latitude?: number; longitude?: number } {
  const latitude = asNumber(page.lat)
  const longitude = asNumber(page.lon ?? page.lng)
  if (latitude !== undefined && longitude !== undefined) return { latitude, longitude }

  const coordinates = asRecordArray(page.coordinates)[0]
  return {
    latitude: coordinates ? asNumber(coordinates.lat) : undefined,
    longitude: coordinates ? asNumber(coordinates.lon) : undefined,
  }
}

function readArticleUrl(source: DestinationImportSource, title: string): string {
  const domain = source === DestinationImportSource.WIKIVOYAGE ? 'en.wikivoyage.org' : 'en.wikipedia.org'
  return `https://${domain}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

function readWikivoyageListings(data: unknown, config: ImportSourceConfig): RawDestinationRecord[] {
  if (config.source !== DestinationImportSource.WIKIVOYAGE || !isRecord(data) || !isRecord(data.query)) {
    return []
  }

  const requestedTitle = config.cityName?.toLowerCase()
  const pages = isRecord(data.query.pages)
    ? Object.values(data.query.pages)
        .filter(isRecord)
        .filter((page) => {
          const title = asString(page.title)?.toLowerCase()
          if (!title || !requestedTitle) return true
          return title === requestedTitle || title.startsWith(`${requestedTitle}/`)
        })
    : []

  return pages.flatMap((page) => {
    const articleTitle = asString(page.title) ?? config.cityName ?? 'Wikivoyage'
    const sourceUrl = readArticleUrl(config.source, articleTitle)
    const content = readRevisionContent(page)
    if (!content) return []

    return extractTemplates(content).flatMap((template, index) => {
      const parsed = parseTemplate(template.content)
      const section = readSectionForIndex(content, template.start)
      const kind = listingKind(parsed.name, parsed.fields, section)
      if (!kind) return []

      const name = cleanWikiText(parsed.fields.name ?? parsed.fields.alt)
      const latitude = asNumber(parsed.fields.lat ?? parsed.fields.latitude)
      const longitude = asNumber(parsed.fields.long ?? parsed.fields.lon ?? parsed.fields.lng ?? parsed.fields.longitude)
      if (!name) return []

      const listingType = (parsed.fields.type ?? (parsed.name === 'listing' ? section : parsed.name) ?? '')
        .trim()
        .toLowerCase()

      return [
        {
          source: config.source,
          sourceId: `wikivoyage:${slugify(articleTitle)}:${listingType}:${slugify(name)}:${index}`,
          name,
          kind,
          description: cleanWikiText(parsed.fields.content ?? parsed.fields.description),
          address: cleanWikiText(parsed.fields.address),
          latitude,
          longitude,
          cityName: config.cityName,
          citySlug: config.citySlug,
          countryName: config.countryName,
          countryCode: config.countryCode,
          countrySlug: config.countrySlug,
          countryIso3: config.countryIso3,
          currencyCode: config.currencyCode,
          phoneCode: config.phoneCode,
          sourceUrl,
          websiteUrl: cleanWikiText(parsed.fields.url) ?? sourceUrl,
          phone: cleanWikiText(parsed.fields.phone),
          category: listingType,
          tags: ['wikivoyage:listing', `wikivoyage:${listingType}`],
          raw: parsed.fields,
        },
      ]
    })
  })
}

export class MediaWikiParser implements DestinationParser {
  parse(payload: string, config: ImportSourceConfig): RawDestinationRecord[] {
    const data = parseJsonObject(payload)
    const listings = readWikivoyageListings(data, config)
    if (listings.length > 0) return listings

    return readPages(data).flatMap((page) => {
      const title = asString(page.title)
      const pageId = asString(page.pageid) ?? asString(page.id) ?? (title ? slugify(title) : undefined)
      const coordinates = readCoordinates(page)
      if (!title || !pageId) return []

      return [
        {
          source: config.source,
          sourceId: `${config.source.toLowerCase()}:${pageId}`,
          name: title,
          kind: readKind(page, config.defaultKind),
          description: asString(page.extract) ?? asString(page.snippet),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          cityName: config.cityName,
          citySlug: config.citySlug,
          countryName: config.countryName,
          countryCode: config.countryCode,
          countrySlug: config.countrySlug,
          countryIso3: config.countryIso3,
          currencyCode: config.currencyCode,
          phoneCode: config.phoneCode,
          sourceUrl: readArticleUrl(config.source, title),
          websiteUrl: readArticleUrl(config.source, title),
          category: asString(page.type),
          tags: [config.source.toLowerCase(), asString(page.type)].filter(
            (tag): tag is string => Boolean(tag)
          ),
          raw: page,
        },
      ]
    })
  }
}
