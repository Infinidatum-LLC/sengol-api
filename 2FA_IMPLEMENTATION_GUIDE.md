# Two-Factor Authentication (2FA) Implementation Guide

## Overview

This guide documents the complete 2FA infrastructure implementation using TOTP (Time-based One-Time Password) support for the Sengol API. The system provides enterprise-grade multi-factor authentication with backup codes and device trust management.

## Architecture

### Core Components

**1. TOTP Service** (`src/lib/totp.service.ts`)
- TOTP secret generation with RFC 6238 standard
- QR code generation for authenticator app setup
- TOTP code verification with time window tolerance (±2 steps)
- Backup code generation and management
- Device trust tracking

**2. 2FA Routes** (`src/routes/totp.routes.ts`)
- Complete HTTP endpoints for 2FA management
- Protected by JWT authentication middleware
- RESTful API design with proper HTTP status codes

**3. Database Integration**
- User TOTP storage in `User` table (`totpSecret`, `totpEnabled`)
- Backup codes in `backup_codes` table
- Trusted devices in `trusted_devices` table

### Database Schema Requirements

```sql
-- Add columns to User table
ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "User" ADD COLUMN "totpSecret" VARCHAR(255);

-- Create backup codes table
CREATE TABLE "backup_codes" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "code" VARCHAR(10) NOT NULL,
  "used" BOOLEAN DEFAULT false,
  "usedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Create trusted devices table
CREATE TABLE "trusted_devices" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "userAgent" TEXT,
  "ipAddress" VARCHAR(45),
  "isTrusted" BOOLEAN DEFAULT true,
  "lastUsedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_backup_codes_userId ON "backup_codes"("userId");
CREATE INDEX idx_backup_codes_used ON "backup_codes"("used");
CREATE INDEX idx_trusted_devices_userId ON "trusted_devices"("userId");
CREATE INDEX idx_trusted_devices_isTrusted ON "trusted_devices"("isTrusted");
```

## API Endpoints

### 1. Initiate 2FA Setup

**Endpoint:** `POST /api/auth/totp/setup`

Generates TOTP secret and QR code for user to scan with authenticator app.

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/totp/setup \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEBLW64TMMQ======",
    "qrCode": "data:image/png;base64,iVBORw0KG...",
    "backupCodes": [
      "XXXX-XXXX",
      "YYYY-YYYY",
      ...
    ]
  }
}
```

**Key Points:**
- Returns Base32-encoded secret for manual entry
- QR code is Base64 data URL (can be displayed in img tag)
- 10 backup codes for account recovery
- No changes applied until confirmed

### 2. Confirm 2FA Setup

**Endpoint:** `POST /api/auth/totp/confirm`

Verifies user has correct TOTP code and enables 2FA.

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/totp/confirm \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "JBSWY3DPEBLW64TMMQ======",
    "code": "123456",
    "backupCodes": ["XXXX-XXXX", ...]
  }'
```

**Response (200):**
```json
{
  "success": true,
  "message": "2FA enabled successfully",
  "data": {
    "backupCodesCount": 10
  }
}
```

**Error Responses:**
- `400`: 2FA already enabled, invalid input
- `401`: Invalid TOTP code

### 3. Disable 2FA

**Endpoint:** `POST /api/auth/totp/disable`

Disables 2FA (requires TOTP code or backup code for security).

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/totp/disable \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"code": "123456"}'
```

**Response (200):**
```json
{
  "success": true,
  "message": "2FA disabled successfully"
}
```

### 4. Get Backup Codes Count

**Endpoint:** `GET /api/auth/totp/backup-codes`

Returns count of remaining unused backup codes.

**Request:**
```bash
curl http://localhost:4000/api/auth/totp/backup-codes \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "remaining": 8,
    "total": 10
  }
}
```

### 5. Verify TOTP Code

**Endpoint:** `POST /api/auth/totp/verify`

Verifies TOTP code during login flow.

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/totp/verify \
  -H "Content-Type: application/json" \
  -d '{"code": "123456"}'
```

