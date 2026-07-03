/**
 * Password validation — Property 1.
 * Accept iff length ∈ [8, 128].
 * Rejection happens client-side before any network request is made.
 */

const MIN_LENGTH = 8
const MAX_LENGTH = 128

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_LENGTH} characters.`,
    }
  }
  if (password.length > MAX_LENGTH) {
    return {
      valid: false,
      error: `Password must be no more than ${MAX_LENGTH} characters.`,
    }
  }
  return { valid: true }
}

