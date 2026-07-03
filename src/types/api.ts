/**
 * Standard error response shape returned by all API routes.
 * Consumers should check for this shape when a response is not 2xx.
 */
export interface ApiErrorResponse {
  error: string // Human-readable message
  code: string // Machine-readable code (e.g. "DRAFT_LIMIT_EXCEEDED")
  details?: unknown // Optional additional context
}

/**
 * Standard success response wrapper (optional — most routes return the resource directly).
 */
export interface ApiSuccessResponse<T> {
  data: T
}

