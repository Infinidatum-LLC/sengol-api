/**
 * Validation Utilities
 * 
 * Common validation functions for request data
 */

import { ValidationError } from './errors'

/**
 * Validate UUID format
 */
export function validateUUID(id: string, fieldName = 'ID'): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!id || typeof id !== 'string' || !uuidRegex.test(id)) {
    throw new ValidationError(`Invalid ${fieldName} format`, 'INVALID_UUID')
  }
}

/**
 * Validate required string field
 */
export function validateRequiredString(
  value: unknown,
  fieldName: string,
  minLength = 1,
  maxLength?: number
): string {
  if (value === undefined || value === null) {
    throw new ValidationError(`${fieldName} is required`, 'MISSING_FIELD')
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, 'INVALID_TYPE')
  }

  const trimmed = value.trim()

  if (trimmed.length < minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLength} character${minLength > 1 ? 's' : ''}`,
      'INVALID_LENGTH'
    )
  }

  if (maxLength && trimmed.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must be at most ${maxLength} characters`,
      'INVALID_LENGTH'
    )
  }

  return trimmed
}

/**
 * Validate optional string field
 */
export function validateOptionalString(
  value: unknown,
  fieldName: string,
  maxLength?: number
): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, 'INVALID_TYPE')
  }

  const trimmed = value.trim()

  if (maxLength && trimmed.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must be at most ${maxLength} characters`,
      'INVALID_LENGTH'
    )
  }

  return trimmed || null
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[],
  defaultValue?: T
): T {
  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new ValidationError(`${fieldName} is required`, 'MISSING_FIELD')
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, 'INVALID_TYPE')
  }

  if (!allowedValues.includes(value as T)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      'INVALID_ENUM'
    )
  }

  return value as T
}

/**
 * Validate numeric range
 */
export function validateNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number {
  if (value === undefined || value === null) {
    throw new ValidationError(`${fieldName} is required`, 'MISSING_FIELD')
  }

  const num = typeof value === 'string' ? parseFloat(value) : Number(value)

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a number`, 'INVALID_TYPE')
  }

  if (min !== undefined && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`, 'INVALID_RANGE')
  }

  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`, 'INVALID_RANGE')
  }

  return num
}

/**
 * Validate optional number
 */
export function validateOptionalNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number | null {
  if (value === undefined || value === null) {
    return null
  }

  return validateNumber(value, fieldName, min, max)
}

