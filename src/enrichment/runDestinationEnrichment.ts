import { prisma } from '@/db/client'
import { DestinationEnrichmentService } from '@/services/enrichment/destinationEnrichmentService'

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function readBatchSize(): number | undefined {
  const value = readArg('batchSize')
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Pass --batchSize as a positive integer')
  }
  return parsed
}

async function main() {
  const summary = await new DestinationEnrichmentService().runBackgroundJob({
    sourceKey: readArg('sourceKey'),
    batchSize: readBatchSize(),
  })

  console.warn('Destination enrichment job finished', summary)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
