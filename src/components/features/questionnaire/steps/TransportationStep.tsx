import type { QuestionnaireStepProps } from './types'

import { Chip } from '@/components/ui/Chip'
import { TRANSPORTATION_OPTIONS } from '@/constants/questionnaire'


export function TransportationStep({ answers, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">How do you prefer getting around?</h1>
        <p className="mt-2 text-neutral-700">Choose one preferred transportation mode.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TRANSPORTATION_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={answers.transportationPreference === option.value}
            onClick={() => updateAnswer('transportationPreference', option.value)}
          />
        ))}
      </div>
    </div>
  )
}