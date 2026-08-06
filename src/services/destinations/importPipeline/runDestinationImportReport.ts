import { pathToFileURL } from 'node:url'

import { prisma } from '@/db/client'

function readOption(argv: string[], name: string): string | undefined {
  const inlinePrefix = `--${name}=`
  const inline = argv.find((arg) => arg.startsWith(inlinePrefix))?.slice(inlinePrefix.length)
  if (inline !== undefined) return inline
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

export async function runDestinationImportReportCli(argv: string[]): Promise<number> {
  const jobId = readOption(argv, 'job-id')
  if (!jobId) throw new Error('Pass --job-id=<job-id>.')

  const job = await prisma.destinationImportJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error(`Destination import job not found: ${jobId}`)
  console.log(JSON.stringify(job, null, 2))
  return 0
}

async function main() {
  const exitCode = await runDestinationImportReportCli(process.argv.slice(2))
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
