import type { QuestionnaireStepProps } from './types'

import { Input } from '@/components/ui/Input'


export function DestinationStep({ answers, error, updateAnswer }: QuestionnaireStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-heading text-neutral-900">Where are you headed?</h1>
        <p className="mt-2 text-neutral-700">Name a city, region, or country.</p>
      </div>
      <Input
        label="Destination"
        value={answers.destination}
        onChange={(event) => updateAnswer('destination', event.target.value)}
        error={error}
        placeholder="Kyoto, Japan"
        autoComplete="off"
      />
    </div>
  )
}