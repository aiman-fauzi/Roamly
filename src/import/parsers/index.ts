import { DestinationImportSource } from '@prisma/client'


import { GovernmentTourismParser } from './governmentTourismParser'
import { MediaWikiParser } from './mediaWikiParser'
import { OpenStreetMapParser } from './openStreetMapParser'

import type { DestinationParser } from '@/import/types'

export function createParser(source: DestinationImportSource): DestinationParser {
  switch (source) {
    case DestinationImportSource.OPENSTREETMAP:
      return new OpenStreetMapParser()
    case DestinationImportSource.WIKIVOYAGE:
    case DestinationImportSource.WIKIPEDIA:
      return new MediaWikiParser()
    case DestinationImportSource.GOVERNMENT_TOURISM:
      return new GovernmentTourismParser()
  }
}
