/**
 * Two-Factor Authentication (2FA) Service
 *
 * Provides Time-based One-Time Password (TOTP) generation, verification, and management.
 * Implements RFC 6238 standard for TOTP authentication.
 *
 * Features:
 * - TOTP secret generation with backup codes
 * - QR code generation for authenticator app setup
 * - TOTP code verification with time window tolerance
 * - Backup code generation and validation
 * - Device trust management
 */

import speakeasy from 'speakeasy'
import qrcode from 'qrcode'
import { randomUUID } from 'crypto'
import { query } from './db'

// ============================================================================
// CONFIGURATION
// ============================================================================

// TOTP configuration
const TOTP_WINDOW = 2 // Allow codes from ±2 time steps (30 seconds each)
const TOTP_STEP = 30 // Time step in seconds
const TOTP_DIGITS = 6 // Number of digits in TOTP code

// Backup codes configuration
const BACKUP_CODES_COUNT = 10
const BACKUP_CODE_LENGTH = 8

// ============================================================================
// TYPES
// ============================================================================

export interface TOTPSetup {
  secret: string
  qrCode: string // Base64 data URL
  backupCodes: string[]
}

export interface TOTPVerificationResult {
  valid: boolean
  code?: string
}

export interface UserDevice {
  id: string
  userId: string
  userAgent?: string
  ipAddress?: string
  isTrusted: boolean
  lastUsedAt: Date
  createdAt: Date
}

// ============================================================================
// TOTP SECRET GENERATION
// ============================================================================

/**
 * Generate TOTP secret and backup codes for a user
 *
 * Returns secret, QR code (as base64 data URL), and backup codes
 *
 * @param email - User email for TOTP label
 * @param issuer - Issuer name (appears in authenticator app)
 * @returns Promise<TOTPSetup> - Secret, QR code, and backup codes
 *
 * @example
 * const setup = await generateTOTPSecret('user@example.com', 'Sengol')
 * // User scans setup.qrCode with authenticator app
 * // User saves setup.backupCodes securely
 */
