'use client'

import { useCallback, useEffect, useState } from 'react'

import { API } from '@/constants/api'
import type { Profile, ProfileSummary, ProfileUpdateInput } from '@/types/profile'

interface UseProfileReturn {
  summary: ProfileSummary | null
  profile: Profile | null
  isLoading: boolean
  error: string | null
  updateProfile: (input: ProfileUpdateInput) => Promise<ProfileSummary>
  updateDisplayName: (name: string) => Promise<void>
  updateAvatar: (file: File) => Promise<void>
  refetch: () => Promise<void>
}

export function useProfile(): UseProfileReturn {
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(API.PROFILE)
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to load profile')
        return
      }
      const data = (await res.json()) as ProfileSummary
      setSummary(data)
    } catch {
      setError('Failed to load profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  const updateProfile = useCallback(async (input: ProfileUpdateInput) => {
    const res = await fetch(API.PROFILE, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      throw new Error(data.error ?? 'Failed to update profile')
    }
    const updated = (await res.json()) as ProfileSummary
    setSummary(updated)
    return updated
  }, [])

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      const current = summary?.profile
      await updateProfile({
        displayName,
        country: current?.country ?? '',
        region: current?.region ?? '',
        preferredCurrency: current?.preferredCurrency ?? '',
        travelInterests: current?.travelInterests ?? [],
        preferredLanguage: current?.preferredLanguage ?? null,
      })
    },
    [summary?.profile, updateProfile]
  )

  const updateAvatar = useCallback(async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(API.AVATAR, { method: 'POST', body: formData })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      throw new Error(data.error ?? 'Failed to upload avatar')
    }
    const data = (await res.json()) as { avatarUrl: string }
    setSummary((prev) =>
      prev ? { ...prev, profile: { ...prev.profile, avatarUrl: data.avatarUrl } } : prev
    )
  }, [])

  return {
    summary,
    profile: summary?.profile ?? null,
    isLoading,
    error,
    updateProfile,
    updateDisplayName,
    updateAvatar,
    refetch: fetchProfile,
  }
}