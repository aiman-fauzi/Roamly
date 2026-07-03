import type { QuestionnaireStepProps } from './types'

import { Stepper } from '@/components/ui/Stepper'
import { GROUP_SIZE_MAX, GROUP_SIZE_MIN } from '@/constants/questionnaire'


export function GroupSizeStep({ answers, error, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">How many people are going?</h1>
        <p className="mt-2 text-neutral-700">Include yourself in the group size.</p>
      </div>
      <Stepper
        label="Group size"
        value={answers.groupSize}
        min={GROUP_SIZE_MIN}
        max={GROUP_SIZE_MAX}
        onChange={(value) => updateAnswer('groupSize', value)}
      />
      {error && <p role="alert" className="text-sm text-error-500">{error}</p>}
    </div>
  )
}