export async function generateTOTPSecret(email: string, issuer: string = 'Sengol'): Promise<TOTPSetup> {
  try {
    // Generate TOTP secret using speakeasy
    const secret = speakeasy.generateSecret({
      name: `${issuer} (${email})`,
      issuer,
      length: 32, // 256-bit secret
    })

    if (!secret.otpauth_url) {
      throw new Error('Failed to generate TOTP URL')
    }

    // Generate QR code as base64 data URL
    const qrCode = await qrcode.toDataURL(secret.otpauth_url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 1,
    })

    // Generate backup codes
    const backupCodes = generateBackupCodes(BACKUP_CODES_COUNT)

    return {
      secret: secret.base32, // Base32 encoded secret for manual entry
      qrCode,
      backupCodes,
    }
  } catch (error) {
    console.error('[TOTP] Secret generation failed:', error instanceof Error ? error.message : error)
    throw new Error(`TOTP secret generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generate backup codes for account recovery
 *
 * Backup codes are used as fallback authentication if TOTP device is lost.
 * Each code can be used only once.
 *
 * @param count - Number of backup codes to generate
 * @returns string[] - Array of backup codes
 */
export function generateBackupCodes(count: number = BACKUP_CODES_COUNT): string[] {
  const codes: string[] = []

  for (let i = 0; i < count; i++) {
    // Generate random backup code
    const code = speakeasy.generateSecret({
      length: BACKUP_CODE_LENGTH,
      symbols: false, // Use only alphanumeric
    }).base32.substring(0, BACKUP_CODE_LENGTH)

    // Format as XXXX-XXXX for readability
    const formatted = `${code.substring(0, 4)}-${code.substring(4)}`
    codes.push(formatted)
  }

  return codes
}

// ============================================================================
// TOTP VERIFICATION
// ============================================================================

/**
 * Verify TOTP code provided by user
 *
 * Accepts codes from current and adjacent time windows (±2 steps)
 * to account for clock skew.
 *
 * @param secret - Base32-encoded TOTP secret
 * @param token - 6-digit code from authenticator app
 * @returns TOTPVerificationResult - {valid: boolean}
 *
 * @example
 * const result = await verifyTOTP(secret, '123456')
 * if (result.valid) {
 *   // TOTP code is correct
 * }
 */
export function verifyTOTP(secret: string, token: string): TOTPVerificationResult {
  try {
    if (!secret || !token) {
      return { valid: false }
    }

    // Verify token using speakeasy
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: TOTP_WINDOW,
    })

    if (verified) {
      return {
        valid: true,
        code: token,
      }
    }

    return { valid: false }
  } catch (error) {
    console.error('[TOTP] Verification failed:', error instanceof Error ? error.message : error)
    return { valid: false }
  }
}

/**
 * Generate current TOTP code (for testing/debugging only)
 *
 * DO NOT expose this in production endpoints - only for testing.
 *
 * @param secret - Base32-encoded TOTP secret
 * @returns string - Current 6-digit TOTP code
 */
export function getCurrentTOTPCode(secret: string): string {
  try {
    return speakeasy.totp({
      secret,
      encoding: 'base32',
    })
  } catch (error) {
    console.error('[TOTP] Code generation failed:', error instanceof Error ? error.message : error)
    return ''
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Store TOTP secret for user after verification
 *
 * Called after user confirms TOTP setup by entering correct code.
 *
 * @param userId - User ID
 * @param secret - Base32-encoded TOTP secret
 * @param backupCodes - Backup codes (will be hashed before storage)
 * @returns Promise<void>
 */
export async function enableTOTP(userId: string, secret: string, backupCodes: string[]): Promise<void> {
  try {
    // Store TOTP secret in user profile
    await query(
      `UPDATE "User" SET "totpEnabled" = true, "totpSecret" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [secret, userId]
    )

    // Store backup codes
    for (const code of backupCodes) {
      await query(
        `INSERT INTO "backup_codes" (
          "id",
          "userId",
          "code",
          "used",
          "createdAt"
        ) VALUES ($1, $2, $3, false, NOW())`,
        [randomUUID(), userId, code]
      )
    }

    console.log(`[TOTP] Enabled for user ${userId} with ${backupCodes.length} backup codes`)
  } catch (error) {
    console.error('[TOTP] Enable failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to enable TOTP: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Disable TOTP for user
 *
 * Also revokes all backup codes.
 *
 * @param userId - User ID
 * @returns Promise<void>
 */
export async function disableTOTP(userId: string): Promise<void> {
  try {
    // Clear TOTP secret
    await query(
      `UPDATE "User" SET "totpEnabled" = false, "totpSecret" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
      [userId]
    )

    // Mark backup codes as used
    await query(
      `UPDATE "backup_codes" SET "used" = true WHERE "userId" = $1`,
      [userId]
    )

    console.log(`[TOTP] Disabled for user ${userId}`)
  } catch (error) {
    console.error('[TOTP] Disable failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to disable TOTP: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get TOTP secret for user
 *
 * @param userId - User ID
 * @returns Promise<string | null> - TOTP secret or null if not set
 */
export async function getUserTOTPSecret(userId: string): Promise<string | null> {
  try {
    const result = await query(
      `SELECT "totpSecret" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return result.rows[0].totpSecret
  } catch (error) {
    console.error('[TOTP] Get secret failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Check if TOTP is enabled for user
 *
 * @param userId - User ID
 * @returns Promise<boolean>
 */
export async function isTOTPEnabled(userId: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT "totpEnabled" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return false
    }

    return result.rows[0].totpEnabled === true
  } catch (error) {
    console.error('[TOTP] Check failed:', error instanceof Error ? error.message : error)
    return false
  }
}

// ============================================================================
// BACKUP CODE OPERATIONS
// ============================================================================

/**
 * Validate and consume backup code
 *
 * Can be used as fallback authentication method if TOTP device is lost.
 * Each code can only be used once.
 *
 * @param userId - User ID
 * @param code - Backup code (with or without dashes)
 * @returns Promise<boolean> - True if code is valid and not yet used
 *
 * @example
 * const valid = await useBackupCode(userId, 'XXXX-XXXX')
 * if (valid) {
 *   // Grant access
 *   // Code is automatically marked as used
 * }
 */
export async function useBackupCode(userId: string, code: string): Promise<boolean> {
  try {
    // Normalize code (remove dashes)
    const normalizedCode = code.toUpperCase().replace('-', '')

    // Find and validate backup code
    const result = await query(
      `SELECT "id" FROM "backup_codes"
       WHERE "userId" = $1 AND "code" = $2 AND "used" = false
       LIMIT 1`,
      [userId, normalizedCode]
    )

    if (result.rows.length === 0) {
      console.log(`[TOTP] Invalid or used backup code for user ${userId}`)
      return false
    }

    const codeId = result.rows[0].id

    // Mark code as used
    await query(
      `UPDATE "backup_codes" SET "used" = true, "usedAt" = NOW() WHERE "id" = $1`,
      [codeId]
    )

    console.log(`[TOTP] Backup code used for user ${userId}`)
    return true
  } catch (error) {
    console.error('[TOTP] Backup code validation failed:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Get remaining backup codes count for user
 *
 * @param userId - User ID
 * @returns Promise<number> - Count of unused backup codes
 */
export async function getRemainingBackupCodes(userId: string): Promise<number> {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM "backup_codes"
       WHERE "userId" = $1 AND "used" = false`,
      [userId]
    )

    return parseInt(result.rows[0].count, 10) || 0
  } catch (error) {
    console.error('[TOTP] Count backup codes failed:', error instanceof Error ? error.message : error)
    return 0
  }
}

// ============================================================================
// DEVICE TRUST MANAGEMENT
// ============================================================================

/**
 * Register trusted device
 *
 * Allows users to skip TOTP on trusted devices.
 * Device identification based on user agent and IP address.
 *
 * @param userId - User ID
 * @param userAgent - User agent string
 * @param ipAddress - IP address
 * @returns Promise<string> - Device ID
 */
export async function trustDevice(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<string> {
  try {
    const deviceId = randomUUID()

    await query(
      `INSERT INTO "trusted_devices" (
        "id",
        "userId",
        "userAgent",
        "ipAddress",
        "isTrusted",
        "lastUsedAt",
        "createdAt"
      ) VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [deviceId, userId, userAgent || null, ipAddress || null]
    )

    console.log(`[TOTP] Device ${deviceId} trusted for user ${userId}`)
    return deviceId
  } catch (error) {
    console.error('[TOTP] Trust device failed:', error instanceof Error ? error.message : error)
    throw new Error(`Failed to trust device: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Check if device is trusted
 *
 * @param userId - User ID
 * @param userAgent - User agent string
 * @param ipAddress - IP address
 * @returns Promise<boolean>
 */
export async function isDeviceTrusted(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<boolean> {
  try {
    const result = await query(
      `SELECT "id" FROM "trusted_devices"
       WHERE "userId" = $1 AND "isTrusted" = true
       AND ("userAgent" = $2 OR "ipAddress" = $3)
       LIMIT 1`,
      [userId, userAgent || null, ipAddress || null]
    )

    if (result.rows.length > 0) {
      // Update last used time
      await query(
        `UPDATE "trusted_devices" SET "lastUsedAt" = NOW() WHERE "id" = $1`,
        [result.rows[0].id]
      )
      return true
    }

    return false
  } catch (error) {
    console.error('[TOTP] Check trusted device failed:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Revoke trusted device
 *
 * @param deviceId - Device ID
 * @returns Promise<boolean>
 */
export async function revokeTrustedDevice(deviceId: string): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE "trusted_devices" SET "isTrusted" = false WHERE "id" = $1`,
      [deviceId]
    )

    return result.rowCount > 0
  } catch (error) {
    console.error('[TOTP] Revoke device failed:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Get all trusted devices for user
 *
 * @param userId - User ID
 * @returns Promise<UserDevice[]>
 */
export async function getTrustedDevices(userId: string): Promise<UserDevice[]> {
  try {
    const result = await query(
      `SELECT * FROM "trusted_devices"
       WHERE "userId" = $1 AND "isTrusted" = true
       ORDER BY "lastUsedAt" DESC`,
      [userId]
    )

    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      isTrusted: row.isTrusted,
      lastUsedAt: new Date(row.lastUsedAt),
      createdAt: new Date(row.createdAt),
    }))
  } catch (error) {
    console.error('[TOTP] Get devices failed:', error instanceof Error ? error.message : error)
    return []
  }
}
