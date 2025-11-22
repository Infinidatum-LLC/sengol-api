# Files Requiring Refactoring - Complete Reference

## Overview
This document lists all files that need Prisma migration completion, organized by priority and type.

## Critical Files (HIGH PRIORITY - Must Fix)

### 1. Service File - STUBBED
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/services/feature-gates.service.ts`
- **Size**: 180 lines
- **Issue**: All functions return hardcoded values
- **Functions to Fix**:
  - `getUserTier()` - Returns hardcoded 'free'
  - `isUserAdmin()` - Returns hardcoded false
  - `countAssessmentsThisMonth()` - Returns hardcoded 0
  - `countUserProjects()` - Returns hardcoded 0
  - `getUserUsageSummary()` - Returns all zeros
- **Impact**: Feature gates don't work, all users treated as free tier
- **Estimated Effort**: 2-3 hours
- **SQL Needed**:
  ```sql
  SELECT tier FROM "User" WHERE id = $1
  SELECT role FROM "User" WHERE id = $1
  SELECT COUNT(*) FROM "RiskAssessment" WHERE userId = $1 AND createdAt >= NOW() - INTERVAL '30 days'
  SELECT COUNT(*) FROM "Project" WHERE userId = $1
  ```

### 2. Application Entry Point
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/app.ts`
- **Size**: 251 lines
- **Issue**: 9 route registrations disabled (commented out)
- **Lines to Uncomment**: 78-96
- **Routes to Enable**:
  - `healthRoutes`
  - `assessmentsRoutes`
  - `reviewRoutes`
  - `projectsRoutes`
  - `projectsGatedRoutes`
  - `questionsRoutes`
  - `complianceRoutes`
  - `riskRoutes`
- **Impact**: 29 API endpoints unavailable
- **Estimated Effort**: 30 minutes
- **Note**: All controller code exists and is ready

### 3. Health Check Routes
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/routes/health.routes.ts`
- **Size**: 90 lines
- **Issue**: Database connectivity check is stubbed (line 52)
- **TODO Comment**: "// TODO: Check database connectivity"
- **Current Behavior**: Returns hardcoded 'ok' status
- **Needed**: Actual database query to verify connectivity
- **SQL Needed**:
  ```sql
  SELECT 1 -- Simple connectivity test
  SELECT COUNT(*) FROM "User" -- Verify database is responsive
  ```
- **Estimated Effort**: 30 minutes

---

## Major Controllers (HIGH PRIORITY - Already Coded)

### 4. Assessments Controller
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/controllers/assessments.controller.ts`
- **Size**: 29,872 bytes
- **Status**: DISABLED (not registered)
- **Database Operations**:
  - `selectOne()` - Get assessment by ID
  - `insertOne()` - Create new assessment
  - `updateOne()` - Update assessment
- **Tables Used**: `RiskAssessment`, `Project`
- **Endpoints Defined**: 12
  - `POST /api/assessments` - Create
  - `GET /api/assessments/:id` - Get
  - `PUT /api/assessments/:id/step1-3` - Update steps
  - `POST /api/assessments/:id/submit` - Submit
  - `GET /api/assessments/:id/scores` - Get scores
  - `GET /api/assessments/:id/benchmark` - Get benchmark
  - `GET /api/assessments/:id/similar-cases` - Get similar cases
- **Dependencies**: `feature-gates.service.ts` (stub dependency)
- **Status**: Code ready, needs route enablement

### 5. Review Controller
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/controllers/review.controller.ts`
- **Size**: 14,462 bytes
- **Status**: DISABLED (not registered)
- **Database Operations**:
  - `selectOne()` - Get assessment
  - `updateOne()` - Save questions
- **Tables Used**: `RiskAssessment`
- **Endpoints Defined**: 4
  - `POST /api/review/analyze-system` - Analyze
  - `POST /api/review/:id/generate-questions` - Generate
  - `PUT /api/review/:id/save-questions` - Save
  - `POST /api/review/:id/incident-analysis` - Analyze incidents
- **TODO (line 124-127)**: Add auth check when implemented
- **Status**: Code ready, needs auth checks

### 6. Projects Controller (Gated)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/controllers/projects-gated.controller.ts`
- **Size**: 10,189 bytes
- **Status**: DISABLED (not registered)
- **Database Operations**:
  - `selectOne()` - Get project
  - `selectMany()` - List projects
  - `insertOne()` - Create project
  - `updateOne()` - Update project
  - `deleteOne()` - Delete project
