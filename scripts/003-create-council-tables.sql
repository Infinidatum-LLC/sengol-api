-- Migration: Create AI Risk Council tables
-- Description: Creates Policy, AssessmentSchedule, PolicyViolation, and ensures ProductAccess table exists
-- Date: 2025-01-XX

-- Create Policy table for AI Risk Council policies
CREATE TABLE IF NOT EXISTS "Policy" (
  "id" VARCHAR(255) PRIMARY KEY,
  "geographyAccountId" VARCHAR(255) NOT NULL DEFAULT 'default',
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "category" VARCHAR(100),
  "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on Policy table
CREATE INDEX IF NOT EXISTS "idx_policy_geographyAccountId" ON "Policy" ("geographyAccountId");
CREATE INDEX IF NOT EXISTS "idx_policy_status" ON "Policy" ("status");
CREATE INDEX IF NOT EXISTS "idx_policy_createdAt" ON "Policy" ("createdAt");

-- Create AssessmentSchedule table for scheduled assessments
CREATE TABLE IF NOT EXISTS "AssessmentSchedule" (
  "id" VARCHAR(255) PRIMARY KEY,
  "geographyAccountId" VARCHAR(255) NOT NULL DEFAULT 'default',
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "frequency" VARCHAR(100),
  "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  "nextRunAt" TIMESTAMP,
  "lastRunAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on AssessmentSchedule table
CREATE INDEX IF NOT EXISTS "idx_assessmentSchedule_geographyAccountId" ON "AssessmentSchedule" ("geographyAccountId");
CREATE INDEX IF NOT EXISTS "idx_assessmentSchedule_status" ON "AssessmentSchedule" ("status");
CREATE INDEX IF NOT EXISTS "idx_assessmentSchedule_nextRunAt" ON "AssessmentSchedule" ("nextRunAt");

-- Create PolicyViolation table for policy violations
CREATE TABLE IF NOT EXISTS "PolicyViolation" (
  "id" VARCHAR(255) PRIMARY KEY,
  "geographyAccountId" VARCHAR(255) NOT NULL DEFAULT 'default',
  "policyId" VARCHAR(255) NOT NULL,
  "assessmentId" VARCHAR(255),
  "severity" VARCHAR(50) NOT NULL DEFAULT 'medium',
  "status" VARCHAR(50) NOT NULL DEFAULT 'open',
  "description" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on PolicyViolation table
CREATE INDEX IF NOT EXISTS "idx_policyViolation_geographyAccountId" ON "PolicyViolation" ("geographyAccountId");
CREATE INDEX IF NOT EXISTS "idx_policyViolation_policyId" ON "PolicyViolation" ("policyId");
CREATE INDEX IF NOT EXISTS "idx_policyViolation_status" ON "PolicyViolation" ("status");
CREATE INDEX IF NOT EXISTS "idx_policyViolation_severity" ON "PolicyViolation" ("severity");

-- Create ProductAccess table if it doesn't exist (for council status checks)
CREATE TABLE IF NOT EXISTS "ProductAccess" (
  "id" VARCHAR(255) PRIMARY KEY,
  "userId" VARCHAR(255) NOT NULL,
  "productSlug" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP,
  "grantedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on ProductAccess table
CREATE INDEX IF NOT EXISTS "idx_productAccess_userId" ON "ProductAccess" ("userId");
CREATE INDEX IF NOT EXISTS "idx_productAccess_productSlug" ON "ProductAccess" ("productSlug");
CREATE INDEX IF NOT EXISTS "idx_productAccess_status" ON "ProductAccess" ("status");

-- Add comments for documentation
COMMENT ON TABLE "Policy" IS 'AI Risk Council policies for governance';
COMMENT ON TABLE "AssessmentSchedule" IS 'Scheduled risk assessments for AI Risk Council';
COMMENT ON TABLE "PolicyViolation" IS 'Policy violations detected during assessments';
COMMENT ON TABLE "ProductAccess" IS 'User product access permissions';

