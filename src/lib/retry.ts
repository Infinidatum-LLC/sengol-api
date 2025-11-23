/**
 * Retry utility with exponential backoff and jitter
 * 
 * Implements exponential backoff retry strategy with jitter to prevent
 * thundering herd problems and reduce load on failing services.
 */

export interface RetryOptions {
  maxRetries?: number
  initialDelay?: number // in milliseconds
  maxDelay?: number // in milliseconds
  backoffMultiplier?: number
  jitter?: boolean
  onRetry?: (attempt: number, error: Error) => void
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> & { onRetry?: (attempt: number, error: Error) => void } = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitter: true,
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'onRetry'>>): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt)
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay)
  
  if (options.jitter) {
    // Add random jitter (0-30% of delay) to prevent thundering herd
    const jitterAmount = cappedDelay * 0.3 * Math.random()
    return cappedDelay + jitterAmount
  }
  
  return cappedDelay
}

/**
 * Retry a function with exponential backoff
 * 
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => fetchData(),
 *   {
 *     maxRetries: 3,
 *     initialDelay: 1000,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`)
 *   }
 * )
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options } as Required<Omit<RetryOptions, 'onRetry'>> & { onRetry?: (attempt: number, error: Error) => void }
  
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break
      }
      
      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError)
      }
      
      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts)
      console.log(`[RETRY] Attempt ${attempt + 1}/${opts.maxRetries} failed, retrying in ${delay.toFixed(0)}ms...`)
      await sleep(delay)
    }
  }
  
  // All retries exhausted
  throw new Error(
    `Operation failed after ${opts.maxRetries + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  )
}

/**
 * Retry with circuit breaker pattern
 * Stops retrying after threshold failures within time window
 */
export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private readonly failureThreshold: number
  private readonly resetTimeout: number // in milliseconds

  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold
    this.resetTimeout = resetTimeout
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should be opened
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime
      if (timeSinceLastFailure > this.resetTimeout) {
        // Try half-open state after timeout
        this.state = 'half-open'
        console.log('[CIRCUIT_BREAKER] Moving to half-open state, attempting request...')
      } else {
        throw new Error(
          `Circuit breaker is open. Last failure: ${Math.round(timeSinceLastFailure / 1000)}s ago. Retry after ${Math.round(this.resetTimeout / 1000)}s.`
        )
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failures = 0
    if (this.state === 'half-open') {
      console.log('[CIRCUIT_BREAKER] Request succeeded, closing circuit')
      this.state = 'closed'
    }
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.failures >= this.failureThreshold) {
      this.state = 'open'
      console.warn(
        `[CIRCUIT_BREAKER] Circuit opened after ${this.failures} failures. Will retry after ${this.resetTimeout / 1000}s`
      )
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state
  }

  reset(): void {
    this.failures = 0
    this.lastFailureTime = 0
    this.state = 'closed'
  }
}
