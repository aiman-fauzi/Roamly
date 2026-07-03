export function formatCurrency(amount: number, currency = 'USD', compact = false): string {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(amount)

  return `${currency} ${formatted}`
}