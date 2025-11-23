# Database Migration Scripts

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
