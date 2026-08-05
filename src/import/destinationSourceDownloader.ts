import type { ImportSourceConfig } from '@/import/types'

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export class DestinationSourceDownloader {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async download(config: ImportSourceConfig): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs ?? 30000)

    try {
      const response = await this.fetcher(config.url, {
        headers: {
          Accept: 'application/json, text/csv, application/geo+json, */*',
          'User-Agent': 'RoamlyDestinationImporter/1.0',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Destination source download failed with HTTP ${response.status}`)
      }

      return response.text()
    } finally {
      clearTimeout(timeout)
    }
  }
}
