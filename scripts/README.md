# Database Migration Scripts

## Migration 002: Add User Onboarding Fields

This migration adds onboarding tracking fields to the User table:
- `eulaAccepted` (BOOLEAN, default: false) - Whether user accepted EULA
- `onboardingCompleted` (BOOLEAN, default: false) - Whether user completed onboarding
- `onboardingCompletedAt` (TIMESTAMP, nullable) - When onboarding was completed

### Usage

```bash
# Make sure DATABASE_URL is set in your .env file
tsx scripts/run-migration-002.ts
```

Or add to package.json:
```json
"scripts": {
  "migrate:onboarding": "tsx scripts/run-migration-002.ts"
}
```

Then run:
```bash
npm run migrate:onboarding
```

### What it does

1. Adds `eulaAccepted` column to User table (defaults to false)
2. Adds `onboardingCompleted` column to User table (defaults to false)
3. Adds `onboardingCompletedAt` column to User table (nullable)
4. Creates indexes for performance:
   - `idx_user_onboardingCompleted`
   - `idx_user_eulaAccepted`

### Requirements

- `DATABASE_URL` environment variable must be set
- Database connection must be accessible
- User must have ALTER TABLE permissions

### Notes

- This migration is idempotent (uses `IF NOT EXISTS`)
- Safe to run multiple times
- Existing users will have default values (false, false, null)

## Grant Premium Access to All Users

This script grants premium access to all existing users in the database by creating `ToolSubscription` records with `planId='premium'` and `status='active'`.

### Usage

```bash
# Make sure DATABASE_URL is set in your .env file
npm run grant-premium
```

### What it does

1. Fetches all users from the database
2. For each user:
   - Checks if they already have an active premium subscription
   - If not, creates a new `ToolSubscription` record with:
     - `planId`: 'premium'
     - `status`: 'active'
     - `currentPeriodStart`: Current date
     - `currentPeriodEnd`: 1 year from now
3. Skips users who already have premium access
4. Reports summary of upgrades

### Requirements

- `DATABASE_URL` environment variable must be set
- Database connection must be accessible
- User must have write permissions to `ToolSubscription` table

### Notes

- This script is idempotent - it's safe to run multiple times
- Users who already have premium subscriptions will be skipped
- The script uses `ON CONFLICT DO UPDATE` to handle duplicate subscriptions gracefully
