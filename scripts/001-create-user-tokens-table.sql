-- Create user_tokens table for JWT token storage
-- Purpose: Store JWT tokens for authentication and token management
-- Created: November 21, 2025

CREATE TABLE IF NOT EXISTS "user_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "type" VARCHAR(50) NOT NULL DEFAULT 'access', -- access, refresh, reset-password
  "expiresAt" TIMESTAMP NOT NULL,
  "isRevoked" BOOLEAN DEFAULT FALSE,
  "revokedAt" TIMESTAMP,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX "idx_user_tokens_userId" ON "user_tokens" ("userId");
CREATE INDEX "idx_user_tokens_token" ON "user_tokens" ("token");
CREATE INDEX "idx_user_tokens_type" ON "user_tokens" ("type");
CREATE INDEX "idx_user_tokens_expiresAt" ON "user_tokens" ("expiresAt");
CREATE INDEX "idx_user_tokens_isRevoked" ON "user_tokens" ("isRevoked");

-- Constraint: Ensure token is unique
ALTER TABLE "user_tokens" ADD CONSTRAINT "uk_user_tokens_token" UNIQUE ("token");

-- Constraint: Foreign key to users table
ALTER TABLE "user_tokens" ADD CONSTRAINT "fk_user_tokens_userId" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;

-- Comment for documentation
COMMENT ON TABLE "user_tokens" IS 'Stores JWT tokens for authentication. Supports access tokens, refresh tokens, and password reset tokens.';
COMMENT ON COLUMN "user_tokens"."type" IS 'Token type: access (authentication), refresh (token renewal), reset-password (password recovery)';
COMMENT ON COLUMN "user_tokens"."isRevoked" IS 'Whether the token has been revoked (logout or explicit invalidation)';
