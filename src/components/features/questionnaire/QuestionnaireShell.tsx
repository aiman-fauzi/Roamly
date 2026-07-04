'use client'

import { useRouter } from 'next/navigation'

import { ProgressBar } from '@/components/features/questionnaire/ProgressBar'
import { AccommodationStep } from '@/components/features/questionnaire/steps/AccommodationStep'
import { ActivitiesStep } from '@/components/features/questionnaire/steps/ActivitiesStep'
import { BudgetStep } from '@/components/features/questionnaire/steps/BudgetStep'
import { DestinationStep } from '@/components/features/questionnaire/steps/DestinationStep'
import { DurationStep } from '@/components/features/questionnaire/steps/DurationStep'
import { FoodStep } from '@/components/features/questionnaire/steps/FoodStep'
import { GroupSizeStep } from '@/components/features/questionnaire/steps/GroupSizeStep'
import { TransportationStep } from '@/components/features/questionnaire/steps/TransportationStep'
import { TravelStyleStep } from '@/components/features/questionnaire/steps/TravelStyleStep'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { API } from '@/constants/api'
import { TOTAL_STEPS } from '@/constants/questionnaire'
import { ROUTES } from '@/constants/routes'
import { useQuestionnaire } from '@/hooks/useQuestionnaire'
import type { ApiErrorResponse } from '@/types/api'

interface QuestionnaireShellProps {
  tripId: string
}

const generationSteps = ['Finding attractions', 'Optimising route', 'Estimating costs', 'Finalising itinerary']

export function QuestionnaireShell({ tripId }: QuestionnaireShellProps) {
  const router = useRouter()
  const toast = useToast()
  const questionnaire = useQuestionnaire(tripId)
  const {
    answers,
    currentStep,
    getPreferenceInput,
    goBack,
    goNext,
    isSubmitting,
    setIsSubmitting,
    setSubmitError,
    stepErrors,
    submitError,
    updateAnswer,
    validateAll,
  } = questionnaire

  async function readError(response: Response, fallback: string): Promise<string> {
    try {
      const data = (await response.json()) as ApiErrorResponse
      const reason =
        data.details && typeof data.details === 'object' && 'reason' in data.details
          ? String((data.details as { reason?: unknown }).reason)
          : null
      const baseMessage = data.error ?? fallback
      return reason ? `${baseMessage}: ${reason}` : baseMessage
    } catch {
      return fallback
    }
  }

  async function submit() {
    setSubmitError(null)
    if (!validateAll()) return

    setIsSubmitting(true)
    try {
      const preferenceResponse = await fetch(API.tripPreferences(tripId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getPreferenceInput()),
      })

      if (!preferenceResponse.ok) {
        const message = await readError(preferenceResponse, 'Unable to save preferences.')
        setSubmitError(message)
        toast.error('Unable to save preferences.', 'Please try again.')
        return
      }

      toast.success('Preferences saved.')

      const generateResponse = await fetch(API.tripGenerate(tripId), { method: 'POST' })
      if (!generateResponse.ok) {
        const message = await readError(generateResponse, 'Unable to generate itinerary.')
        setSubmitError(message)
        toast.error('Unable to generate itinerary.', message)
        return
      }

      toast.success('Itinerary generated.', 'Your travel plan is ready.')
      router.push(ROUTES.tripItinerary(tripId))
      router.refresh()
    } catch {
      setSubmitError('Network error. Please try again.')
      toast.error('Unable to save changes.', 'Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handlePrimaryAction() {
    if (currentStep < TOTAL_STEPS) {
      goNext()
      return
    }

    void submit()
  }

  const stepProps = {
    answers,
    error: stepErrors[currentStep],
    updateAnswer,
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="surface-panel overflow-hidden p-5 sm:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-atlas-700">Trip questionnaire</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">Shape your itinerary</h1>
          </div>
          <p className="text-sm font-medium text-neutral-700" aria-live="polite">
            Saved locally
          </p>
        </div>

        <ProgressBar currentStep={currentStep} />

        <div className="mt-8 min-h-[360px] rounded-[1.25rem] border border-neutral-200/70 bg-white/60 p-4 sm:p-6">
          {currentStep === 1 && <DestinationStep {...stepProps} />}
          {currentStep === 2 && <BudgetStep {...stepProps} />}
          {currentStep === 3 && <DurationStep {...stepProps} />}
          {currentStep === 4 && <GroupSizeStep {...stepProps} />}
          {currentStep === 5 && <TravelStyleStep {...stepProps} />}
          {currentStep === 6 && <AccommodationStep {...stepProps} />}
          {currentStep === 7 && <TransportationStep {...stepProps} />}
          {currentStep === 8 && <FoodStep {...stepProps} />}
          {currentStep === 9 && <ActivitiesStep {...stepProps} />}
        </div>

        {submitError && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-error-500">
            {submitError}
          </p>
        )}

        {isSubmitting && (
          <div className="mt-4 rounded-card border border-atlas-100 bg-atlas-50 p-4 text-sm text-atlas-700" aria-live="polite">
            <div className="flex items-center gap-3 font-semibold">
              <Spinner size="sm" />
              Planning your journey...
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {generationSteps.map((step) => (
                <li key={step} className="flex items-center gap-2 rounded-full bg-white/75 px-3 py-2">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-atlas-500" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            disabled={currentStep === 1 || isSubmitting}
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={handlePrimaryAction}
            isLoading={isSubmitting}
            loadingLabel="Planning..."
          >
            {currentStep === TOTAL_STEPS ? 'Generate itinerary' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}
