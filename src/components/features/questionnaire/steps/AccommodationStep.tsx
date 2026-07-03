import type { QuestionnaireStepProps } from './types'

import { Chip } from '@/components/ui/Chip'
import { ACCOMMODATION_OPTIONS } from '@/constants/questionnaire'


function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function AccommodationStep({ answers, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">Where would you like to stay?</h1>
        <p className="mt-2 text-neutral-700">Select any accommodation styles that fit.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ACCOMMODATION_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={answers.accommodationType.includes(option.value)}
            onClick={() => updateAnswer('accommodationType', toggle(answers.accommodationType, option.value))}
          />
        ))}
      </div>
    </div>
  )
}