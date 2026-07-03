'use client'

import { useRef, useState } from 'react'

import { useToast } from '@/components/ui/Toast'
import { validateAvatarFile } from '@/lib/validations/avatarValidation'
import { cn } from '@/utils/cn'

interface AvatarUploadProps {
  avatarUrl: string | null
  displayName: string
  onUpload: (file: File) => Promise<void>
}

export function AvatarUpload({ avatarUrl, displayName, onUpload }: AvatarUploadProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setSuccess(false)

    const validation = validateAvatarFile(file)
    if (!validation.valid) {
      const message = validation.error ?? 'Please choose a JPEG, PNG, or WebP image under 5 MB.'
      setError(message)
      toast.error('Unable to upload avatar.', message)
      return
    }

    setIsUploading(true)
    try {
      await onUpload(file)
      setSuccess(true)
      toast.success('Avatar updated.')
      window.setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      setError(message)
      toast.error('Unable to upload avatar.', message)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className={cn(
          'relative h-24 w-24 overflow-hidden rounded-full transition-ui',
          'ring-2 ring-neutral-200 hover:ring-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          isUploading && 'opacity-60'
        )}
        aria-label="Change profile picture"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary-100 text-2xl font-bold text-primary-600">
            {initials}
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <svg className="h-6 w-6 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload avatar"
      />

      <p className="text-xs text-neutral-700">JPEG, PNG, or WebP. Max 5 MB.</p>

      {error && <p role="alert" className="text-sm text-error-500">{error}</p>}
      {success && <p role="status" className="text-sm text-success-500">Avatar updated.</p>}
    </div>
  )
}
