/**
 * Structured Logging for Trial System
 *
 * Provides consistent logging with context and severity levels.
 * All logs include timestamp, context, and structured data.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
}

class Logger {
  constructor(private serviceName: string = 'trial-system') {}

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * Log error with optional exception
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      message,
      context: { service: this.serviceName, ...context },
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    console.error(JSON.stringify(entry))
  }

  /**
   * Log trial limit violation
   */
  logTrialLimitViolation(userId: string, feature: string, used: number, limit: number): void {
    this.warn('Trial limit reached', {
      service: this.serviceName,
      userId,
      feature,
      used,
      limit,
      action: 'TRIAL_LIMIT_VIOLATION',
    })
  }

  /**
   * Log feature usage increment
   */
  logFeatureUsage(userId: string, feature: string, newCount: number): void {
    this.debug('Feature usage incremented', {
      service: this.serviceName,
      userId,
      feature,
      newCount,
      action: 'FEATURE_USAGE_INCREMENT',
    })
  }

  /**
   * Log subscription change
   */
  logSubscriptionChange(userId: string, oldTier: string, newTier: string): void {
    this.info('Subscription changed', {
      service: this.serviceName,
      userId,
      oldTier,
      newTier,
      action: 'SUBSCRIPTION_CHANGE',
    })
  }

  /**
   * Log trial start
   */
  logTrialStart(userId: string, expiresAt: Date): void {
    this.info('Trial started', {
      service: this.serviceName,
      userId,
      expiresAt: expiresAt.toISOString(),
      action: 'TRIAL_START',
    })
  }

  /**
   * Log trial expiration
   */
  logTrialExpiration(userId: string, expiryDate: Date): void {
    this.info('Trial expired', {
      service: this.serviceName,
      userId,
      expiryDate: expiryDate.toISOString(),
      action: 'TRIAL_EXPIRED',
    })
  }

  /**
   * Log Stripe webhook event
   */
  logStripeWebhook(eventId: string, eventType: string, userId: string, status: string): void {
    this.info('Stripe webhook processed', {
      service: this.serviceName,
      eventId,
      eventType,
      userId,
      status,
      action: 'STRIPE_WEBHOOK',
    })
  }

  /**
   * Log database operation
   */
  logDatabaseOperation(operation: string, duration: number, success: boolean, error?: Error): void {
    const level = success ? LogLevel.DEBUG : LogLevel.ERROR
    const message = success ? `Database operation completed` : `Database operation failed`

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        service: this.serviceName,
        operation,
        duration,
        success,
      },
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    if (success) {
      console.log(JSON.stringify(entry))
    } else {
      console.error(JSON.stringify(entry))
    }
  }

  /**
   * Log cache operation
   */
  logCacheOperation(operation: string, key: string, hit: boolean): void {
    this.debug('Cache operation', {
      service: this.serviceName,
      operation,
      key,
      hit,
      action: 'CACHE_OPERATION',
    })
  }

  /**
   * Private log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { service: this.serviceName, ...context },
    }

    const output = JSON.stringify(entry)

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(output)
        break
      case LogLevel.INFO:
        console.log(output)
        break
      case LogLevel.WARN:
        console.warn(output)
        break
      case LogLevel.ERROR:
        console.error(output)
        break
    }
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger('trial-system')
