import type { QuestionnaireAnswers } from '@/lib/validations/questionnaireValidation'

export interface QuestionnaireStepProps {
  answers: QuestionnaireAnswers
  error?: string
  updateAnswer: <K extends keyof QuestionnaireAnswers>(
    key: K,
    value: QuestionnaireAnswers[K]
  ) => void
}