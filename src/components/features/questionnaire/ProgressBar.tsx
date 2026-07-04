import { TOTAL_STEPS } from '@/constants/questionnaire'

interface ProgressBarProps {
  currentStep: number
}

export function ProgressBar({ currentStep }: ProgressBarProps) {
  const percent = Math.round((currentStep / TOTAL_STEPS) * 100)

  return (
    <div className="space-y-2" aria-label="Questionnaire progress">
      <div className="flex items-center justify-between text-sm font-medium text-neutral-700">
        <span>
          Step {currentStep} of {TOTAL_STEPS}
        </span>
        <span>{percent}% complete</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Questionnaire completion"
        className="h-2.5 overflow-hidden rounded-full bg-neutral-200/90"
      >
        <div
          className="transition-ui h-full rounded-full bg-atlas-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
