# Council Module - Quick Reference Guide

## Type Files Location & Summary

```
/src/types/council/
├── common.ts (224 lines)
│   ├── 15 Major Enums
│   ├── Pagination Types
│   ├── Policy Conditions (recursive)
│   ├── Policy Actions (union type)
│   ├── Violation Interface
│   ├── Response Types (generic wrapper)
│   └── Module Status Types
│
└── policies.ts (146 lines)
    ├── CreatePolicyRequest
    ├── Policy (with metadata)
    ├── UpdatePolicyRequest
    ├── EvaluatePolicyRequest/Response
    ├── BulkEvaluateRequest/Response
    ├── List/Query Types
    └── Violation Response Types
```

## Prisma Models Needed

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `CouncilPolicy` | Policy definitions | name, description, conditions, actions, status, version |
| `CouncilViolation` | Violation tracking | policyId, status, severity, detectedAt, evidence |
| `CouncilVendor` | Vendor info | name, status, riskScore, assessments |
| `CouncilSchedule` | Automated runs | frequency, assessmentType, lastRunAt, nextRunAt |
| `PolicyEvaluation` | Evaluation history | policyId, assessmentId, violated, result |
| `VendorAssessment` | Vendor assessments | vendorId, type, status, result, riskScore |
| `VendorScorecard` | Vendor scorecards | vendorId, category, score, details |
| `ScheduleRun` | Schedule execution | scheduleId, status, result, error |

## Architecture Layers

```
Routes (council.routes.ts)
  ↓ HTTP Requests
Controllers (council/*.controller.ts) - Validation & Response Formatting
  ↓ Calls
Services (council-*.service.ts) - Business Logic
  ↓ Queries
Prisma Client
  ↓ SQL
PostgreSQL Database
```

## Key Patterns to Follow

### Controller Template
```typescript
export async function createPolicyController(
  request: FastifyRequest<{ Body: CreatePolicyRequest }>,
  reply: FastifyReply
) {
  try {
    // 1. Validate input
    // 2. Log operation
    // 3. Call service
    // 4. Return 201 + data
  } catch (error) {
    // Handle ValidationError → 400
    // Handle NotFoundError → 404
    // Default → 500
  }
}
```

### Service Template
```typescript
export async function createPolicy(
  input: CreatePolicyRequest,
  geographyAccountId: string
): Promise<Policy> {
  // 1. Business logic
  // 2. Prisma operations
  // 3. Return typed result
}
```

### Route Template
```typescript
export async function councilRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: CreatePolicyRequest }>(
    '/api/council/policies',
    { schema: { ... } },
    createPolicyController
  )
}
```

## Available Error Classes

```
ValidationError       → 400
NotFoundError         → 404
AuthenticationError   → 401
AuthorizationError    → 403
DatabaseError         → 500
VectorDBError         → 503
LLMError              → 503
CircuitBreakerError   → 503
TimeoutError          → 408
RateLimitError        → 429
```

## Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "message",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

**List:**
```json
{
  "items": [],
  "pagination": {
    "total": 100,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

## Endpoint Groups

| Group | Count | Base Path |
|-------|-------|-----------|
| Policies | 8 | `/api/council/policies` |
| Violations | 2 | `/api/council/violations` |
| Vendors | 7 | `/api/council/vendors` |
| Schedules | 5 | `/api/council/schedules` |
| Status | 2 | `/api/council/{health,status}` |
| **Total** | **24** | |

## Critical Decisions Made

1. **JSON Storage**: PolicyConditionGroup and PolicyActions stored as JSON (recursive/union complexity)
2. **Multi-tenancy**: All entities linked to GeographyAccount
3. **String Enums**: All enum values stored as strings (not numeric)
4. **Pagination**: offset/limit pattern with hasMore flag
5. **Relations**: Cascade deletes for parent-child, SetNull for optional refs
6. **Response Wrapper**: Generic CouncilResponse<T> type for consistency

## Database Indexes

```prisma
@@index([geographyAccountId])  // Multi-tenancy filtering
@@index([status])              // Status-based queries
@@index([category])            // Category filtering
@@index([severity])            // Severity filtering
@@index([policyId])            // Violation lookups
@@index([assessmentId])        // Assessment linkage
@@unique([policyId, assessmentId])  // One eval per policy/assessment
```

## File Organization

```
/src
├── types/council/
│   ├── common.ts           ← All enums & shared types
│   ├── policies.ts         ← Policy-specific types
│   ├── vendors.ts          ← [TO CREATE] Vendor types
│   ├── schedules.ts        ← [TO CREATE] Schedule types
│   └── assessments.ts      ← [TO CREATE] Assessment types
│
├── schemas/council/
│   ├── policies.ts         ← [TO CREATE] Zod validation
│   ├── vendors.ts          ← [TO CREATE]
│   └── schedules.ts        ← [TO CREATE]
│
├── services/
│   ├── council-policy.service.ts      ← [TO CREATE]
│   ├── council-violation.service.ts   ← [TO CREATE]
│   ├── council-vendor.service.ts      ← [TO CREATE]
│   └── council-schedule.service.ts    ← [TO CREATE]
│
├── controllers/council/
│   ├── policies.controller.ts         ← [TO CREATE]
│   ├── violations.controller.ts       ← [TO CREATE]
│   ├── vendors.controller.ts          ← [TO CREATE]
│   └── schedules.controller.ts        ← [TO CREATE]
│
└── routes/council/
    ├── policies.routes.ts             ← [TO CREATE]
    ├── violations.routes.ts           ← [TO CREATE]
    ├── vendors.routes.ts              ← [TO CREATE]
    └── schedules.routes.ts            ← [TO CREATE]
```

## Existing Related Code to Reference

- **Controllers**: `/src/controllers/compliance.controller.ts` (response handling pattern)
- **Services**: `/src/services/risk.service.ts` (business logic pattern)
- **Routes**: `/src/routes/compliance.routes.ts` (route registration pattern)
- **Errors**: `/src/lib/errors.ts` (error classes)
- **Middleware**: `/src/middleware/validation.ts` (request validation)
- **Prisma**: `/prisma/schema.prisma` (similar models like RiskAssessment)

## Development Workflow

```bash
# 1. Add models to prisma/schema.prisma
npx prisma generate
npx prisma migrate dev --name add_council_models

# 2. Create type files if needed
# ✓ common.ts (done)
# ✓ policies.ts (done)

# 3. Create schema validation (Zod)
# /src/schemas/council/policies.ts

# 4. Create services
# /src/services/council-policy.service.ts

# 5. Create controllers
# /src/controllers/council/policies.controller.ts

# 6. Create routes
# /src/routes/council/policies.routes.ts

# 7. Register in /src/app.ts
# await fastify.register(councilPoliciesRoutes)

# 8. Test
npm test
npm run dev
```

## Testing Considerations

- Mock Prisma for service tests
- Mock external services (Slack, email, webhooks)
- Use factory functions for creating test entities
- Test pagination edge cases
- Test permission/multi-tenancy isolation
- Test error scenarios

---

**For Full Details**: See `/Users/durai/Documents/GitHub/sengol-api/COUNCIL_CODEBASE_EXPLORATION.md`
