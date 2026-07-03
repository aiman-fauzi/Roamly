/**
 * Extract the local-part (prefix) of an email address.
 * Property 2: For any valid email with exactly one '@', result is non-empty string.
 *
 * @param email - A valid email address string
 * @returns The portion before the '@' symbol
 */
export function extractEmailPrefix(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) return email // guard: return full string if malformed
  return email.slice(0, atIndex)
}
