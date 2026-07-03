import type { QuestionnaireStepProps } from './types'

import { Stepper } from '@/components/ui/Stepper'
import { DURATION_MAX, DURATION_MIN } from '@/constants/questionnaire'


export function DurationStep({ answers, error, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">How many days are you traveling?</h1>
        <p className="mt-2 text-neutral-700">Roamly will create one plan for each day.</p>
      </div>
      <Stepper
        label="Trip duration"
        value={answers.durationDays}
        min={DURATION_MIN}
        max={DURATION_MAX}
        onChange={(value) => updateAnswer('durationDays', value)}
      />
      {error && <p role="alert" className="text-sm text-error-500">{error}</p>}
    </div>
  )
}