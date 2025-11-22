# Stub Implementations - Quick Reference

## ✅ Fixed
- **Deleted** `src/routes/auth.ts` - Unused stub file that conflicted with real implementation

## 🔴 Critical (Blocks Core Features)

### Email Sending
- **File**: `src/routes/auth.routes.ts:833`
- **Function**: `forgotPassword()` - Password reset email
- **Status**: TODO, no implementation
- **Fix**: Integrate email service (Resend/SendGrid)

### Feature Gates Service
- **File**: `src/services/feature-gates.service.ts`
- **Functions**: All return hardcoded values
  - `getUserTier()` → Always 'free'
  - `isUserAdmin()` → Always false
  - `countAssessmentsThisMonth()` → Always 0
  - `countUserProjects()` → Always 0
- **Fix**: Implement database queries

## 🟡 High Priority (Affects User Experience)

### Stripe Webhooks
- **File**: `src/routes/stripe-webhook.ts`
- **Functions**: All just log, don't update database
  - `handleSubscriptionCreated()`
  - `handleSubscriptionUpdated()`
  - `handleSubscriptionDeleted()`
  - `handlePaymentSucceeded()`
  - `handlePaymentFailed()`
- **Fix**: Implement database updates

### Subscription/Trial Queries
- **File**: `src/lib/subscription-queries.ts`
- **Functions**: Return hardcoded values
  - `getTrialStatus()` → Always inactive
  - `hasReachedTrialLimit()` → Always false
  - `incrementFeatureUsage()` → Always succeeds
  - `getFeatureUsage()` → Always 0
  - `startTrial()` → Doesn't save
  - `expireTrial()` → Doesn't update
- **Fix**: Implement database schema + queries

## 🟢 Medium Priority

### Health Check
- **File**: `src/routes/health.routes.ts:52`
- **Function**: Database connectivity check
- **Status**: Always returns 'ok' without checking
- **Fix**: Add real database ping

### Review Controller Auth
- **File**: `src/controllers/review.controller.ts:124`
- **Status**: TODO comment
- **Fix**: Add auth middleware

## 📋 Disabled Routes (Need Migration)

These routes are commented out in `src/app.ts`:
- `reviewRoutes`
- `riskRoutes`
- `projectsGatedRoutes`
- `questionsRoutes`
- `complianceRoutes`
- `registerAllRoutes` (Trial system)

**Reason**: Waiting for Prisma-to-raw-SQL migration

## 📝 Next Steps

1. **Immediate**: Implement email service for password reset
2. **Short-term**: Fix feature gates to query database
3. **Short-term**: Implement Stripe webhook database updates
4. **Medium-term**: Complete trial system database implementation
5. **Long-term**: Complete Prisma migration for disabled routes

