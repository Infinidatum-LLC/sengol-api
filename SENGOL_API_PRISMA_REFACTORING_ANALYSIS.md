# Sengol API - Comprehensive Prisma Usage & Refactoring Analysis

## Executive Summary

The Sengol API (`sengol-api` repository) is undergoing a **Prisma-to-Raw-SQL migration**. The codebase has been partially refactored to use PostgreSQL `pg` library with raw SQL queries, while many routes and controllers remain disabled pending completion of this migration.

### Current State
- **Migration Status**: ~30% complete
- **Database Layer**: Raw SQL via `pg` library (`src/lib/db.ts`, `src/lib/db-queries.ts`)
- **Disabled Routes**: ~9 major route groups still disabled
- **Enabled Routes**: Auth, User (partial), TOTP, Health (stub)
- **Architecture**: Fastify + PostgreSQL + Express-like routing

---

## Part 1: Current Prisma/Database Usage Analysis

### 1.1 Database Connection Layer

**File**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/db.ts`

```typescript
// PostgreSQL connection pool with pg library
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Core functions:
- query<T>() - Execute parameterized queries
- transaction<T>() - Execute multiple queries with ACID guarantees
- getClient() - Get single client for manual control
- closePool() - Graceful shutdown
```

**Status**: ACTIVE - This is the primary database layer, NOT disabled

---

### 1.2 Query Builder Layer

**File**: `/Users/durai/Documents/GitHub/sengol-api/src/lib/db-queries.ts`

Type-safe query builders using parameterized SQL:

```typescript
// SELECT operations
selectOne<T>(table, where) - Single row fetch
selectMany<T>(table, where?, limit?, offset?) - Multiple rows
count(table, where?) - Count rows

// INSERT operations
insertOne<T>(table, data) - Single row insert
insertMany<T>(table, data[]) - Batch insert

// UPDATE operations
updateOne<T>(table, data, where) - Single row update
updateMany<T>(table, data, where) - Multiple rows update

// DELETE operations
deleteOne(table, where) - Single row delete
deleteMany(table, where) - Multiple rows delete