- **Tables Used**: `Project`, `RiskAssessment`, `User`
- **Endpoints Defined**: 6
  - `GET /api/projects-list` - List
  - `POST /api/projects-create` - Create
  - `GET /api/projects/:id` - Get
  - `PUT /api/projects/:id` - Update
  - `DELETE /api/projects/:id` - Delete
  - Plus count endpoints
- **Dependencies**: `feature-gates.service.ts` (limit checking)
- **Status**: Code ready, needs route enablement

### 7. Compliance Controller
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/controllers/compliance.controller.ts`
- **Size**: 10,749 bytes
- **Status**: DISABLED (not registered)
- **Database Operations**:
  - `selectOne()` - Get assessment
  - `updateOne()` - Save responses
- **Tables Used**: `RiskAssessment`, ComplianceAssessment fields
- **Endpoints Defined**: 3
  - `POST /api/review/:id/compliance-responses` - Save
  - `GET /api/review/:id/compliance-status` - Get status
  - Related compliance endpoints
- **Status**: Code ready, needs route enablement

### 8. Projects Quick Assessment Controller
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/controllers/projects.controller.ts`
- **Size**: 2,631 bytes
- **Status**: DISABLED (not registered)
- **Database Operations**:
  - `selectOne()` - Get project name
- **Tables Used**: `Project`
- **Endpoints Defined**: 1
  - `POST /api/projects/:projectId/quick-assessment`
- **Status**: Code ready, simple endpoint

### 9. User Controller
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/controllers/user.controller.ts`
- **Size**: 1,445 bytes
- **Status**: PARTIAL (route registered but service stubbed)
- **Dependencies**: `feature-gates.service.ts` (stubbed)
- **Endpoints**: `/api/user/usage`
- **Action**: Fix feature-gates.service.ts to enable full functionality

---

## Route Files (HIGH & MEDIUM PRIORITY)

### 10. Authentication Routes (ENABLED - WORKING)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/routes/auth.routes.ts`
- **Size**: 10,423 bytes
- **Status**: ✅ ENABLED AND WORKING
- **Database**: Uses raw `query()` function
- **Operations**:
  - Login: `SELECT "id", "email", "password" FROM "User"`
  - Register: `INSERT INTO "User"`
  - Logout: `UPDATE "user_tokens"`
- **Note**: Reference implementation for other routes

### 11. User Routes (ENABLED - NEEDS FEATURE-GATES FIX)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/routes/user.routes.ts`
- **Size**: 6,977 bytes
- **Status**: ✅ ENABLED (works when feature-gates.service.ts is fixed)
- **Database**: Uses raw `query()` function
- **Operations**: User profile, settings, password, subscription
- **Blocking Issue**: Calls stubbed `feature-gates.service.ts`

### 12. Stripe Webhook Route
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/routes/stripe-webhook.ts`
- **Size**: 6,491 bytes
- **Status**: ❌ DISABLED (not registered)
- **Database**: Uses raw `query()` function (incomplete)
- **TODOs**: 5 major TODOs for Prisma migration
  - Line: subscription creation
  - Line: subscription update
  - Line: subscription deletion
  - Line: payment success
  - Line: payment failure
- **SQL Needed**:
  ```sql
  INSERT INTO "Purchase" (...)
  UPDATE "Purchase" SET status = ...
  UPDATE "Purchase" SET status = 'cancelled'
  ```
- **Estimated Effort**: 4-6 hours
- **Impact**: Stripe payments not tracked

### 13. TOTP Routes (ENABLED - WORKING)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/routes/totp.routes.ts`
- **Size**: 16,744 bytes
- **Status**: ✅ ENABLED AND WORKING
- **Database**: Uses both `query()` and services
- **Operations**: 2FA setup, verification, recovery codes
- **Note**: Reference for working route implementation

---

## Library Files (SUPPORTING INFRASTRUCTURE)

### 14. Database Connection Pool (ACTIVE)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/db.ts`
- **Size**: 76 lines
- **Status**: ✅ ACTIVE AND WORKING
- **Provides**:
  - Connection pooling
  - Query execution
  - Transaction support
  - Pool cleanup
- **No Action Needed**

### 15. Query Builders (ACTIVE)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/db-queries.ts`
- **Size**: 272 lines
- **Status**: ✅ ACTIVE AND WORKING
- **Provides**:
  - Type-safe query builders
  - CRUD operations
  - Transaction variants
- **No Action Needed**

### 16. JWT Service (ACTIVE)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/jwt.service.ts`
- **Size**: 155 lines
- **Status**: ✅ ACTIVE AND WORKING
- **Operations**:
  - Token storage
  - Token retrieval
  - Token revocation
- **No Action Needed**

