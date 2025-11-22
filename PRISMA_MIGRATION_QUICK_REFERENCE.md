# Prisma Migration Quick Reference

## Overview
The Sengol API is migrating from Prisma ORM to raw PostgreSQL queries using the `pg` library. Migration is ~30% complete.

## Active Database Layer

### Connection Pool
- **File**: `src/lib/db.ts`
- **Usage**: `import { query, transaction } from '../lib/db'`
- **Max Connections**: 20
- **Idle Timeout**: 30s

### Query Builders
- **File**: `src/lib/db-queries.ts`
- **Usage**: `import { selectOne, insertOne, updateOne, etc } from '../lib/db-queries'`
- **Type-Safe**: Full TypeScript generics support

## Status Dashboard

### Enabled Routes (Working)
```
✅ /api/auth/login
✅ /api/auth/register
✅ /api/auth/logout
✅ /api/user/*
✅ /api/totp/*
✅ /health, /health/detailed, /health/ready, /health/live
```

### Disabled Routes (Need Migration)
```
❌ /api/assessments/* (12 endpoints)
❌ /api/review/* (4 endpoints)
❌ /api/projects* (6 endpoints)
❌ /api/compliance/* (3 endpoints)
❌ /api/questions/* (2 endpoints)
❌ /api/risk/* (2 endpoints)
```

## Files Using Database

### Controllers (6 files, 6 disabled)
| File | Size | Status | Tables |
|------|------|--------|--------|
| assessments.controller.ts | 29KB | DISABLED | RiskAssessment, Project |
| review.controller.ts | 14KB | DISABLED | RiskAssessment |
| projects-gated.controller.ts | 10KB | DISABLED | Project, User, RiskAssessment |
| compliance.controller.ts | 11KB | DISABLED | RiskAssessment |
| projects.controller.ts | 3KB | DISABLED | Project |
| user.controller.ts | 1KB | PARTIAL | Uses stubbed service |

### Routes (4 files with database)
| File | Status | Purpose |
|------|--------|---------|
| auth.routes.ts | ENABLED | User login/register |
| user.routes.ts | ENABLED | User profile/settings |
| totp.routes.ts | ENABLED | 2FA management |
| stripe-webhook.ts | DISABLED | Payment handling (TODOs) |

### Services
| File | Status | Issue |
|------|--------|-------|
| feature-gates.service.ts | STUBBED | Returns hardcoded values, needs queries |
| jwt.service.ts | ACTIVE | Token management |
| jwt-auth.ts | ACTIVE | Authentication |
| totp.service.ts | ACTIVE | 2FA |

## Critical Issues

### 🔴 HIGH PRIORITY
1. **feature-gates.service.ts** - All functions stubbed, returns hardcoded values
   - `getUserTier()` → 'free'
   - `isUserAdmin()` → false
   - Count functions → 0

2. **9 Major Routes Disabled** - ~29 API endpoints unavailable
   - All commented out in `src/app.ts` lines 78-96

3. **No Auth Checks** - Protected routes don't validate user permissions
   - `review.controller.ts` line 124 has TODO comment

### 🟡 MEDIUM PRIORITY
1. **Stripe Webhook** - 5+ TODOs for subscription handling
2. **Health Check** - Database connectivity check is stubbed
3. **Missing Indexes** - No indexes on common query patterns

## Quick Implementation Guide

### Step 1: Enable Routes
**File**: `src/app.ts` (lines 78-96)
```typescript
// Uncomment these lines:
await fastify.register(healthRoutes)
await fastify.register(assessmentsRoutes)
await fastify.register(reviewRoutes)
await fastify.register(projectsRoutes)
await fastify.register(projectsGatedRoutes)
await fastify.register(questionsRoutes)
await fastify.register(complianceRoutes)
await fastify.register(riskRoutes)
```

