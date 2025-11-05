/**
 * Custom Error Classes for better error handling and monitoring
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public isOperational: boolean = true,
    public metadata?: Record<string, any>
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      metadata: this.metadata,
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', true, metadata)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 500, 'DATABASE_ERROR', true, metadata)
  }
}

export class VectorDBError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 503, 'VECTORDB_ERROR', true, metadata)
  }
}

export class LLMError extends AppError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, 503, 'LLM_ERROR', true, metadata)
  }
}

export class CircuitBreakerError extends AppError {
  constructor(service: string, metadata?: Record<string, any>) {
    super(
      `Service ${service} is temporarily unavailable (circuit breaker open)`,
      503,
      'CIRCUIT_BREAKER_OPEN',
      true,
      metadata
    )
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number, metadata?: Record<string, any>) {
    super(
      `Operation ${operation} timed out after ${timeoutMs}ms`,
      408,
      'TIMEOUT_ERROR',
      true,
      metadata
    )
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` with id ${id}` : ''} not found`,
      404,
      'NOT_FOUND',
      true
    )
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR', true)
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR', true)
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(
      'Too many requests',
      429,
      'RATE_LIMIT_ERROR',
      true,
      retryAfter ? { retryAfter } : undefined
    )
  }
}
