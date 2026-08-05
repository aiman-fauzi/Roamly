import { pathToFileURL } from 'node:url'

import { prisma } from '@/db/client'
import {
  DestinationQualityAuditService,
  type DestinationQualityAuditSummary,
} from '@/services/destinations/destinationQualityAudit'

interface DestinationAuditArgs {
  city: string
  json: boolean
}

function readOption(argv: string[], name: string): string | undefined {
  const inlinePrefix = `--${name}=`
  const inlineValue = argv.find((arg) => arg.startsWith(inlinePrefix))?.slice(inlinePrefix.length)
  if (inlineValue !== undefined) return inlineValue
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

function parseArgs(argv: string[]): DestinationAuditArgs {
  const city = readOption(argv, 'city')?.trim()
  if (!city) throw new Error('Pass --city=<city-name>.')
  return {
    city,
    json: argv.includes('--json'),
  }
}

function printText(summary: DestinationQualityAuditSummary) {
  console.warn('[destinations:audit] Destination quality audit')
  console.warn(`  city: ${summary.cityName} (${summary.cityId})`)
  console.warn(
    `  active entities: ATTRACTION=${summary.activeEntities.ATTRACTION}, RESTAURANT=${summary.activeEntities.RESTAURANT}, HOTEL=${summary.activeEntities.HOTEL}, ACTIVITY=${summary.activeEntities.ACTIVITY}`
  )
  console.warn(
    `  quarantined entities: ATTRACTION=${summary.quarantinedEntities.ATTRACTION}, RESTAURANT=${summary.quarantinedEntities.RESTAURANT}, HOTEL=${summary.quarantinedEntities.HOTEL}, ACTIVITY=${summary.quarantinedEntities.ACTIVITY}`
  )
  console.warn(
    `  verified opening-hours coverage: ${summary.verifiedOpeningHours}/${summary.totalActiveEntities} (${summary.verifiedOpeningHoursCoverage}%)`
  )
  console.warn(
    `  verified price coverage: ${summary.verifiedTicketPrices}/${summary.totalActiveEntities} (${summary.verifiedTicketPriceCoverage}%)`
  )
  console.warn(`  stale facts: ${summary.staleFacts}`)
  console.warn(`  conflicting facts: ${summary.conflictingFacts}`)
  console.warn(`  missing coordinates: ${summary.missingCoordinates}`)
  console.warn(`  missing source URLs: ${summary.missingSourceUrls}`)
  console.warn(`  possible duplicates: ${summary.possibleDuplicates}`)
  console.warn(
    `  Gemini-enriched coverage: ${summary.geminiEnriched}/${summary.totalActiveEntities} (${summary.geminiEnrichedCoverage}%)`
  )
}

export async function runDestinationAuditCli(
  argv: string[],
  options: { service?: Pick<DestinationQualityAuditService, 'auditCity'> } = {}
): Promise<number> {
  const args = parseArgs(argv)
  const service = options.service ?? new DestinationQualityAuditService(prisma)
  const summary = await service.auditCity(args.city)

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    printText(summary)
  }
  return 0
}

async function main() {
  const exitCode = await runDestinationAuditCli(process.argv.slice(2))
  process.exitCode = exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(() => {
      void prisma.$disconnect()
    })
}