**Response (200):**
```json
{
  "success": true,
  "message": "TOTP verified"
}
```

### 6. Trust Device

**Endpoint:** `POST /api/auth/totp/trust-device`

Marks current device as trusted for TOTP verification.

**Request:**
```bash
curl -X POST http://localhost:4000/api/auth/totp/trust-device \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "deviceId": "uuid",
    "message": "Device trusted successfully"
  }
}
```

### 7. Get Trusted Devices

**Endpoint:** `GET /api/auth/totp/trusted-devices`

Lists all trusted devices for current user.

**Request:**
```bash
curl http://localhost:4000/api/auth/totp/trusted-devices \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "uuid",
        "userAgent": "Mozilla/5.0...",
        "ipAddress": "127.0.0.1",
        "lastUsedAt": "2024-01-01T00:00:00Z",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

### 8. Revoke Trusted Device

**Endpoint:** `DELETE /api/auth/totp/trusted-devices/:deviceId`

Removes device from trusted list.

**Request:**
```bash
curl -X DELETE http://localhost:4000/api/auth/totp/trusted-devices/{deviceId} \
  -H "Authorization: Bearer <accessToken>"
```

**Response (200):**
```json
{
  "success": true,
  "message": "Device revoked successfully"
}
```

## Implementation Flow

### Setup Flow (User Perspective)

```
1. User clicks "Enable 2FA"
   ↓
2. POST /api/auth/totp/setup
   ← Returns secret, QR code, backup codes
   ↓
3. User scans QR code with authenticator app
   (or manually enters secret)
   ↓
4. User saves backup codes securely
   ↓
5. User enters 6-digit code from authenticator
   ↓
6. POST /api/auth/totp/confirm
   ← 2FA enabled
```

### Login Flow (User Perspective)

```
1. User enters email/password
   ↓
2. POST /api/auth/login
   ← Normal auth (no change needed)
   ↓
3. Check if 2FA enabled
   ↓
4. If yes → Request TOTP code
   ↓
5. User enters 6-digit code from authenticator
   (or uses backup code if device lost)
   ↓
6. POST /api/auth/totp/verify
   ← Code verified
   ↓
7. Issue full access tokens
```

## Supported Authenticator Apps

Any RFC 6238-compliant authenticator app works:
- Google Authenticator
- Microsoft Authenticator
- Authy
- FreeOTP
- Authenticator (1Password)
- Bitwarden

## Features

### TOTP Verification

- **Time Window:** ±2 steps (60 seconds total)
- **Code Length:** 6 digits (standard)
- **Time Step:** 30 seconds
- **Algorithm:** HMAC-SHA1 (RFC 6238)

### Backup Codes

- **Count:** 10 codes per user
- **Format:** XXXX-XXXX (8 characters)
- **Usage:** One-time use, survives TOTP rotation
- **Recovery:** Can disable 2FA with backup code

### Device Trust

- **Identification:** User Agent + IP Address
- **Last Used:** Tracked for audit
- **Management:** Users can revoke devices
- **Purpose:** Skip TOTP on trusted devices (future enhancement)

## Code Examples

### Service Usage

```typescript
import {
  generateTOTPSecret,
  verifyTOTP,
  enableTOTP,
  useBackupCode,
  getTrustedDevices,
} from '../lib/totp.service'

// Generate setup
const setup = await generateTOTPSecret('user@example.com', 'MyApp')
// setup.secret, setup.qrCode, setup.backupCodes

// Verify code
const valid = verifyTOTP(secret, '123456')
// valid.valid === true

// Enable 2FA
await enableTOTP(userId, secret, backupCodes)

// Use backup code
const success = await useBackupCode(userId, 'XXXX-XXXX')

