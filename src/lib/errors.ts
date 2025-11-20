/**
 * Custom Error Classes for Trial System
 *
 * All errors include HTTP status codes and user-friendly messages.
 * Internal errors logged with details; users see generic messages.
 */

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    public userMessage: string,
    message: string,
    public metadata?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      code: this.code,
      statusCode: this.statusCode,
      userMessage: this.userMessage,
      message: this.message,
      metadata: this.metadata,
    }
  }
}

/**
 * User hit trial limit for a feature
 */
export class TrialLimitError extends AppError {
  constructor(feature: string, used: number, limit: number, tier: string) {
    super(
      'TRIAL_LIMIT_EXCEEDED',
      429,
      'Feature not available for your tier',
      `Trial limit exceeded for ${feature}: ${used}/${limit}`,
      { feature, used, limit, tier }
    )
  }
}

/**
 * Trial period has expired
 */
export class TrialExpiredError extends AppError {
  constructor(userId: string, expiryDate: Date) {
    const dateStr = expiryDate.toISOString()
    super(
      'TRIAL_EXPIRED',
      403,
      'Your trial has expired. Please upgrade to continue.',
      `Trial expired for user ${userId} on ${dateStr}`,
      { userId, expiryDate: dateStr }
    )
  }
}

/**
 * Subscription-related errors
 */
export class SubscriptionError extends AppError {
  constructor(userId: string, message: string, metadata?: Record<string, unknown>) {
    super(
      'SUBSCRIPTION_ERROR',
      400,
      'Subscription required to access this feature',
      `Subscription error for user ${userId}: ${message}`,
      metadata
    )
  }
}

/**
 * Invalid or unknown pricing tier
 */
export class InvalidTierError extends AppError {
  constructor(tier: string) {
    super(
      'INVALID_TIER',
      400,
      'Invalid subscription tier',
      `Unknown pricing tier: ${tier}`,
      { tier }
    )
  }
}

/**
 * Database operation errors
 */
export class DatabaseError extends AppError {
  constructor(operation: string, originalError: Error) {
    super(
      'DATABASE_ERROR',
      500,
      'Database operation failed',
      `Database error during ${operation}: ${originalError.message}`,
      {
        operation,
        originalError: originalError.message,
        stack: originalError.stack,
      }
    )
  }
}

/**
 * Stripe webhook processing errors
 */
export class StripeWebhookError extends AppError {
  constructor(eventType: string, message: string, metadata?: Record<string, unknown>) {
    super(
      'STRIPE_WEBHOOK_ERROR',
      400,
      'Payment processing failed',
      `Stripe webhook error for ${eventType}: ${message}`,
      metadata
    )
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(field: string, message: string) {
    super(
      'VALIDATION_ERROR',
      400,
      'Invalid input',
      `Validation error in ${field}: ${message}`,
      { field }
    )
  }
}

/**
 * Unauthorized access errors
 */
export class UnauthorizedError extends AppError {
  constructor(reason: string = 'Unauthorized') {
    super(
      'UNAUTHORIZED',
      401,
      'Authentication required',
      reason,
      {}
    )
  }
}

/**
 * Format error response for API replies
 * Returns user-friendly message, hides internal details
 */
export function formatErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.userMessage,
      metadata: error.metadata,
    }
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      metadata: { originalError: error.message },
    }
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  }
}

/**
 * Helper to get HTTP status code from error
 */
export function getStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode
  }
  return 500
}
