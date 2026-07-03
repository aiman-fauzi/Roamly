'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { AvatarUpload } from '@/components/features/profile/AvatarUpload'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import {
  COUNTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  TRAVEL_INTEREST_OPTIONS,
  getSuggestedCurrency,
} from '@/constants/countries'
import { ROUTES } from '@/constants/routes'
import { useProfile } from '@/hooks/useProfile'
import { profileSetupSchema } from '@/lib/validations/profileValidation'
import type { ProfileUpdateInput } from '@/types/profile'

interface ProfileFormProps {
  mode: 'setup' | 'edit'
}

const EMPTY_FORM: ProfileUpdateInput = {
  displayName: '',
  country: '',
  region: '',
  preferredCurrency: '',
  travelInterests: [],
  preferredLanguage: null,
}

export function ProfileForm({ mode }: ProfileFormProps) {
  const router = useRouter()
  const toast = useToast()
  const { profile, isLoading, error, updateProfile, updateAvatar } = useProfile()
  const [form, setForm] = useState<ProfileUpdateInput>(EMPTY_FORM)
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!profile) return
    setForm({
      displayName: profile.displayName ?? '',
      country: profile.country ?? '',
      region: profile.region ?? '',
      preferredCurrency: profile.preferredCurrency ?? '',
      travelInterests: profile.travelInterests ?? [],
      preferredLanguage: profile.preferredLanguage,
    })
  }, [profile])

  const title = mode === 'setup' ? 'Complete your travel profile' : 'Travel profile'
  const buttonLabel = mode === 'setup' ? 'Save and continue' : 'Save profile'
  const selectedInterests = useMemo(() => new Set(form.travelInterests ?? []), [form.travelInterests])

  function updateField<K extends keyof ProfileUpdateInput>(key: K, value: ProfileUpdateInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
    setFormError(null)
    setSuccess(false)
  }

  function handleCountryChange(value: string) {
    const suggestedCurrency = getSuggestedCurrency(value)
    setForm((previous) => ({
      ...previous,
      country: value,
      preferredCurrency:
        !currencyTouched && suggestedCurrency ? suggestedCurrency : previous.preferredCurrency,
    }))
    setFormError(null)
    setSuccess(false)
  }

  function handleCurrencyChange(value: string) {
    setCurrencyTouched(true)
    updateField('preferredCurrency', value.toUpperCase())
  }

  function toggleInterest(value: string) {
    const interests = new Set(form.travelInterests ?? [])
    if (interests.has(value)) {
      interests.delete(value)
    } else {
      interests.add(value)
    }
    updateField('travelInterests', Array.from(interests))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = profileSetupSchema.safeParse(form)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Please check your profile details.')
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      await updateProfile(parsed.data)
      setSuccess(true)
      toast.success('Profile updated.', mode === 'setup' ? 'You can start planning now.' : 'Your travel preferences were saved.')
      if (mode === 'setup') {
        router.replace(ROUTES.DASHBOARD)
        router.refresh()
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save changes.'
      setFormError(message)
      toast.error('Unable to save changes.', 'Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <SkeletonCard />

  if (error) {
    return (
      <div className="rounded-card bg-white p-card-pad shadow-card">
        <p role="alert" className="text-sm text-error-500">
          {error}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-card bg-white p-card-pad shadow-card">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        <p className="mt-2 text-sm text-neutral-700">
          These details help Roamly plan with the right currency, language, and travel style.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <AvatarUpload
          avatarUrl={profile?.avatarUrl ?? null}
          displayName={form.displayName}
          onUpload={updateAvatar}
        />

        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label="Full name"
              value={form.displayName}
              onChange={(event) => updateField('displayName', event.target.value)}
              placeholder="Your full name"
              maxLength={100}
              required
            />
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-900">
            Country
            <select
              value={form.country}
              onChange={(event) => handleCountryChange(event.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-base text-neutral-900 transition-ui focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="">Select country</option>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.value} value={country.value}>
                  {country.label}
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Region / State"
            value={form.region}
            onChange={(event) => updateField('region', event.target.value)}
            placeholder="Selangor"
            maxLength={100}
            required
          />

          <Input
            label="Preferred currency"
            value={form.preferredCurrency}
            onChange={(event) => handleCurrencyChange(event.target.value)}
            placeholder="MYR"
            maxLength={3}
            required
          />

          <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-900">
            Preferred language
            <select
              value={form.preferredLanguage ?? ''}
              onChange={(event) => updateField('preferredLanguage', event.target.value || null)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-base text-neutral-900 transition-ui focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">No preference</option>
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium text-neutral-900">Travel interests</p>
            <div className="flex flex-wrap gap-2">
              {TRAVEL_INTEREST_OPTIONS.map((interest) => (
                <Chip
                  key={interest.value}
                  label={interest.label}
                  selected={selectedInterests.has(interest.value)}
                  onClick={() => toggleInterest(interest.value)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-error-500">
          {formError}
        </p>
      )}
      {success && mode === 'edit' && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-success-500">
          Profile updated successfully.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" isLoading={isSaving} loadingLabel="Saving...">
          {buttonLabel}
        </Button>
      </div>
    </form>
  )
}