### 17. JWT Auth (ACTIVE)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/jwt-auth.ts`
- **Size**: 271 lines
- **Status**: ✅ ACTIVE AND WORKING
- **Operations**:
  - User authentication
  - Token validation
  - User lookup
- **No Action Needed**

### 18. TOTP Service (ACTIVE)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/totp.service.ts`
- **Status**: ✅ ACTIVE AND WORKING
- **Operations**: 2FA secret management
- **No Action Needed**

### 19. Subscription Queries (PARTIAL)
- **Path**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/subscription-queries.ts`
- **Status**: Functions exist but called from disabled routes
- **Operations**: Trial usage tracking, subscription data
- **Action**: Will be enabled when routes are re-enabled

---

## Work Breakdown Summary

### Group 1: Quick Wins (30 mins - 1 hour)
1. Uncomment routes in `app.ts` (30 mins)
2. Add DB connectivity check in `health.routes.ts` (30 mins)

### Group 2: Core Service Fix (2-3 hours)
1. Implement `feature-gates.service.ts` with real database queries

### Group 3: Full Assessment Flow (Automatic after Group 1-2)
1. `assessments.controller.ts` - All endpoints work
2. `review.controller.ts` - All endpoints work
3. `projects-gated.controller.ts` - All endpoints work
4. `compliance.controller.ts` - All endpoints work
5. `projects.controller.ts` - Endpoint works
6. Auth checks - Need to add manually

### Group 4: Stripe Integration (4-6 hours)
1. Implement 5 webhook handlers in `stripe-webhook.ts`

### Group 5: Testing & Optimization (2-3 hours)
1. Test all 29 newly enabled endpoints
2. Add database indexes
3. Performance verification

---

## File Location Summary

```
src/
├── app.ts                                    [CRITICAL - UNCOMMENT ROUTES]
├── lib/
│   ├── db.ts                                 [OK - ACTIVE]
│   ├── db-queries.ts                         [OK - ACTIVE]
│   ├── jwt.service.ts                        [OK - ACTIVE]
│   ├── jwt-auth.ts                           [OK - ACTIVE]
│   ├── totp.service.ts                       [OK - ACTIVE]
│   └── subscription-queries.ts               [OK - PARTIAL]
├── services/
│   └── feature-gates.service.ts              [CRITICAL - IMPLEMENT DB QUERIES]
├── controllers/
│   ├── assessments.controller.ts             [READY - NEEDS ROUTE]
│   ├── review.controller.ts                  [READY - NEEDS ROUTE]
│   ├── projects-gated.controller.ts          [READY - NEEDS ROUTE]
│   ├── compliance.controller.ts              [READY - NEEDS ROUTE]
│   ├── projects.controller.ts                [READY - NEEDS ROUTE]
│   └── user.controller.ts                    [PARTIAL - NEEDS FEATURE-GATES FIX]
└── routes/
    ├── app.ts                                [CRITICAL - UNCOMMENT]
    ├── auth.routes.ts                        [✅ WORKING]
    ├── user.routes.ts                        [✅ WORKS WHEN FEATURE-GATES FIXED]
    ├── health.routes.ts                      [CRITICAL - ADD DB CHECK]
    ├── stripe-webhook.ts                     [MEDIUM - IMPLEMENT HANDLERS]
    ├── totp.routes.ts                        [✅ WORKING]
    ├── assessments.routes.ts                 [READY - NEEDS REGISTRATION]
    ├── review.routes.ts                      [READY - NEEDS REGISTRATION]
    ├── projects.routes.ts                    [READY - NEEDS REGISTRATION]
    ├── projects-gated.routes.ts              [READY - NEEDS REGISTRATION]
    ├── compliance.routes.ts                  [READY - NEEDS REGISTRATION]
    ├── questions.routes.ts                   [READY - NEEDS REGISTRATION]
    └── risk.routes.ts                        [READY - NEEDS REGISTRATION]
```

---

## Quick Action Plan

### Day 1 (2-3 hours)
- [ ] Enable routes in `app.ts`
- [ ] Implement `feature-gates.service.ts`
- [ ] Add DB check to `health.routes.ts`
- [ ] Test all 29 endpoints

### Day 2 (4-6 hours)
- [ ] Implement Stripe webhook handlers
- [ ] Add auth checks to protected routes
- [ ] Add database indexes

### Day 3 (2-3 hours)
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Documentation

---

## References

- Full Analysis: `SENGOL_API_PRISMA_REFACTORING_ANALYSIS.md`
- Quick Reference: `PRISMA_MIGRATION_QUICK_REFERENCE.md`
- Schema: `prisma/schema.prisma` (2,914 lines)

