/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by stopping requests to failing services
 * and allowing them time to recover.
 */

import { CircuitBreakerError } from './errors'

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Service is failing, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold?: number      // Number of failures before opening (default: 5)
  successThreshold?: number      // Number of successes to close from half-open (default: 2)
  timeout?: number               // Time in ms before attempting half-open (default: 60000)
  monitoringPeriod?: number      // Time window for failure tracking (default: 120000)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private successCount: number = 0
  private nextAttempt: number = Date.now()
  private failureTimestamps: number[] = []

  private readonly failureThreshold: number
  private readonly successThreshold: number
  private readonly timeout: number
  private readonly monitoringPeriod: number

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.failureThreshold = options.failureThreshold || 5
    this.successThreshold = options.successThreshold || 2
    this.timeout = options.timeout || 60000 // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 120000 // 2 minutes
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitBreakerError(this.name)
      }
      // Transition to half-open to test the service
      this.state = CircuitState.HALF_OPEN
      console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`)
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
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED
        this.successCount = 0
        this.failureTimestamps = []
        console.log(`[CircuitBreaker:${this.name}] Closed after ${this.successThreshold} successes`)
      }
    }
  }

  private onFailure(): void {
    const now = Date.now()
    this.failureCount++
    this.failureTimestamps.push(now)

    // Clean old failures outside monitoring period
    this.failureTimestamps = this.failureTimestamps.filter(
      timestamp => now - timestamp < this.monitoringPeriod
    )

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during testing, go back to open
      this.state = CircuitState.OPEN
      this.nextAttempt = Date.now() + this.timeout
      this.successCount = 0
      console.log(`[CircuitBreaker:${this.name}] Opened after failure in HALF_OPEN state`)
    } else if (this.failureTimestamps.length >= this.failureThreshold) {
      // Too many failures in monitoring period
      this.state = CircuitState.OPEN
      this.nextAttempt = Date.now() + this.timeout
      console.log(
        `[CircuitBreaker:${this.name}] Opened after ${this.failureTimestamps.length} failures in ${this.monitoringPeriod}ms`
      )
    }
  }

  getState(): CircuitState {
    return this.state
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      recentFailures: this.failureTimestamps.length,
      nextAttempt: this.state === CircuitState.OPEN
        ? new Date(this.nextAttempt).toISOString()
        : null,
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.failureTimestamps = []
    this.nextAttempt = Date.now()
    console.log(`[CircuitBreaker:${this.name}] Manually reset`)
  }
}
