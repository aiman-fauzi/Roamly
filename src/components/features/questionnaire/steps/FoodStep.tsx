import type { QuestionnaireStepProps } from './types'

import { Chip } from '@/components/ui/Chip'
import { FOOD_OPTIONS } from '@/constants/questionnaire'


function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

export function FoodStep({ answers, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">What food preferences matter?</h1>
        <p className="mt-2 text-neutral-700">Pick any cuisines or dietary needs to consider.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FOOD_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={answers.foodPreferences.includes(option.value)}
            onClick={() => updateAnswer('foodPreferences', toggle(answers.foodPreferences, option.value))}
          />
        ))}
      </div>
    </div>
  )
}