// Get devices
const devices = await getTrustedDevices(userId)
```

### Route Integration

Routes are automatically registered in `src/app.ts`:

```typescript
await fastify.register(totpRoutes) // All 2FA endpoints available
```

## Security Considerations

### Secret Storage

- Base32-encoded secrets stored in PostgreSQL
- Never transmitted to frontend after setup
- Secrets cannot be recovered if lost

### Backup Codes

- Should be presented in plaintext only once
- Users must save them securely
- Each code is single-use
- Cannot be regenerated if lost

### Device Trust

- Identified by User Agent and IP
- Not cryptographically bound to device
- Can be revoked from settings
- Useful for trusted home computers

### Time Sync

- TOTP relies on correct server time
- Verify system clock is synchronized
- Use NTP for production servers
- Allows ±2 time steps for clock skew

## Testing

### Manual Testing

```bash
# 1. Setup 2FA
API_URL=http://localhost:4000
TOKEN=$(curl -s -X POST $API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' | jq -r '.data.accessToken')

# 2. Initiate setup
curl $API_URL/api/auth/totp/setup \
  -H "Authorization: Bearer $TOKEN" | jq '.data.secret'

# 3. Get TOTP code (for testing)
# Use the secret with any TOTP generator
# Or use speakeasy in Node:
# speakeasy.totp({secret, encoding: 'base32'})

# 4. Confirm setup
curl -X POST $API_URL/api/auth/totp/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "secret":"...",
    "code":"123456",
    "backupCodes":[...]
  }'
```

### Unit Testing

```typescript
// Test TOTP verification
test('verifyTOTP accepts current code', () => {
  const secret = 'JBSWY3DPEBLW64TMMQ======'
  const code = speakeasy.totp({secret, encoding: 'base32'})
  const result = verifyTOTP(secret, code)
  expect(result.valid).toBe(true)
})

// Test backup code usage
test('useBackupCode marks code as used', async () => {
  const result = await useBackupCode(userId, 'XXXX-XXXX')
  expect(result).toBe(true)

  const secondUse = await useBackupCode(userId, 'XXXX-XXXX')
  expect(secondUse).toBe(false)
})
```

## Deployment

### Required Database Migrations

Before deploying, run:

```sql
-- Execute migration script in database
-- See "Database Schema Requirements" section above
```

### Environment Variables

No new environment variables required.

### Configuration

All configuration is in `src/lib/totp.service.ts`:

```typescript
const TOTP_WINDOW = 2 // Time window tolerance
const TOTP_STEP = 30 // Seconds per time step
const TOTP_DIGITS = 6 // Digits in code
const BACKUP_CODES_COUNT = 10 // Codes generated
const BACKUP_CODE_LENGTH = 8 // Characters per code
```

## Future Enhancements

1. **Device Trust Duration**: Add expiration for trusted devices
2. **Backup Code Regeneration**: Allow users to get new backup codes
3. **WebAuthn Support**: Add FIDO2/U2F for hardware keys
4. **Risk-Based Auth**: Prompt for 2FA on suspicious logins
5. **Recovery Codes**: Alternative to backup codes with better UX
6. **Admin Dashboard**: View 2FA status for all users
7. **Audit Logging**: Track 2FA events (setup, disable, verification)
8. **Push Notifications**: App-based approval instead of codes

## Troubleshooting

### TOTP Code Invalid

1. Check server time synchronization
2. Verify correct secret is being used
3. Check code within 30-second window
4. Try code from adjacent time window

### QR Code Not Scanning

1. Ensure display quality is sufficient
2. Try manual entry with secret
3. Check authenticator app supports QR codes
4. Verify correct URL format in secret

### Backup Codes Not Working

1. Verify code format (XXXX-XXXX)
2. Check code hasn't been used already
3. Ensure user still has 2FA enabled
4. Check code is for correct user account

## References

- [RFC 6238: TOTP](https://tools.ietf.org/html/rfc6238)
- [NIST Authentication Guidelines](https://pages.nist.gov/800-63-3/)
- [Speakeasy Library](https://github.com/speakeasyjs/speakeasy)
- [QRCode Library](https://github.com/davidshimjs/qrcodejs)

## Support

For issues or questions about 2FA implementation:

1. Check this guide's troubleshooting section
2. Review code comments in `src/lib/totp.service.ts`
3. Review API documentation in `src/routes/totp.routes.ts`
4. Check database tables for data integrity
