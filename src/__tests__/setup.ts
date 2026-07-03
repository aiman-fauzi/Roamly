import '@testing-library/jest-dom'

// Silence console.log in tests; allow warn and error (used by seed script + services)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- global mock requires any
;(globalThis as any).console = {
  ...console,
  log: () => {},
}
