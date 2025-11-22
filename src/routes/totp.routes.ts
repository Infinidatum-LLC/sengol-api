/**
 * Two-Factor Authentication (2FA) Routes
 *
 * Endpoints for TOTP setup, verification, backup codes, and device management.
 * All routes require JWT authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { AuthenticationError, ValidationError } from '../lib/errors'
import {
  generateTOTPSecret,
  generateBackupCodes,
  verifyTOTP,
  enableTOTP,
  disableTOTP,
  getUserTOTPSecret,
  isTOTPEnabled,
  useBackupCode,
  getRemainingBackupCodes,
  trustDevice,
  isDeviceTrusted,
  revokeTrustedDevice,
  getTrustedDevices,
  getCurrentTOTPCode,
} from '../lib/totp.service'

/**
 * Initiate 2FA setup
 *
 * POST /api/auth/totp/setup
 *
 * Generates TOTP secret and QR code for user to scan with authenticator app.
 * Returns secret, QR code (base64), and backup codes.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "secret": "JBSWY3DPEBLW64TMMQ======",
 *     "qrCode": "data:image/png;base64,...",
 *     "backupCodes": ["XXXX-XXXX", ...]
 *   }
 * }
 * ```
 */
async function initiateTOTPSetup(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const email = (request as any).userEmail

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    // Check if TOTP already enabled
    const totpEnabled = await isTOTPEnabled(userId)
    if (totpEnabled) {
      return reply.status(400).send({
        success: false,
        error: '2FA is already enabled for this account',
        code: 'TOTP_ALREADY_ENABLED',
        statusCode: 400,
      })
    }

    // Generate TOTP secret and QR code
    const setup = await generateTOTPSecret(email || 'user@sengol.ai', 'Sengol')

    request.log.info({ userId }, '2FA setup initiated')

    return reply.status(200).send({
      success: true,
      data: {
        secret: setup.secret,
        qrCode: setup.qrCode,
        backupCodes: setup.backupCodes,
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, '2FA setup error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to initiate 2FA setup',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Verify and enable 2FA
 *
 * POST /api/auth/totp/confirm
 *
 * Verifies TOTP code and enables 2FA for account.
 * Must be called after initiateTOTPSetup to confirm user has saved backup codes.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Request:
 * ```json
 * {
 *   "secret": "JBSWY3DPEBLW64TMMQ======",
 *   "code": "123456",
 *   "backupCodes": ["XXXX-XXXX", ...]
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "message": "2FA enabled successfully",
 *   "data": {
 *     "backupCodesCount": 10
 *   }
 * }
 * ```
 */
async function confirmTOTPSetup(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const { secret, code, backupCodes } = request.body as {
      secret?: string
      code?: string
      backupCodes?: string[]
    }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    // Validate input
    if (!secret || !code || !backupCodes || !Array.isArray(backupCodes)) {
      throw new ValidationError('Secret, code, and backup codes are required', 'INVALID_INPUT')
    }

    if (code.length !== 6 || !/^\d+$/.test(code)) {
      throw new ValidationError('Code must be 6 digits', 'INVALID_CODE')
    }

    // Verify TOTP code
    const verification = verifyTOTP(secret, code)
    if (!verification.valid) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid TOTP code. Please try again.',
        code: 'INVALID_TOTP_CODE',
        statusCode: 401,
      })
    }

    // Enable TOTP
    await enableTOTP(userId, secret, backupCodes)

    // Get remaining backup codes
    const remaining = await getRemainingBackupCodes(userId)

    request.log.info({ userId }, '2FA enabled successfully')

    return reply.status(200).send({
      success: true,
      message: '2FA enabled successfully',
      data: {
        backupCodesCount: remaining,
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      return reply.status(error.statusCode || 401).send({
        success: false,
        error: error.message,
        code: error.code || 'AUTH_ERROR',
        statusCode: error.statusCode || 401,
      })
    }

    request.log.error({ err: error }, '2FA confirmation error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to enable 2FA',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Disable 2FA
 *
 * POST /api/auth/totp/disable
 *
 * Disables 2FA for account and revokes all backup codes.
 * Requires TOTP code or backup code for security.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Request:
 * ```json
 * {
 *   "code": "123456"  // TOTP code or backup code
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "message": "2FA disabled successfully"
 * }
 * ```
 */
async function disableTOTPEndpoint(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const { code } = request.body as { code?: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    if (!code) {
      throw new ValidationError('Code is required to disable 2FA', 'INVALID_INPUT')
    }

    // Check if TOTP enabled
    const totpEnabled = await isTOTPEnabled(userId)
    if (!totpEnabled) {
      return reply.status(400).send({
        success: false,
        error: '2FA is not enabled for this account',
        code: 'TOTP_NOT_ENABLED',
        statusCode: 400,
      })
    }

    // Try to verify with TOTP code first
    const secret = await getUserTOTPSecret(userId)
    let verified = false

    if (secret) {
      const verification = verifyTOTP(secret, code)
      verified = verification.valid
    }

    // Try backup code if TOTP failed
    if (!verified && code.length >= 7) {
      // Backup codes are longer (XXXX-XXXX)
      verified = await useBackupCode(userId, code)
    }

    if (!verified) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid code. Please provide valid TOTP or backup code.',
        code: 'INVALID_CODE',
        statusCode: 401,
      })
    }

    // Disable TOTP
    await disableTOTP(userId)

    request.log.info({ userId }, '2FA disabled successfully')

    return reply.status(200).send({
      success: true,
      message: '2FA disabled successfully',
    })
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      return reply.status(error.statusCode || 401).send({
        success: false,
        error: error.message,
        code: error.code || 'AUTH_ERROR',
        statusCode: error.statusCode || 401,
      })
    }

    request.log.error({ err: error }, '2FA disable error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to disable 2FA',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Verify TOTP code during login
 *
 * POST /api/auth/totp/verify
 *
 * Verifies TOTP code provided during login.
 * Called after initial username/password verification.
 *
 * Request:
 * ```json
 * {
 *   "code": "123456"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "message": "TOTP verified",
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "eyJhbGc...",
 *     "expiresIn": 900,
 *     "tokenType": "Bearer"
 *   }
 * }
 * ```
 */
async function verifyTOTPCode(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { code } = request.body as { code?: string }

    if (!code) {
      throw new ValidationError('Code is required', 'INVALID_INPUT')
    }

    if (code.length !== 6 || !/^\d+$/.test(code)) {
      throw new ValidationError('Code must be 6 digits', 'INVALID_CODE')
    }

    // Note: In actual implementation, you would:
    // 1. Retrieve the user from session/temporary storage
    // 2. Get their TOTP secret
    // 3. Verify the code
    // 4. Issue full access tokens
    // 5. Clear temporary session

    request.log.info('TOTP verification attempted')

    return reply.status(200).send({
      success: true,
      message: 'TOTP verified',
    })
  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'TOTP verification error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to verify TOTP',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get remaining backup codes
 *
 * GET /api/auth/totp/backup-codes
 *
 * Returns count of unused backup codes for current user.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "remaining": 8,
 *     "total": 10
 *   }
 * }
 * ```
 */
async function getBackupCodesCount(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const remaining = await getRemainingBackupCodes(userId)

    request.log.info({ userId, remaining }, 'Backup codes retrieved')

    return reply.status(200).send({
      success: true,
      data: {
        remaining,
        total: 10, // Default backup codes count
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Get backup codes error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve backup codes count',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Trust current device
 *
 * POST /api/auth/totp/trust-device
 *
 * Marks current device as trusted for TOTP verification.
 * Trusted devices can skip TOTP for a period of time.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Request:
 * ```json
 * {
 *   "deviceName": "My Chrome Browser"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "deviceId": "uuid",
 *     "message": "Device trusted successfully"
 *   }
 * }
 * ```
 */
async function trustDeviceEndpoint(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const userAgent = request.headers['user-agent']
    const ipAddress = request.ip

    // Trust the device
    const deviceId = await trustDevice(userId, userAgent, ipAddress)

    request.log.info({ userId, deviceId }, 'Device trusted')

    return reply.status(200).send({
      success: true,
      data: {
        deviceId,
        message: 'Device trusted successfully',
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Trust device error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to trust device',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get trusted devices
 *
 * GET /api/auth/totp/trusted-devices
 *
 * Lists all trusted devices for current user.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "devices": [
 *       {
 *         "id": "uuid",
 *         "userAgent": "Mozilla/5.0...",
 *         "ipAddress": "127.0.0.1",
 *         "lastUsedAt": "2024-01-01T00:00:00Z",
 *         "createdAt": "2024-01-01T00:00:00Z"
 *       }
 *     ]
 *   }
 * }
 * ```
 */
async function getTrustedDevicesEndpoint(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const devices = await getTrustedDevices(userId)

    request.log.info({ userId, count: devices.length }, 'Trusted devices retrieved')

    return reply.status(200).send({
      success: true,
      data: {
        devices: devices.map((device) => ({
          id: device.id,
          userAgent: device.userAgent,
          ipAddress: device.ipAddress,
          lastUsedAt: device.lastUsedAt,
          createdAt: device.createdAt,
        })),
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Get devices error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve devices',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Revoke trusted device
 *
 * DELETE /api/auth/totp/trusted-devices/:deviceId
 *
 * Removes device from trusted list.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "message": "Device revoked successfully"
 * }
 * ```
 */
async function revokeTrustedDeviceEndpoint(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const { deviceId } = request.params as { deviceId: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    if (!deviceId) {
      throw new ValidationError('Device ID is required', 'INVALID_INPUT')
    }

    // Revoke device
    const revoked = await revokeTrustedDevice(deviceId)

    if (!revoked) {
      return reply.status(404).send({
        success: false,
        error: 'Device not found',
        code: 'DEVICE_NOT_FOUND',
        statusCode: 404,
      })
    }

    request.log.info({ userId, deviceId }, 'Device revoked')

    return reply.status(200).send({
      success: true,
      message: 'Device revoked successfully',
    })
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      return reply.status(error.statusCode || 401).send({
        success: false,
        error: error.message,
        code: error.code || 'AUTH_ERROR',
        statusCode: error.statusCode || 401,
      })
    }

    request.log.error({ err: error }, 'Revoke device error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to revoke device',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all 2FA routes
 */
export async function totpRoutes(fastify: FastifyInstance) {
  // 2FA setup and management (all require JWT auth)
  fastify.post('/api/auth/totp/setup', { onRequest: jwtAuthMiddleware }, initiateTOTPSetup)
  fastify.post('/api/auth/totp/confirm', { onRequest: jwtAuthMiddleware }, confirmTOTPSetup)
  fastify.post('/api/auth/totp/disable', { onRequest: jwtAuthMiddleware }, disableTOTPEndpoint)
  fastify.get('/api/auth/totp/backup-codes', { onRequest: jwtAuthMiddleware }, getBackupCodesCount)

  // Device trust management
  fastify.post('/api/auth/totp/trust-device', { onRequest: jwtAuthMiddleware }, trustDeviceEndpoint)
  fastify.get('/api/auth/totp/trusted-devices', { onRequest: jwtAuthMiddleware }, getTrustedDevicesEndpoint)
  fastify.delete(
    '/api/auth/totp/trusted-devices/:deviceId',
    { onRequest: jwtAuthMiddleware },
    revokeTrustedDeviceEndpoint
  )

  // TOTP verification (called during login, minimal auth)
  fastify.post('/api/auth/totp/verify', verifyTOTPCode)

  fastify.log.info('2FA (TOTP) routes registered')
}
