'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { TOTAL_STEPS } from '@/constants/questionnaire'
import {
  DEFAULT_QUESTIONNAIRE_ANSWERS,
  toPreferenceSetInput,
  validateAllQuestionnaireAnswers,
  validateQuestionnaireStep,
  type QuestionnaireAnswers,
} from '@/lib/validations/questionnaireValidation'
import type { PreferenceSetInput } from '@/types/trip'

type StepErrors = Partial<Record<number, string>>

interface PersistedQuestionnaireState {
  currentStep: number
  answers: QuestionnaireAnswers
}

type LegacyQuestionnaireAnswers = Partial<QuestionnaireAnswers> & {
  travelStyle?: unknown
}

export interface UseQuestionnaireReturn {
  tripId: string
  currentStep: number
  answers: QuestionnaireAnswers
  stepErrors: StepErrors
  isSubmitting: boolean
  submitError: string | null
  setIsSubmitting: (value: boolean) => void
  setSubmitError: (value: string | null) => void
  updateAnswer: <K extends keyof QuestionnaireAnswers>(
    key: K,
    value: QuestionnaireAnswers[K]
  ) => void
  goNext: () => boolean
  goBack: () => void
  reset: () => void
  validateAll: () => boolean
  getPreferenceInput: () => PreferenceSetInput
}

function storageKey(tripId: string) {
  return `questionnaire:${tripId}`
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function coerceLegacyTravelStyle(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  return trimmed.length > 0 ? [trimmed] : []
}

function coercePersistedAnswers(value: unknown): QuestionnaireAnswers {
  if (!value || typeof value !== 'object') return DEFAULT_QUESTIONNAIRE_ANSWERS

  const answers = value as LegacyQuestionnaireAnswers
  const { travelStyle: legacyTravelStyle, ...currentAnswers } = answers
  const travelStyles = coerceStringArray(currentAnswers.travelStyles)

  return {
    ...DEFAULT_QUESTIONNAIRE_ANSWERS,
    ...currentAnswers,
    travelStyles: travelStyles.length > 0 ? travelStyles : coerceLegacyTravelStyle(legacyTravelStyle),
    accommodationType: coerceStringArray(currentAnswers.accommodationType),
    foodPreferences: coerceStringArray(currentAnswers.foodPreferences),
    activityPreferences: coerceStringArray(currentAnswers.activityPreferences),
  }
}

function coercePersistedState(value: unknown): PersistedQuestionnaireState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<PersistedQuestionnaireState>
  if (typeof state.currentStep !== 'number' || !state.answers) return null

  return {
    currentStep: Math.min(TOTAL_STEPS, Math.max(1, Math.round(state.currentStep))),
    answers: coercePersistedAnswers(state.answers),
  }
}

export function useQuestionnaire(tripId: string): UseQuestionnaireReturn {
  const [currentStep, setCurrentStep] = useState(1)
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(DEFAULT_QUESTIONNAIRE_ANSWERS)
  const [stepErrors, setStepErrors] = useState<StepErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  const key = useMemo(() => storageKey(tripId), [tripId])

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw) {
        const parsed = coercePersistedState(JSON.parse(raw))
        if (parsed) {
          setCurrentStep(parsed.currentStep)
          setAnswers(parsed.answers)
        }
      }
    } catch {
      window.sessionStorage.removeItem(key)
    } finally {
      setIsHydrated(true)
    }
  }, [key])

  useEffect(() => {
    if (!isHydrated) return
    const state: PersistedQuestionnaireState = { currentStep, answers }
    window.sessionStorage.setItem(key, JSON.stringify(state))
  }, [answers, currentStep, isHydrated, key])

  const updateAnswer = useCallback(
    <K extends keyof QuestionnaireAnswers>(keyName: K, value: QuestionnaireAnswers[K]) => {
      setAnswers((previous) => ({ ...previous, [keyName]: value }))
      setStepErrors((previous) => ({ ...previous, [currentStep]: undefined }))
      setSubmitError(null)
    },
    [currentStep]
  )

  const goNext = useCallback(() => {
    const result = validateQuestionnaireStep(currentStep, answers)
    if (!result.valid) {
      setStepErrors((previous) => ({ ...previous, [currentStep]: result.error }))
      return false
    }

    setStepErrors((previous) => ({ ...previous, [currentStep]: undefined }))
    setCurrentStep((previous) => Math.min(TOTAL_STEPS, previous + 1))
    return true
  }, [answers, currentStep])

  const goBack = useCallback(() => {
    setSubmitError(null)
    setCurrentStep((previous) => Math.max(1, previous - 1))
  }, [])

  const reset = useCallback(() => {
    setCurrentStep(1)
    setAnswers(DEFAULT_QUESTIONNAIRE_ANSWERS)
    setStepErrors({})
    setSubmitError(null)
    window.sessionStorage.removeItem(key)
  }, [key])

  const validateAll = useCallback(() => {
    const result = validateAllQuestionnaireAnswers(answers)
    if (result.valid) return true

    for (let step = 1; step <= TOTAL_STEPS; step += 1) {
      const stepResult = validateQuestionnaireStep(step, answers)
      if (!stepResult.valid) {
        setCurrentStep(step)
        setStepErrors((previous) => ({ ...previous, [step]: stepResult.error }))
        return false
      }
    }

    setSubmitError(result.error ?? 'Please check your answers and try again.')
    return false
  }, [answers])

  const getPreferenceInput = useCallback(() => toPreferenceSetInput(answers), [answers])

  return {
    tripId,
    currentStep,
    answers,
    stepErrors,
    isSubmitting,
    submitError,
    setIsSubmitting,
    setSubmitError,
    updateAnswer,
    goNext,
    goBack,
    reset,
    validateAll,
    getPreferenceInput,
  }
}