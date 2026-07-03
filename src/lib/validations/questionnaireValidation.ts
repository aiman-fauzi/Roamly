import { z } from 'zod'

import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  DURATION_MAX,
  DURATION_MIN,
  GROUP_SIZE_MAX,
  GROUP_SIZE_MIN,
  TOTAL_STEPS,
} from '@/constants/questionnaire'
import type { PreferenceSetInput } from '@/types/trip'

export interface QuestionnaireAnswers {
  destination: string
  budget: number
  durationDays: number
  groupSize: number
  travelStyles: string[]
  accommodationType: string[]
  transportationPreference: string
  foodPreferences: string[]
  activityPreferences: string[]
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export const DEFAULT_QUESTIONNAIRE_ANSWERS: QuestionnaireAnswers = {
  destination: '',
  budget: 1000,
  durationDays: 3,
  groupSize: 2,
  travelStyles: [],
  accommodationType: [],
  transportationPreference: '',
  foodPreferences: [],
  activityPreferences: [],
}

const destinationSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 2, 'Please enter your destination.')
  .refine((value) => value.length <= 100, 'Please keep the destination under 100 characters.')

const budgetSchema = z
  .number()
  .int('Please choose a whole-dollar budget.')
  .min(BUDGET_MIN, `Budget must be at least $${BUDGET_MIN}.`)
  .max(BUDGET_MAX, `Budget must be $${BUDGET_MAX} or less.`)
  .refine((value) => value % BUDGET_STEP === 0, `Budget must use $${BUDGET_STEP} increments.`)

const durationSchema = z
  .number()
  .int('Please choose a whole number of days.')
  .min(DURATION_MIN, `Trip duration must be at least ${DURATION_MIN} day.`)
  .max(DURATION_MAX, `Trip duration must be ${DURATION_MAX} days or fewer.`)

const groupSizeSchema = z
  .number()
  .int('Please choose a whole number of travelers.')
  .min(GROUP_SIZE_MIN, `Group size must be at least ${GROUP_SIZE_MIN}.`)
  .max(GROUP_SIZE_MAX, `Group size must be ${GROUP_SIZE_MAX} or fewer.`)

const selectionArraySchema = z.array(z.string())

export const questionnaireAnswerSchema = z.object({
  destination: destinationSchema,
  budget: budgetSchema,
  durationDays: durationSchema,
  groupSize: groupSizeSchema,
  travelStyles: selectionArraySchema,
  accommodationType: selectionArraySchema,
  transportationPreference: z.string(),
  foodPreferences: selectionArraySchema,
  activityPreferences: selectionArraySchema,
})

function legacySelectionToArray(value: string | null | undefined): string[] {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? [trimmed] : []
}

export const preferenceSetInputSchema = z
  .object({
    destination: destinationSchema,
    budget: budgetSchema,
    durationDays: durationSchema,
    groupSize: groupSizeSchema,
    travelStyles: selectionArraySchema.optional(),
    travelStyle: z.string().nullable().optional(),
    accommodationType: z.string().nullable(),
    transportationPreference: z.string().nullable(),
    foodPreferences: selectionArraySchema,
    activityPreferences: selectionArraySchema,
  })
  .transform(({ travelStyle, travelStyles, ...data }) => ({
    ...data,
    travelStyles: travelStyles ?? legacySelectionToArray(travelStyle),
  }))

function issueToResult(result: z.SafeParseReturnType<unknown, unknown>): ValidationResult {
  if (result.success) return { valid: true }
  return { valid: false, error: result.error.issues[0]?.message ?? 'Invalid answer.' }
}

export function validateQuestionnaireStep(
  step: number,
  answers: QuestionnaireAnswers
): ValidationResult {
  switch (step) {
    case 1:
      return issueToResult(destinationSchema.safeParse(answers.destination))
    case 2:
      return issueToResult(budgetSchema.safeParse(answers.budget))
    case 3:
      return issueToResult(durationSchema.safeParse(answers.durationDays))
    case 4:
      return issueToResult(groupSizeSchema.safeParse(answers.groupSize))
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
      return { valid: true }
    default:
      return { valid: false, error: `Step must be between 1 and ${TOTAL_STEPS}.` }
  }
}

export function validateAllQuestionnaireAnswers(answers: QuestionnaireAnswers): ValidationResult {
  const result = questionnaireAnswerSchema.safeParse(answers)
  return issueToResult(result)
}

function nullableSelection(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function toPreferenceSetInput(answers: QuestionnaireAnswers): PreferenceSetInput {
  return {
    destination: destinationSchema.parse(answers.destination),
    budget: budgetSchema.parse(answers.budget),
    durationDays: durationSchema.parse(answers.durationDays),
    groupSize: groupSizeSchema.parse(answers.groupSize),
    travelStyles: answers.travelStyles,
    accommodationType:
      answers.accommodationType.length > 0 ? answers.accommodationType.join(', ') : null,
    transportationPreference: nullableSelection(answers.transportationPreference),
    foodPreferences: answers.foodPreferences,
    activityPreferences: answers.activityPreferences,
  }
}
