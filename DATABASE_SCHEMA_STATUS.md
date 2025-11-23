# Database Schema Status

This document tracks the database schema status for all implemented routes and functionalities.

## ✅ Existing Tables (Verified)

### Core Tables
- ✅ `User` - User accounts with authentication
  - Includes: id, email, password, name, emailVerified, role, eulaAccepted, onboardingCompleted, onboardingCompletedAt
  - Migration: `002-add-user-onboarding-fields.sql`

- ✅ `Project` - User projects
  - Includes: id, userId, name, description, status, createdAt, updatedAt

- ✅ `RiskAssessment` - Risk assessments
  - Includes: id, userId, projectId, status, riskScore, complianceScore, sengolScore, riskNotes, createdAt, updatedAt

- ✅ `ToolSubscription` - User subscriptions
  - Includes: id, userId, planId, status, currentPeriodStart, currentPeriodEnd

- ✅ `Vendor` - AI Risk Council vendors
  - Includes: id, geographyAccountId, name, vendorType, riskTier, category, description, website, status

- ✅ `EmailVerification` - Email verification tokens
- ✅ `PasswordResetToken` - Password reset tokens
- ✅ `user_tokens` - User session tokens (Migration: `001-create-user-tokens-table.sql`)

## ⚠️ Required Tables (Need Migration)

### AI Risk Council Tables
The following tables are referenced in the routes but need to be created:

#### 1. `Policy` Table
**Status**: ❌ Needs Migration
**Used by**: 
- `/api/council/policies` (GET, POST, PUT, DELETE)
- `/api/council/policies/:id/evaluate`
- `/api/council/policies/evaluate-all`
- `/api/council/status`

**Required Columns**:
- `id` (VARCHAR(255), PRIMARY KEY)
- `geographyAccountId` (VARCHAR(255), NOT NULL, DEFAULT 'default')
- `name` (VARCHAR(255), NOT NULL)
- `description` (TEXT)
- `category` (VARCHAR(100))
- `status` (VARCHAR(50), NOT NULL, DEFAULT 'ACTIVE')
- `createdAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())
- `updatedAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())

**Indexes Needed**:
- `idx_policy_geographyAccountId` on `geographyAccountId`
- `idx_policy_status` on `status`
- `idx_policy_createdAt` on `createdAt`

#### 2. `AssessmentSchedule` Table
**Status**: ❌ Needs Migration
**Used by**: 
- `/api/council/schedules` (GET, POST, PUT, DELETE)
- `/api/council/schedules/:id/run-now`
- `/api/council/status`

**Required Columns**:
- `id` (VARCHAR(255), PRIMARY KEY)
- `geographyAccountId` (VARCHAR(255), NOT NULL, DEFAULT 'default')
- `name` (VARCHAR(255), NOT NULL)
- `description` (TEXT)
- `frequency` (VARCHAR(100))
- `status` (VARCHAR(50), NOT NULL, DEFAULT 'ACTIVE')
- `nextRunAt` (TIMESTAMP)
- `lastRunAt` (TIMESTAMP)
- `createdAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())
- `updatedAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())

**Indexes Needed**:
- `idx_assessmentSchedule_geographyAccountId` on `geographyAccountId`
- `idx_assessmentSchedule_status` on `status`
- `idx_assessmentSchedule_nextRunAt` on `nextRunAt`

#### 3. `PolicyViolation` Table
**Status**: ❌ Needs Migration
**Used by**: 
- `/api/council/violations` (GET)
- `/api/council/violations/:id` (PATCH)
- `/api/council/status`

**Required Columns**:
- `id` (VARCHAR(255), PRIMARY KEY)
- `geographyAccountId` (VARCHAR(255), NOT NULL, DEFAULT 'default')
- `policyId` (VARCHAR(255), NOT NULL)
- `assessmentId` (VARCHAR(255))
- `severity` (VARCHAR(50), NOT NULL, DEFAULT 'medium')
- `status` (VARCHAR(50), NOT NULL, DEFAULT 'open')
- `description` (TEXT)
- `resolution` (TEXT)
- `createdAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())
- `updatedAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())

**Indexes Needed**:
- `idx_policyViolation_geographyAccountId` on `geographyAccountId`
- `idx_policyViolation_policyId` on `policyId`
- `idx_policyViolation_status` on `status`
- `idx_policyViolation_severity` on `severity`

#### 4. `ProductAccess` Table
**Status**: ❌ Needs Migration (May exist, but needs verification)
**Used by**: 
- `/api/v1/council/product-access`
- `/api/council/status`

**Required Columns**:
- `id` (VARCHAR(255), PRIMARY KEY)
- `userId` (VARCHAR(255), NOT NULL)
- `productSlug` (VARCHAR(100), NOT NULL)
- `status` (VARCHAR(50), NOT NULL, DEFAULT 'active')
- `expiresAt` (TIMESTAMP)
- `grantedAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())
- `createdAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())
- `updatedAt` (TIMESTAMP, NOT NULL, DEFAULT NOW())

**Indexes Needed**:
- `idx_productAccess_userId` on `userId`
- `idx_productAccess_productSlug` on `productSlug`
- `idx_productAccess_status` on `status`

## Migration Script

A migration script has been created to create all required tables:

**File**: `scripts/003-create-council-tables.sql`
**Runner**: `scripts/run-migration-003.ts`
**Command**: `npm run migrate:council`

### To Run Migration

```bash
# Set DATABASE_URL in .env file
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migration
npm run migrate:council
```

## Summary

### Tables Status
- ✅ **8 tables** exist and are verified
- ❌ **4 tables** need to be created via migration

### Routes Status
- ✅ **All routes implemented** in code
- ⚠️ **4 routes** will fail until migration is run:
  - All `/api/council/policies/*` routes
  - All `/api/council/schedules/*` routes
  - All `/api/council/violations/*` routes
  - `/api/council/status` route (partial - will work but return 0 counts)

### Next Steps

1. **Run Migration**: Execute `npm run migrate:council` to create missing tables
2. **Verify**: Check that all tables exist and have correct columns
3. **Test**: Test all council routes to ensure they work correctly

## Notes

- All migrations are idempotent (use `IF NOT EXISTS`)
- Safe to run migrations multiple times
- All tables support multi-tenancy via `geographyAccountId`
- Indexes are created for performance optimization

