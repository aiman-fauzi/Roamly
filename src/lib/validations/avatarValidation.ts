/**
 * Avatar file validation — Property 4.
 * Accept iff MIME ∈ {image/jpeg, image/png, image/webp} AND size ≤ 5 MB.
 * Returns specific error identifying the violated constraint.
 */

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB = 5,242,880 bytes

export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return {
      valid: false,
      error: 'File type not supported. Please upload a JPEG, PNG, or WebP image.',
    }
  }
  if (file.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 5 MB.`,
    }
  }
  return { valid: true }
}

