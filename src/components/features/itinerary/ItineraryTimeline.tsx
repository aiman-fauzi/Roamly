import type { RoadmapDay, RoadmapItemKind } from '@/types/itinerary'

interface ItineraryTimelineProps {
  roadmap: RoadmapDay[]
}

const KIND_SYMBOLS: Record<RoadmapItemKind, string> = {
  hotel: 'H',
  food: 'F',
  transport: 'T',
  activity: 'A',
  shopping: 'S',
  nightlife: 'N',
  other: 'O',
}

export function ItineraryTimeline({ roadmap }: ItineraryTimelineProps) {
  if (roadmap.length === 0) return null

  return (
    <section className="rounded-card bg-white p-card-pad shadow-card">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Roadmap</p>
        <h2 className="mt-1 text-xl font-semibold text-neutral-900">Travel timeline</h2>
      </div>

      <div className="mt-5 space-y-6">
        {roadmap.map((day) => (
          <div key={day.dayNumber}>
            <h3 className="text-sm font-semibold text-neutral-900">Day {day.dayNumber}</h3>
            <ol className="mt-3 space-y-3 border-l border-neutral-200 pl-4">
              {day.items.map((item, index) => (
                <li key={`${day.dayNumber}-${item.label}-${index}`} className="relative">
                  <span className="absolute -left-[1.62rem] flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">
                    {KIND_SYMBOLS[item.kind]}
                  </span>
                  <div className="rounded-md bg-neutral-50 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold text-neutral-900">{item.label}</span>
                      {item.time && <span className="text-sm text-neutral-700">{item.time}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
