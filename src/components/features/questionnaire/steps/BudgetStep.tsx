import type { QuestionnaireStepProps } from './types'

import { Slider } from '@/components/ui/Slider'
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP } from '@/constants/questionnaire'
import { formatCurrency } from '@/utils/formatCurrency'


export function BudgetStep({ answers, error, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">What budget should we plan around?</h1>
        <p className="mt-2 text-neutral-700">Use your total trip budget in USD.</p>
      </div>
      <Slider
        label="Budget"
        value={answers.budget}
        min={BUDGET_MIN}
        max={BUDGET_MAX}
        step={BUDGET_STEP}
        formatValue={(value) => formatCurrency(value)}
        onChange={(value) => updateAnswer('budget', value)}
      />
      {error && <p role="alert" className="text-sm text-error-500">{error}</p>}
    </div>
  )
}