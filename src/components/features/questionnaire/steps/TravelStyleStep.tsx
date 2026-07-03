import type { QuestionnaireStepProps } from './types'

import { Chip } from '@/components/ui/Chip'
import { TRAVEL_STYLE_OPTIONS } from '@/constants/questionnaire'

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function TravelStyleStep({ answers, error, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">What kind of trip should this feel like?</h1>
        <p className="mt-2 text-neutral-700">Choose any styles that should guide the itinerary.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TRAVEL_STYLE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={answers.travelStyles.includes(option.value)}
            onClick={() => updateAnswer('travelStyles', toggle(answers.travelStyles, option.value))}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-error-500">
          {error}
        </p>
      )}
    </div>
  )
}