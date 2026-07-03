import type { QuestionnaireStepProps } from './types'

import { Chip } from '@/components/ui/Chip'
import { ACTIVITY_OPTIONS } from '@/constants/questionnaire'


function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function ActivitiesStep({ answers, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">What should fill your days?</h1>
        <p className="mt-2 text-neutral-700">Choose the activities you want Roamly to prioritize.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIVITY_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={answers.activityPreferences.includes(option.value)}
            onClick={() =>
              updateAnswer('activityPreferences', toggle(answers.activityPreferences, option.value))
            }
          />
        ))}
      </div>
    </div>
  )
}