// Transaction variants (for use within transactions)
transactionInsertOne, transactionUpdateOne, transactionSelectOne
```

**Status**: ACTIVE - Heavily used across controllers

---

## Part 2: All Files Using Database Operations

### 2.1 Controllers Using Database

**Files with Database Queries**:

1. **`src/controllers/assessments.controller.ts`** (29,872 bytes)
   - Uses: `selectOne`, `insertOne`, `updateOne`
   - Operations:
     - Create new assessment (`createAssessmentController`)
     - Get assessment by ID (`getAssessmentController`)
     - Update assessment steps 1-3
     - Submit assessment
     - Get assessment scores, benchmarks, similar cases
   - Key Tables: `RiskAssessment`, `Project`
   - **Status**: DISABLED (route not registered in app.ts)

2. **`src/controllers/review.controller.ts`** (14,462 bytes)
   - Uses: `selectOne`, `updateOne`
   - Operations:
     - Analyze system descriptions
     - Generate dynamic questions
     - Save generated questions
     - Incident analysis
   - Key Tables: `RiskAssessment`
   - **Status**: DISABLED

3. **`src/controllers/projects-gated.controller.ts`** (10,189 bytes)
   - Uses: `selectOne`, `selectMany`, `insertOne`, `updateOne`, `deleteOne`
   - Operations:
     - List user projects
     - Create project with limits
     - Get project details
     - Update project
     - Delete project
   - Key Tables: `Project`, `RiskAssessment`, `User`
   - **Status**: DISABLED

4. **`src/controllers/compliance.controller.ts`** (10,749 bytes)
   - Uses: `selectOne`, `updateOne`
   - Operations:
     - Save compliance question responses
     - Calculate compliance coverage scores
     - Retrieve compliance data
   - Key Tables: `RiskAssessment`, compliance-related fields
   - **Status**: DISABLED

5. **`src/controllers/projects.controller.ts`** (2,631 bytes)
   - Uses: `selectOne`
   - Operations:
     - Quick assessment generation
     - Fetch project name from database
   - Key Tables: `Project`
   - **Status**: DISABLED

6. **`src/controllers/user.controller.ts`** (1,445 bytes)
   - Uses: None directly (calls service)
   - Operations:
     - Get user usage/limits
   - **Status**: PARTIALLY ENABLED (route registered but calls stubbed service)

### 2.2 Route Files Using Database

**Files with Direct Database Access**:

1. **`src/routes/auth.routes.ts`** (10,423 bytes)
   - Uses: `query()` directly (low-level)
   - Operations:
     - Login: `SELECT "id", "email", "password" FROM "User" WHERE "email" = $1`
     - Register: `INSERT INTO "User" (email, password, name) VALUES (...)`
     - Logout: `UPDATE "user_tokens" SET revokedAt = NOW()`
   - **Status**: ENABLED

2. **`src/routes/stripe-webhook.ts`** (6,491 bytes)
   - Uses: `query()` directly
   - Operations:
     - Handle Stripe subscription webhooks
     - Create/update/delete subscriptions
     - Track payment events
   - **Status**: DISABLED (route not registered)
   - **Note**: Has TODO comments indicating incomplete Prisma migration

3. **`src/routes/user.routes.ts`** (6,977 bytes)
   - Uses: `query()` directly
   - Operations:
     - Get user profile
     - Update user settings
     - Change password
     - Get subscription status
   - **Status**: ENABLED (route registered)

4. **`src/routes/totp.routes.ts`** (16,744 bytes)
   - Uses: `query()` and services
   - Operations:
     - 2FA setup, verification, recovery codes
   - **Status**: ENABLED

### 2.3 Service Files Using Database

**Files with Database Queries**:

1. **`src/lib/jwt.service.ts`** (155 lines)
   - Uses: `insertOne`, `selectOne`, `updateOne`
   - Operations:
     - Store JWT tokens
     - Retrieve tokens
     - Revoke tokens
     - Check token revocation
   - Key Table: `user_tokens`
   - **Status**: ACTIVE (used by auth)

2. **`src/lib/jwt-auth.ts`** (271 lines)
   - Uses: `insertOne`, `selectOne`, `updateOne`
   - Operations:
     - User authentication
     - Token generation/validation
   - Key Table: `User`
   - **Status**: ACTIVE

3. **`src/lib/totp.service.ts`**
   - Uses: `query()` directly
   - Operations:
     - TOTP secret management
   - **Status**: ACTIVE

4. **`src/lib/subscription-queries.ts`**
   - Uses: `query()` directly
   - Operations:
     - Trial usage tracking
     - Subscription data
   - **Status**: Called from disabled routes

5. **`src/services/feature-gates.service.ts`** (180 lines)
   - Uses: NONE - Currently STUBBED
   - **Status**: DISABLED
   - **Issues**: 
     - `getUserTier()` returns hardcoded 'free'
     - `isUserAdmin()` returns hardcoded false
     - All count operations return 0
   - **TODO**: Needs database queries implemented

---

## Part 3: API Routes & Endpoints Status

### 3.1 Registered (Enabled) Routes

| Route | Status | Database | Notes |
|-------|--------|----------|-------|
| `/api/auth/login` | ✅ ENABLED | Yes | Working, uses raw SQL |
| `/api/auth/register` | ✅ ENABLED | Yes | Working, uses raw SQL |
| `/api/auth/logout` | ✅ ENABLED | Yes | Working |
| `/api/user/*` | ✅ ENABLED | Yes | Partial, uses stubbed services |
| `/api/totp/*` | ✅ ENABLED | Yes | 2FA routes, working |
| `/health` | ✅ ENABLED | No | Basic health check |
| `/health/detailed` | ✅ ENABLED | Stub | DB check stubbed |
| `/health/ready` | ✅ ENABLED | No | K8s readiness |
| `/health/live` | ✅ ENABLED | No | K8s liveness |

### 3.2 Disabled Routes (Pending Prisma Migration)

| Route | Status | Controllers | Database Tables |
|-------|--------|-------------|-----------------|
| `/api/review/*` | ❌ DISABLED | `review.controller.ts` | RiskAssessment, related tables |
| `/api/assessments/*` | ❌ DISABLED | `assessments.controller.ts` | RiskAssessment, Project |
| `/api/projects*` | ❌ DISABLED | `projects*.controller.ts` | Project, RiskAssessment, User |
| `/api/compliance/*` | ❌ DISABLED | `compliance.controller.ts` | RiskAssessment, ComplianceAssessment |
| `/api/questions*` | ❌ DISABLED | `questions.controller.ts` | RiskAssessment |
| `/api/risk/*` | ❌ DISABLED | `risk.controller.ts` | RiskAssessment |

**Reason for Disabling**: Routes are commented out in `src/app.ts` lines 78-96 pending Prisma-to-raw-SQL migration completion.

---

## Part 4: Data Model & Database Tables

### 4.1 Primary Tables Used

From analysis of controllers and Prisma schema:

```
User
├── id (PK)
├── email (UNIQUE)
├── password (hashed)
├── name
├── currentGeographyId (FK)
├── createdAt, updatedAt
└── Relations: Account, Session, Backlog, AuditReport, etc.

Project
├── id (PK)
├── userId (FK)
├── name
├── description
├── createdAt, updatedAt
└── Relations: RiskAssessment

RiskAssessment
├── id (PK)
├── userId (FK)
├── projectId (FK)
├── name
├── analysisStatus
├── systemDescription (TEXT)
├── selectedDomains (JSONB array)
├── riskNotes (JSONB - stores generated questions)
├── complianceQuestionResponses (JSONB)
├── riskQuestionResponses (JSONB)
├── overallRiskScore
├── sengolScore
├── aiRiskScore, cyberRiskScore, cloudRiskScore
├── complianceScore
├── createdAt, updatedAt
└── Relations: Project, User

ComplianceAssessment
├── id (PK)
├── assessmentId (FK)
├── jurisdiction
├── frameworkId
└── Compliance-related metadata

user_tokens
├── id (PK)
├── userId (FK)
├── token
├── expiresAt
├── revokedAt
└── createdAt

TOTPSecret
├── id (PK)
├── userId (FK)
├── secret
├── verified
└── Timestamps

Trial System Tables:
├── TrialUsage
├── TrialExpiration
└── Feature limits
```

### 4.2 Problematic Data Patterns

1. **JSONB Storage for Questions**
   - Field: `RiskAssessment.riskNotes`
   - Contains dynamically generated questions (not normalized)
   - Flexible but harder to query/aggregate

2. **Multi-field JSONB Metadata**
   - `businessImpact`, `selectedDomains`, `jurisdictions`
   - Makes filtering/searching difficult with raw SQL
   - Would benefit from normalized tables

3. **Missing Indexes on Common Queries**
   - No index on `RiskAssessment(userId)` visible in schema
   - No composite index on `(userId, createdAt)`
   - Likely performance issues for user listing

---

## Part 5: SQL Query Patterns Identified

### 5.1 SELECT Patterns

```sql
-- Single row lookup
SELECT * FROM "Table" WHERE id = $1 LIMIT 1

-- Multiple rows with filter
SELECT * FROM "Table" WHERE userId = $1

-- With pagination
SELECT * FROM "Table" WHERE userId = $1 LIMIT $2 OFFSET $3

-- Count aggregation
SELECT COUNT(*) as count FROM "Table" WHERE condition
```

### 5.2 INSERT Patterns

```sql
-- Single insert
INSERT INTO "Table" (col1, col2, col3) VALUES ($1, $2, $3) RETURNING *

-- Batch insert
INSERT INTO "Table" (col1, col2) VALUES ($1, $2), ($3, $4) RETURNING *

-- With defaults (createdAt, updatedAt handled in app)
INSERT INTO "User" (id, email, password) VALUES ($1, $2, $3) RETURNING *
```

### 5.3 UPDATE Patterns

```sql
-- Single row update
UPDATE "Table" SET col1 = $1, col2 = $2 WHERE id = $3 RETURNING *

-- JSONB updates (future)
UPDATE "RiskAssessment" SET riskNotes = jsonb_set(...) WHERE id = $1
```

### 5.4 Transaction Patterns

```sql
BEGIN
  -- Multiple operations
COMMIT

-- Or on error:
ROLLBACK
```

---

## Part 6: Components That Need Refactoring

### 6.1 HIGH PRIORITY - Missing Database Implementation

**File**: `src/services/feature-gates.service.ts`

```typescript
// Current: All functions return hardcoded values
export async function getUserTier(userId: string) {
  return 'free' // TODO: Query database
}

export async function isUserAdmin(userId: string) {
  return false // TODO: Query database
}

export async function countAssessmentsThisMonth(userId: string) {
  return 0 // TODO: Query database
}
```

**Need to Implement**:
```typescript
// Get user subscription tier
SELECT tier FROM "User" 
WHERE id = $1

// Check admin role
SELECT role FROM "User" WHERE id = $1

// Count monthly assessments
SELECT COUNT(*) FROM "RiskAssessment"
WHERE userId = $1 
  AND created_at >= current_date - interval '30 days'

// Count user projects
SELECT COUNT(*) FROM "Project" WHERE userId = $1
```

### 6.2 HIGH PRIORITY - Disabled Routes Needing Re-enabling

**Routes that need Prisma migration completion**:

1. **`/api/assessments/*`** - 12 endpoints
2. **`/api/review/*`** - 4 endpoints
3. **`/api/projects*`** - 6 endpoints
4. **`/api/compliance/*`** - 3 endpoints
5. **`/api/questions*`** - 2 endpoints
6. **`/api/risk/*`** - 2 endpoints

**Total**: ~29 API endpoints disabled

### 6.3 MEDIUM PRIORITY - Stripe Integration

**File**: `src/routes/stripe-webhook.ts`

Status: Disabled, has TODOs for Prisma migration

**Operations to Implement**:
- `subscription.created` → Create/update subscription record
- `subscription.updated` → Update subscription status
- `subscription.deleted` → Mark subscription as cancelled
- `payment_intent.succeeded` → Record successful payment
- `payment_intent.payment_failed` → Record failed payment
- `charge.refunded` → Handle refunds

### 6.4 MEDIUM PRIORITY - Health Check Completion

**File**: `src/routes/health.routes.ts`

**Missing Implementations**:
```typescript
// Current stub
health.checks.database = {
  status: 'ok',
  responseTime: 0,
  healthy: true,
}

// Should actually test:
SELECT 1 -- Simple connectivity test
SELECT COUNT(*) FROM "User" -- Verify database works
```

---

## Part 7: API Endpoints That Need Creation

### 7.1 Endpoints Defined But Disabled

These routes are defined in controller/route files but not registered:

**Review/Assessment Generation**:
- `POST /api/review/analyze-system` - System analysis
- `POST /api/review/:id/generate-questions` - Question generation
- `PUT /api/review/:id/save-questions` - Save generated questions
- `POST /api/review/:id/incident-analysis` - Incident matching

**Assessment CRUD**:
- `POST /api/assessments` - Create assessment
- `GET /api/assessments/:id` - Get assessment
- `PUT /api/assessments/:id/step1` - Update step 1
- `PUT /api/assessments/:id/step2` - Update step 2
- `PUT /api/assessments/:id/step3` - Update step 3
- `POST /api/assessments/:id/submit` - Submit assessment
- `GET /api/assessments/:id/scores` - Get scores
- `GET /api/assessments/:id/benchmark` - Get benchmark
- `GET /api/assessments/:id/similar-cases` - Get similar cases

**Project Management**:
- `GET /api/projects-list` - List projects
- `POST /api/projects-create` - Create project
- `GET /api/projects/:id` - Get project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

**Compliance**:
- `POST /api/review/:id/compliance-responses` - Save responses
- `GET /api/review/:id/compliance-status` - Get status

**Questions**:
- `POST /api/questions/generate` - Generate questions
- `GET /api/questions/:id` - Get question

**Risk Assessment**:
- `POST /api/risk/analyze` - Analyze risk
- `GET /api/risk/:id` - Get risk assessment

---

## Part 8: Known Issues & TODOs

### 8.1 Authentication TODOs

**File**: `src/controllers/review.controller.ts` (line 124-127)

```typescript
// TODO: Add auth check when auth is implemented
// if (assessment.userId !== request.user.userId) {
//   return reply.code(403).send({ error: 'Forbidden' })
// }
```

**Status**: Auth middleware not implemented on protected routes

### 8.2 Health Check TODOs

**File**: `src/routes/health.routes.ts` (line 52)

```typescript
// TODO: Check database connectivity
```

### 8.3 Stripe Integration TODOs

**File**: `src/routes/stripe-webhook.ts`

```typescript
// TODO: Implement Prisma-to-raw-SQL migration for subscription creation
// TODO: Implement Prisma-to-raw-SQL migration for subscription updates
// TODO: Implement Prisma-to-raw-SQL migration for subscription deletion
// TODO: Implement Prisma-to-raw-SQL migration for payment success handling
// TODO: Implement Prisma-to-raw-SQL migration for payment failure handling
```

### 8.4 Service Stubs

**File**: `src/services/feature-gates.service.ts`

Multiple functions return hardcoded values pending database queries:
- `getUserTier()` → 'free'
- `isUserAdmin()` → false
- `countAssessmentsThisMonth()` → 0
- `countUserProjects()` → 0
- `getUserUsageSummary()` → All zeros

---

## Part 9: Refactoring Roadmap

### Phase 1: Core Services (1-2 weeks)
1. Implement `feature-gates.service.ts` database queries
2. Complete health check implementation
3. Add auth middleware to protected routes

### Phase 2: Assessment Flow (2-3 weeks)
1. Enable `assessments.controller.ts` and routes
2. Implement all CRUD operations
3. Add database operations for question saving
4. Add score calculation and storage

### Phase 3: Project Management (1 week)
1. Enable `projects*.controller.ts` and routes
2. Implement project CRUD
3. Add project-assessment relationships

### Phase 4: Compliance Module (1 week)
1. Enable `compliance.controller.ts` and routes
2. Implement compliance response saving
3. Add compliance score calculation

### Phase 5: Review & Cleanup (1 week)
1. Enable remaining routes
2. Add auth checks to all protected endpoints
3. Implement Stripe webhook properly
4. Comprehensive testing

### Phase 6: Optimization (1 week)
1. Add missing database indexes
2. Optimize common queries
3. Add query result caching
4. Performance testing

---

## Part 10: Query Implementation Examples

### Example 1: Feature Gates Service

```typescript
// src/services/feature-gates.service.ts - REPLACE ENTIRE FILE

import { query } from '../lib/db'
import { selectOne } from '../lib/db-queries'
import { PricingTier, getTierLimits, hasFeature } from '../lib/pricing'

export async function getUserTier(userId: string): Promise<PricingTier> {
  const result = await query(
    `SELECT tier FROM "User" WHERE id = $1`,
    [userId]
  )
  
  if (result.rows.length === 0) {
    return 'free' // default
  }
  
  return (result.rows[0].tier || 'free') as PricingTier
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const result = await query(
    `SELECT role FROM "User" WHERE id = $1`,
    [userId]
  )
  
  if (result.rows.length === 0) {
    return false
  }
  
  return result.rows[0].role === 'admin'
}

export async function countAssessmentsThisMonth(
  userId: string
): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int as count FROM "RiskAssessment"
     WHERE "userId" = $1 AND "createdAt" >= NOW() - INTERVAL '30 days'`,
    [userId]
  )
  
  return result.rows[0]?.count || 0
}

export async function countUserProjects(userId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int as count FROM "Project" WHERE "userId" = $1`,
    [userId]
  )
  
  return result.rows[0]?.count || 0
}
```

### Example 2: Enabling Assessment Routes

```typescript
// src/app.ts - UNCOMMENT AND MODIFY

// Add to route registration section:
await fastify.register(assessmentsRoutes) // Enable assessments
await fastify.register(reviewRoutes) // Enable review/question generation
await fastify.register(projectsRoutes) // Enable projects
await fastify.register(projectsGatedRoutes) // Enable projects with limits
await fastify.register(questionsRoutes) // Enable questions
await fastify.register(complianceRoutes) // Enable compliance
await fastify.register(riskRoutes) // Enable risk assessment

// Update health routes to include database checks
await fastify.register(healthRoutes)
```

### Example 3: Database Query for Assessment Creation

Already implemented in `assessments.controller.ts`, but pattern:

```typescript
// Create assessment with validation
const assessmentId = crypto.randomUUID()
const assessment = await insertOne<RiskAssessment>('RiskAssessment', {
  id: assessmentId,
  name,
  userId,
  projectId,
  analysisStatus: 'draft',
  industry: '',
  // ... other fields
  createdAt: new Date(),
  updatedAt: new Date(),
})
```

---

## Part 11: File-by-File Refactoring Checklist

### Critical (Must Complete)

- [ ] `src/services/feature-gates.service.ts` - Implement all database queries
- [ ] `src/routes/health.routes.ts` - Add real database connectivity check
- [ ] `src/app.ts` - Uncomment disabled route registrations
- [ ] `src/controllers/assessments.controller.ts` - Complete database implementations
- [ ] `src/controllers/review.controller.ts` - Implement all operations
- [ ] `src/controllers/projects-gated.controller.ts` - Implement all CRUD
- [ ] `src/controllers/compliance.controller.ts` - Implement compliance saving
- [ ] `src/routes/stripe-webhook.ts` - Implement Stripe webhook handlers

### Important (Should Complete)

- [ ] Add auth middleware checks to all protected routes
- [ ] Implement database indexes for common queries
- [ ] Add caching layer for expensive queries
- [ ] Implement query result validation
- [ ] Add comprehensive error handling

### Nice-to-Have (Performance)

- [ ] Query optimization/caching
- [ ] Batch operation optimization
- [ ] Connection pool tuning
- [ ] Query performance monitoring

---

## Part 12: Summary of Findings

### Database Usage Overview

| Category | Count | Status |
|----------|-------|--------|
| Total Controllers | 7 | 6 disabled, 1 partial |
| Total Route Groups | 11+ | 9 disabled |
| Active API Endpoints | 15 | Auth, User, TOTP, Health |
| Disabled API Endpoints | ~29 | Awaiting Prisma migration |
| Database Tables Used | 30+ | Full Prisma schema defined |
| Service Functions Stubbed | 5+ | feature-gates.service.ts |

### Key Findings

1. **Partial Migration**: 30% complete, raw SQL layer established but controllers not re-enabled
2. **Service Stubs**: Critical service (`feature-gates.service.ts`) returns hardcoded values
3. **Route Status**: 9 major route groups disabled pending migration completion
4. **Query Layer**: Well-designed abstraction (`db-queries.ts`) with type-safe builders
5. **No Indexes**: Missing database indexes on common query patterns
6. **No Auth Middleware**: Protected routes don't have auth checks implemented
7. **Health Check Incomplete**: Database connectivity checks are stubbed

### Immediate Action Items

1. **Restore feature-gates.service.ts** - Implement real database queries (2-3 hours)
2. **Enable core routes** - Uncomment route registrations in app.ts (30 mins)
3. **Add auth middleware** - Protect assessment/project routes (2-3 hours)
4. **Complete health checks** - Add real DB connectivity test (30 mins)
5. **Fix Stripe integration** - Implement webhook handlers (4-6 hours)

---

## Appendix A: Database Schema Summary

**Key Models**:
- `User` - User accounts
- `Project` - User projects
- `RiskAssessment` - Main assessment records
- `ComplianceAssessment` - Compliance-specific data
- `user_tokens` - JWT token storage
- `TOTPSecret` - 2FA secrets
- `Account` - OAuth accounts
- `AuditReport` - Compliance audit reports
- And 20+ others for compliance, evidence, monitoring, etc.

**Total Schema Size**: 2,914 lines

---

End of Analysis Report
