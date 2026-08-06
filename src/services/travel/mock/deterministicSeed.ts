export interface DeterministicRandom {
  next(): number
  int(min: number, max: number): number
  pick<T>(values: readonly T[]): T
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(',')}}`
}

export function deterministicSeed(input: unknown): number {
  const text = stableStringify(input)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createDeterministicRandom(input: unknown): DeterministicRandom {
  let state = deterministicSeed(input) || 1
  return {
    next() {
      state = Math.imul(1664525, state) + 1013904223
      return (state >>> 0) / 2 ** 32
    },
    int(min: number, max: number) {
      return Math.floor(this.next() * (max - min + 1)) + min
    },
    pick<T>(values: readonly T[]): T {
      return values[this.int(0, values.length - 1)]
    },
  }
}

export function deterministicOffset(input: unknown, min: number, max: number): number {
  return createDeterministicRandom(input).int(min, max)
}
