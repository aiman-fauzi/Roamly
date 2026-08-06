import { readFile } from 'node:fs/promises'

import { parseOperationMetrics, summarizeTravelMetrics } from './travelSummary'

function inputPath(args: string[]): string {
  const inline = args.find((arg) => arg.startsWith('--input='))?.slice('--input='.length)
  const index = args.indexOf('--input')
  const separate = index >= 0 ? args[index + 1] : undefined
  const value = inline || separate
  if (!value) throw new Error('Usage: npm run observability:travel-summary -- --input=<log-jsonl>')
  return value
}

async function main() {
  const input = await readFile(inputPath(process.argv.slice(2)), 'utf8')
  const summary = summarizeTravelMetrics(parseOperationMetrics(input))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