### Step 2: Implement feature-gates.service.ts
**Key Functions to Add**:
```typescript
export async function getUserTier(userId: string) {
  const result = await query(
    `SELECT tier FROM "User" WHERE id = $1`,
    [userId]
  )
  return (result.rows[0]?.tier || 'free') as PricingTier
}

export async function isUserAdmin(userId: string) {
  const result = await query(
    `SELECT role FROM "User" WHERE id = $1`,
    [userId]
  )
  return result.rows[0]?.role === 'admin'
}

export async function countAssessmentsThisMonth(userId: string) {
  const result = await query(
    `SELECT COUNT(*)::int as count FROM "RiskAssessment"
     WHERE "userId" = $1 AND "createdAt" >= NOW() - INTERVAL '30 days'`,
    [userId]
  )
  return result.rows[0]?.count || 0
}
```

### Step 3: Add Auth Checks
Add to all protected controllers:
```typescript
if (assessment.userId !== request.user?.id) {
  return reply.code(403).send({ error: 'Forbidden' })
}
```

## Database Tables Used

### Core Tables
- `User` - User accounts
- `Project` - User projects
- `RiskAssessment` - Assessment records
- `user_tokens` - JWT token storage
- `TOTPSecret` - 2FA secrets

### Assessment Tables
- `ComplianceAssessment` - Compliance data
- `AssessmentContext` - Context storage
- `EvidenceArtifact` - Evidence storage
- `AuditReport` - Audit reports

### Other Tables
- `Account` - OAuth accounts
- `Backlog` - Feature backlog
- `Competitor` - Competitor tracking
- And 15+ others (see schema.prisma)

## Query Patterns

### Simple Select
```typescript
const user = await selectOne<User>('User', { id: userId })
```

### List with Pagination
```typescript
const projects = await selectMany<Project>('Project', 
  { userId },
  10,  // limit
  0    // offset
)
```

### Insert
```typescript
const assessment = await insertOne<RiskAssessment>('RiskAssessment', {
  id: crypto.randomUUID(),
  name,
  userId,
  projectId,
  analysisStatus: 'draft',
  createdAt: new Date(),
  updatedAt: new Date(),
})
```

### Update
```typescript
await updateOne('RiskAssessment', 
  { riskNotes: questions },
  { id: assessmentId }
)
```

### Delete
```typescript
await deleteOne('Project', { id: projectId })
```

### Transaction
```typescript
await transaction(async (client) => {
  // Multiple operations with rollback support
  const result1 = await transactionInsertOne(client, 'Table1', data)
  const result2 = await transactionUpdateOne(client, 'Table2', update, where)
  return [result1, result2]
})
```

## Environment Variables Required

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000
PORT=3001
```

## Testing Disabled Routes

After enabling routes:
```bash
# Test assessment creation
curl -X POST http://localhost:3001/api/assessments \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","projectId":"...","userId":"..."}'

# Test project creation
curl -X POST http://localhost:3001/api/projects-create \
  -H "Content-Type: application/json" \
  -d '{"userId":"...","name":"My Project"}'
```

## Performance Considerations

### Current Bottlenecks
1. **No Result Caching** - Each request hits database
2. **Missing Indexes** - Slow queries on common filters
3. **N+1 Queries** - List endpoints fetch individual records

### Improvements
1. Add indexes:
   ```sql
   CREATE INDEX idx_riskas sessment_userId ON "RiskAssessment"("userId")
   CREATE INDEX idx_project_userId ON "Project"("userId")
   ```

2. Batch operations where possible
3. Cache frequently accessed data

## Migration Checklist

- [ ] Enable routes in app.ts
- [ ] Implement feature-gates.service.ts
- [ ] Add auth checks to protected controllers
- [ ] Complete health check implementation
- [ ] Fix Stripe webhook handlers
- [ ] Add database indexes
- [ ] Test all endpoints
- [ ] Add error handling
- [ ] Performance testing

## Next Steps

1. **Immediate** (1-2 days)
   - Enable routes
   - Implement feature-gates service
   - Add auth checks

2. **Short-term** (1 week)
   - Complete all disabled route implementations
   - Add Stripe webhook support
   - Add database indexes

3. **Long-term** (2-4 weeks)
   - Performance optimization
   - Caching layer
   - Comprehensive testing

## References

- Full Analysis: `SENGOL_API_PRISMA_REFACTORING_ANALYSIS.md`
- Database Schema: `prisma/schema.prisma` (2,914 lines)
- Query Builder: `src/lib/db-queries.ts`
- Connection Pool: `src/lib/db.ts`

