/**
 * Password Hashing Service
 *
 * Provides secure password hashing and verification using bcryptjs.
 * All passwords are hashed before storage in the database.
 */

import bcrypt from 'bcryptjs'

// ============================================================================
// CONFIGURATION
// ============================================================================

// Number of salt rounds for bcrypt hashing
// Higher = more secure but slower (default: 10 is reasonable)
const SALT_ROUNDS = 10

// ============================================================================
// PASSWORD HASHING
// ============================================================================

/**
 * Hash a plaintext password
 *
 * @param password - Plaintext password to hash
 * @returns Promise<string> - Hashed password (can be stored in database)
 * @throws Error if hashing fails
 *
 * @example
 * const hashedPassword = await hashPassword('MyPassword123')
 * // Store hashedPassword in database
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string')
    }

    // Generate salt
    const salt = await bcrypt.genSalt(SALT_ROUNDS)

    // Hash password with salt
    const hashedPassword = await bcrypt.hash(password, salt)

    return hashedPassword
  } catch (error) {
    console.error('[PASSWORD] Hashing failed:', error instanceof Error ? error.message : error)
    throw new Error(`Password hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Verify a plaintext password against a hash
 *
 * @param password - Plaintext password to verify
 * @param hash - Hashed password from database
 * @returns Promise<boolean> - true if password matches hash, false otherwise
 *
 * @example
 * const isValid = await verifyPassword('MyPassword123', storedHash)
 * if (isValid) {
 *   // Password is correct
 * } else {
 *   // Password is incorrect
 * }
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (!password || !hash) {
      return false
    }

    // Compare password with hash
    const isMatch = await bcrypt.compare(password, hash)

    return isMatch
  } catch (error) {
    console.error('[PASSWORD] Verification failed:', error instanceof Error ? error.message : error)
    // On error, return false (fail securely)
    return false
  }
}

/**
 * Check if a password is strong enough
 *
 * Requirements:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character (!@#$%^&*)
 *
 * @param password - Password to validate
 * @returns Object with validation result and feedback
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean
  score: number
  feedback: string[]
} {
  const feedback: string[] = []
  let score = 0

  if (!password) {
    return {
      isValid: false,
      score: 0,
      feedback: ['Password is required'],
    }
  }

  // Length check (8+ characters)
  if (password.length >= 8) {
    score += 1
  } else {
    feedback.push('Password must be at least 8 characters')
  }

  // Uppercase check
  if (/[A-Z]/.test(password)) {
    score += 1
  } else {
    feedback.push('Password must contain at least one uppercase letter')
  }

  // Lowercase check
  if (/[a-z]/.test(password)) {
    score += 1
  } else {
    feedback.push('Password must contain at least one lowercase letter')
  }

  // Digit check
  if (/\d/.test(password)) {
    score += 1
  } else {
    feedback.push('Password must contain at least one digit')
  }

  // Special character check
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1
  } else {
    feedback.push('Password must contain at least one special character (!@#$%^&*)')
  }

  const isValid = score >= 4 // Require at least 4 out of 5 checks to pass

  return {
    isValid,
    score,
    feedback,
  }
}

/**
 * Get password strength description
 *
 * @param score - Strength score (0-5)
 * @returns String description of password strength
 */
export function getPasswordStrengthDescription(score: number): string {
  switch (score) {
    case 0:
      return 'Very Weak'
    case 1:
      return 'Weak'
    case 2:
      return 'Fair'
    case 3:
      return 'Good'
    case 4:
      return 'Strong'
    case 5:
      return 'Very Strong'
    default:
      return 'Unknown'
  }
}
