-- 2FA Database Migration Script
-- Adds all necessary tables and columns for TOTP support

-- ============================================================================
-- ALTER USER TABLE TO ADD 2FA SUPPORT
-- ============================================================================

-- Add 2FA columns to User table
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "totpSecret" VARCHAR(255);

-- Create index for TOTP lookups
CREATE INDEX IF NOT EXISTS idx_user_totp_enabled ON "User"("totpEnabled");

-- ============================================================================
-- CREATE BACKUP CODES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "backup_codes" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  "code" VARCHAR(10) NOT NULL,
  "used" BOOLEAN DEFAULT false,
  "usedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_backup_codes_user FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create indexes for backup codes
CREATE INDEX IF NOT EXISTS idx_backup_codes_userId ON "backup_codes"("userId");
CREATE INDEX IF NOT EXISTS idx_backup_codes_used ON "backup_codes"("used");
CREATE INDEX IF NOT EXISTS idx_backup_codes_code ON "backup_codes"("code");

-- ============================================================================
-- CREATE TRUSTED DEVICES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "trusted_devices" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  "userAgent" TEXT,
  "ipAddress" VARCHAR(45),
  "isTrusted" BOOLEAN DEFAULT true,
  "lastUsedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trusted_devices_user FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create indexes for trusted devices
CREATE INDEX IF NOT EXISTS idx_trusted_devices_userId ON "trusted_devices"("userId");
CREATE INDEX IF NOT EXISTS idx_trusted_devices_isTrusted ON "trusted_devices"("isTrusted");
CREATE INDEX IF NOT EXISTS idx_trusted_devices_lastUsedAt ON "trusted_devices"("lastUsedAt");

-- ============================================================================
-- VERIFY TABLES CREATED
-- ============================================================================

-- Check if User table has new columns
SELECT
  column_name,
  data_type
FROM
  information_schema.columns
WHERE
  table_name = 'User'
  AND column_name IN ('totpEnabled', 'totpSecret');

-- Check if backup_codes table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'backup_codes'
) AS backup_codes_exists;

-- Check if trusted_devices table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'trusted_devices'
) AS trusted_devices_exists;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
--
-- Run this script once on your database to enable 2FA support.
-- All three components are now ready:
-- 1. User table has totpEnabled and totpSecret columns
-- 2. backup_codes table for recovery codes
-- 3. trusted_devices table for device management
--
-- Next step: Restart your application to pick up schema changes
--