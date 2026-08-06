import { MOCK_TRAVEL_NOTICE } from '@/services/travel/mock/phuQuocMockFixtures'

interface MockDataBadgeProps {
  label?: string
}

export function MockDataBadge({ label = 'Mock' }: MockDataBadgeProps) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-normal text-amber-800"
      title={MOCK_TRAVEL_NOTICE}
    >
      {label}
    </span>
  )
}

export function MockDataNotice() {
  return <p className="text-sm font-medium text-amber-800">{MOCK_TRAVEL_NOTICE}</p>
}
