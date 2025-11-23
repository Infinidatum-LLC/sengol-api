-- Add onboarding fields to User table
-- Purpose: Track user onboarding status, EULA acceptance, and completion
-- Created: January 2025

-- Add eulaAccepted column (boolean, defaults to false)
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "eulaAccepted" BOOLEAN DEFAULT FALSE;

-- Add onboardingCompleted column (boolean, defaults to false)
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN DEFAULT FALSE;

-- Add onboardingCompletedAt column (timestamp, nullable)
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN "User"."eulaAccepted" IS 'Whether the user has accepted the End User License Agreement (EULA)';
COMMENT ON COLUMN "User"."onboardingCompleted" IS 'Whether the user has completed the onboarding process';
COMMENT ON COLUMN "User"."onboardingCompletedAt" IS 'Timestamp when the user completed onboarding';

-- Create index for onboarding queries
CREATE INDEX IF NOT EXISTS "idx_user_onboardingCompleted" ON "User" ("onboardingCompleted");
CREATE INDEX IF NOT EXISTS "idx_user_eulaAccepted" ON "User" ("eulaAccepted");

