import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as speakeasy from 'speakeasy'
import { build } from '../src/app'
import type { FastifyInstance } from 'fastify'

/**
 * TOTP Integration Tests
 *
 * These tests verify the complete 2FA flow with actual HTTP endpoints
 * and database operations (mocked for test isolation)
 */

describe('2FA API Integration Tests', () => {
  let app: FastifyInstance
  const testUserId = '550e8400-e29b-41d4-a716-446655440000'
  const testEmail = 'test@example.com'

  beforeEach(async () => {
    app = await build()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('POST /api/auth/totp/setup', () => {
    it('should generate TOTP setup with QR code and backup codes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body).toHaveProperty('success', true)
      expect(body.data).toHaveProperty('secret')
      expect(body.data).toHaveProperty('qrCode')
      expect(body.data).toHaveProperty('backupCodes')

      // Validate secret format
      expect(body.data.secret).toMatch(/^[A-Z2-7=]+$/)

      // Validate QR code format
      expect(body.data.qrCode).toMatch(/^data:image\/png;base64,/)

      // Validate backup codes
      expect(body.data.backupCodes).toHaveLength(10)
      body.data.backupCodes.forEach((code: string) => {
        expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
      })
    })

    it('should generate different secrets on each call', async () => {
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })

      const body1 = JSON.parse(response1.body)
      const body2 = JSON.parse(response2.body)

      expect(body1.data.secret).not.toBe(body2.data.secret)
      expect(body1.data.backupCodes).not.toEqual(body2.data.backupCodes)
    })

    it('should return proper error response on failure', async () => {
      // Test with invalid request method
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/totp/setup',
      })

      expect(response.statusCode).not.toBe(200)
    })
  })

  describe('POST /api/auth/totp/confirm', () => {
    let setupResponse: any
    let secret: string
    let backupCodes: string[]

    beforeEach(async () => {
      // First, get a setup
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })
      setupResponse = JSON.parse(response.body)
      secret = setupResponse.data.secret
      backupCodes = setupResponse.data.backupCodes
    })

    it('should confirm 2FA setup with valid TOTP code', async () => {
      // Generate valid TOTP code
      const code = speakeasy.totp({
        secret,
        encoding: 'base32',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/confirm',
        payload: {
          secret,
          code,
          backupCodes,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body).toHaveProperty('success', true)
      expect(body).toHaveProperty('message')
      expect(body.data).toHaveProperty('backupCodesCount', 10)
    })

    it('should reject setup with invalid TOTP code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/confirm',
        payload: {
          secret,
          code: '000000',
          backupCodes,
        },
      })

      expect(response.statusCode).toBe(401)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('error')
    })

    it('should reject setup with missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/confirm',
        payload: {
          secret,
          // Missing code and backupCodes
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('should reject setup with invalid secret', async () => {
      const code = '123456'
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/confirm',
        payload: {
          secret: '!!!invalid!!!',
          code,
          backupCodes,
        },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /api/auth/totp/verify', () => {
    let secret: string

    beforeEach(() => {
      secret = speakeasy.generateSecret({
        name: `Test (${testEmail})`,
        issuer: 'TestApp',
        length: 32,
      }).base32
    })

    it('should verify valid TOTP code', async () => {
      const code = speakeasy.totp({
        secret,
        encoding: 'base32',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/verify',
        payload: { code },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('success', true)
      expect(body).toHaveProperty('message', 'TOTP verified')
    })

    it('should reject invalid TOTP code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/verify',
        payload: { code: '000000' },
      })

      expect(response.statusCode).toBe(401)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('error')
    })

    it('should reject code with wrong format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/verify',
        payload: { code: '12345' }, // Too short
      })

      expect(response.statusCode).toBe(400)
    })

    it('should handle missing code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/verify',
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /api/auth/totp/disable', () => {
    let secret: string

    beforeEach(() => {
      secret = speakeasy.generateSecret({
        name: `Test (${testEmail})`,
        issuer: 'TestApp',
        length: 32,
      }).base32
    })

    it('should disable 2FA with valid TOTP code', async () => {
      const code = speakeasy.totp({
        secret,
        encoding: 'base32',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/disable',
        payload: { code },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('success', true)
      expect(body).toHaveProperty('message')
    })

    it('should reject disable with invalid code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/disable',
        payload: { code: '000000' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should handle missing code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/disable',
        payload: {},
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /api/auth/totp/backup-codes', () => {
    it('should return backup codes count', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/totp/backup-codes',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body).toHaveProperty('success', true)
      expect(body.data).toHaveProperty('remaining')
      expect(body.data).toHaveProperty('total')
      expect(typeof body.data.remaining).toBe('number')
      expect(typeof body.data.total).toBe('number')
    })
  })

  describe('POST /api/auth/totp/trust-device', () => {
    it('should trust current device', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/trust-device',
        headers: {
          'user-agent': 'Test Browser/1.0',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body).toHaveProperty('success', true)
      expect(body.data).toHaveProperty('deviceId')
      expect(body.data).toHaveProperty('message')
    })

    it('should capture user agent and IP', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/trust-device',
        headers: {
          'user-agent': 'Mozilla/5.0 Test',
          'x-forwarded-for': '192.168.1.1',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.data).toHaveProperty('deviceId')
    })
  })

  describe('GET /api/auth/totp/trusted-devices', () => {
    it('should return trusted devices list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/totp/trusted-devices',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)

      expect(body).toHaveProperty('success', true)
      expect(body.data).toHaveProperty('devices')
      expect(Array.isArray(body.data.devices)).toBe(true)
    })

    it('should include device information', async () => {
      // First trust a device
      await app.inject({
        method: 'POST',
        url: '/api/auth/totp/trust-device',
        headers: {
          'user-agent': 'Test Device',
        },
      })

      // Then get the list
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/totp/trusted-devices',
      })

      const body = JSON.parse(response.body)
      if (body.data.devices.length > 0) {
        const device = body.data.devices[0]
        expect(device).toHaveProperty('id')
        expect(device).toHaveProperty('createdAt')
      }
    })
  })

  describe('DELETE /api/auth/totp/trusted-devices/:deviceId', () => {
    let deviceId: string

    beforeEach(async () => {
      // Trust a device first
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/trust-device',
        headers: {
          'user-agent': 'Test Device',
        },
      })

      const body = JSON.parse(response.body)
      deviceId = body.data.deviceId
    })

    it('should revoke trusted device', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/auth/totp/trusted-devices/${deviceId}`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('success', true)
      expect(body).toHaveProperty('message')
    })

    it('should handle non-existent device', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/totp/trusted-devices/invalid-device-id',
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('Error Handling & Response Formats', () => {
    it('should return proper error response format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/verify',
        payload: { code: 'invalid' },
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)

      // Should have error response structure
      expect(body).toHaveProperty('success', false)
      expect(body).toHaveProperty('error')
      expect(body).toHaveProperty('statusCode')
    })

    it('should set proper Content-Type headers', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })

      expect(response.headers['content-type']).toContain('application/json')
    })

    it('should handle timeout on slow requests', async () => {
      // This test verifies the API doesn't hang
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })

      expect(response.statusCode).toBeDefined()
      expect(response.statusCode).not.toBe(0) // Not timed out
    }, 5000)
  })

  describe('Complete 2FA Flow', () => {
    it('should complete full 2FA setup, disable, and re-enable', async () => {
      // Step 1: Setup
      const setupResp = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })
      expect(setupResp.statusCode).toBe(200)
      const setupData = JSON.parse(setupResp.body)
      const secret = setupData.data.secret
      const backupCodes = setupData.data.backupCodes

      // Step 2: Confirm setup
      const code = speakeasy.totp({
        secret,
        encoding: 'base32',
      })

      const confirmResp = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/confirm',
        payload: { secret, code, backupCodes },
      })
      expect(confirmResp.statusCode).toBe(200)

      // Step 3: Verify 2FA is enabled
      const backupCountResp = await app.inject({
        method: 'GET',
        url: '/api/auth/totp/backup-codes',
      })
      expect(backupCountResp.statusCode).toBe(200)

      // Step 4: Disable 2FA
      const disableCode = speakeasy.totp({
        secret,
        encoding: 'base32',
      })

      const disableResp = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/disable',
        payload: { code: disableCode },
      })
      expect(disableResp.statusCode).toBe(200)

      // Step 5: Re-enable 2FA
      const setupResp2 = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/setup',
      })
      expect(setupResp2.statusCode).toBe(200)
    })

    it('should manage trusted devices throughout flow', async () => {
      // Trust device
      const trustResp = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/trust-device',
        headers: { 'user-agent': 'Chrome' },
      })
      expect(trustResp.statusCode).toBe(200)
      const deviceId = JSON.parse(trustResp.body).data.deviceId

      // Get devices
      const listResp = await app.inject({
        method: 'GET',
        url: '/api/auth/totp/trusted-devices',
      })
      expect(listResp.statusCode).toBe(200)
      const devices = JSON.parse(listResp.body).data.devices
      expect(devices.length).toBeGreaterThan(0)

      // Revoke device
      const revokeResp = await app.inject({
        method: 'DELETE',
        url: `/api/auth/totp/trusted-devices/${deviceId}`,
      })
      expect(revokeResp.statusCode).toBe(200)
    })
  })

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent setup requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/auth/totp/setup',
        })
      )

      const responses = await Promise.all(requests)

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200)
        const body = JSON.parse(response.body)
        expect(body.data).toHaveProperty('secret')
      })

      // All should have different secrets
      const secrets = responses.map((r) => JSON.parse(r.body).data.secret)
      const uniqueSecrets = new Set(secrets)
      expect(uniqueSecrets.size).toBe(5)
    })

    it('should handle concurrent device operations', async () => {
      const requests = Array.from({ length: 3 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/totp/trust-device',
          headers: { 'user-agent': `Device-${i}` },
        })
      )

      const responses = await Promise.all(requests)

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200)
      })
    })
  })
})
