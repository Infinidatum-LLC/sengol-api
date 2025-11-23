-- Migration: Create Vendor table for AI Risk Council
-- Description: Creates Vendor table for managing AI vendors and their risk assessments
-- Date: 2025-01-XX

-- Create Vendor table
CREATE TABLE IF NOT EXISTS "Vendor" (
  "id" VARCHAR(255) PRIMARY KEY,
  "geographyAccountId" VARCHAR(255) NOT NULL DEFAULT 'default',
  "name" VARCHAR(255) NOT NULL,
  "vendorType" VARCHAR(100),
  "riskTier" VARCHAR(50),
  "category" VARCHAR(100),
  "description" TEXT,
  "website" VARCHAR(500),
  "status" VARCHAR(50) NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes on Vendor table
CREATE INDEX IF NOT EXISTS "idx_vendor_geographyAccountId" ON "Vendor" ("geographyAccountId");
CREATE INDEX IF NOT EXISTS "idx_vendor_status" ON "Vendor" ("status");
CREATE INDEX IF NOT EXISTS "idx_vendor_riskTier" ON "Vendor" ("riskTier");
CREATE INDEX IF NOT EXISTS "idx_vendor_category" ON "Vendor" ("category");
CREATE INDEX IF NOT EXISTS "idx_vendor_createdAt" ON "Vendor" ("createdAt");

-- Add comment for documentation
COMMENT ON TABLE "Vendor" IS 'AI vendors managed in AI Risk Council';

