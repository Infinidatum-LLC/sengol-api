/**
 * Retry Logic with Exponential Backoff
 */

import { TimeoutError } from './errors'

export interface RetryOptions {
  maxRetries?: number           // Maximum number of retry attempts (default: 3)
  initialDelay?: number         // Initial delay in ms (default: 1000)
  maxDelay?: number             // Maximum delay in ms (default: 30000)
  backoffMultiplier?: number    // Multiplier for exponential backoff (default: 2)
  timeout?: number              // Timeout for each attempt in ms (default: 30000)
  retryableErrors?: string[]    // Error codes that should trigger retry
  onRetry?: (error: Error, attempt: number) => void
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    timeout = 30000,
    retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
    onRetry,
  } = options

  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Wrap with timeout
      const result = await withTimeout(fn(), timeout, 'retry-operation')
      return result
    } catch (error) {
      lastError = error as Error

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break
      }

      // Check if error is retryable
      const isRetryable = isRetryableError(error as Error, retryableErrors)
      if (!isRetryable) {
        throw error
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      )
      const jitter = Math.random() * 0.3 * delay // Add up to 30% jitter
      const actualDelay = delay + jitter

      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${Math.round(actualDelay)}ms...`,
        { error: (error as Error).message }
      )

      if (onRetry) {
        onRetry(error as Error, attempt + 1)
      }

      // Wait before retrying
      await sleep(actualDelay)
    }
  }

  throw lastError!
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutHandle!)
    return result
  } catch (error) {
    clearTimeout(timeoutHandle!)
    throw error
  }
}

function isRetryableError(error: Error, retryableErrors: string[]): boolean {
  // Check error code
  const errorCode = (error as any).code
  if (errorCode && retryableErrors.includes(errorCode)) {
    return true
  }

  // Check for common retryable patterns in error message
  const message = error.message.toLowerCase()
  const retryablePatterns = [
    'timeout',
    'timed out',
    'connection reset',
    'econnreset',
    'socket hang up',
    'network error',
    'rate limit',
    '429',
    '503',
    '504',
  ]

  return retryablePatterns.some(pattern => message.includes(pattern))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export { sleep }
