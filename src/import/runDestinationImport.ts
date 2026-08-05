import { pathToFileURL } from 'node:url'

import { prisma } from '@/db/client'
import { runDestinationImportCli } from '@/import/destinationImportRunner'

async function main() {
  const exitCode = await runDestinationImportCli(process.argv.slice(2))
  process.exitCode = exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => {
      void prisma.$disconnect()
    })
}
