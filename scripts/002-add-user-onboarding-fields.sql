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

-- Create index for onboarding queries (must be created before comments)
CREATE INDEX IF NOT EXISTS "idx_user_onboardingCompleted" ON "User" ("onboardingCompleted");
CREATE INDEX IF NOT EXISTS "idx_user_eulaAccepted" ON "User" ("eulaAccepted");

-- Add comments for documentation (only if columns exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'eulaAccepted') THEN
        COMMENT ON COLUMN "User"."eulaAccepted" IS 'Whether the user has accepted the End User License Agreement (EULA)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'onboardingCompleted') THEN
        COMMENT ON COLUMN "User"."onboardingCompleted" IS 'Whether the user has completed the onboarding process';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'onboardingCompletedAt') THEN
        COMMENT ON COLUMN "User"."onboardingCompletedAt" IS 'Timestamp when the user completed onboarding';
    END IF;
END $$;

