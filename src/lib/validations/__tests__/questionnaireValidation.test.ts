import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUESTIONNAIRE_ANSWERS,
  preferenceSetInputSchema,
  toPreferenceSetInput,
  validateAllQuestionnaireAnswers,
  validateQuestionnaireStep,
} from '@/lib/validations/questionnaireValidation'

describe('questionnaireValidation', () => {
  it('blocks advancing the destination step when the destination is too short after trimming', () => {
    const result = validateQuestionnaireStep(1, {
      ...DEFAULT_QUESTIONNAIRE_ANSWERS,
      destination: ' A ',
    })

    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/destination/i)
  })

  it('requires budget values to stay within range and on the 100 dollar step', () => {
    const belowMinimum = validateQuestionnaireStep(2, {
      ...DEFAULT_QUESTIONNAIRE_ANSWERS,
      budget: 50,
    })
    const offStep = validateQuestionnaireStep(2, {
      ...DEFAULT_QUESTIONNAIRE_ANSWERS,
      budget: 125,
    })

    expect(belowMinimum.valid).toBe(false)
    expect(offStep.valid).toBe(false)
  })

  it('accepts a complete questionnaire and serializes optional empty selections to null or arrays', () => {
    const answers = {
      ...DEFAULT_QUESTIONNAIRE_ANSWERS,
      destination: ' Kyoto ',
      budget: 3200,
      durationDays: 5,
      groupSize: 2,
      travelStyles: ['cultural', 'relaxation'],
      accommodationType: ['hotel', 'boutique'],
      foodPreferences: ['local', 'halal'],
      activityPreferences: ['museums', 'photography'],
    }

    expect(validateAllQuestionnaireAnswers(answers).valid).toBe(true)
    expect(toPreferenceSetInput(answers)).toEqual({
      destination: 'Kyoto',
      budget: 3200,
      durationDays: 5,
      groupSize: 2,
      travelStyles: ['cultural', 'relaxation'],
      accommodationType: 'hotel, boutique',
      transportationPreference: null,
      foodPreferences: ['local', 'halal'],
      activityPreferences: ['museums', 'photography'],
    })
  })

  it('allows trip style and food preferences to be skipped', () => {
    const answers = {
      ...DEFAULT_QUESTIONNAIRE_ANSWERS,
      destination: 'Seoul',
      budget: 2400,
      durationDays: 4,
      groupSize: 3,
      travelStyles: [],
      foodPreferences: [],
    }

    expect(validateQuestionnaireStep(5, answers).valid).toBe(true)
    expect(validateAllQuestionnaireAnswers(answers).valid).toBe(true)
    expect(toPreferenceSetInput(answers).travelStyles).toEqual([])
    expect(toPreferenceSetInput(answers).foodPreferences).toEqual([])
  })

  it('normalizes legacy singular travel style payloads to arrays', () => {
    const parsed = preferenceSetInputSchema.parse({
      destination: 'Lisbon',
      budget: 2800,
      durationDays: 6,
      groupSize: 2,
      travelStyle: 'cultural',
      accommodationType: null,
      transportationPreference: null,
      foodPreferences: ['local'],
      activityPreferences: [],
    })

    expect(parsed.travelStyles).toEqual(['cultural'])
  })
})