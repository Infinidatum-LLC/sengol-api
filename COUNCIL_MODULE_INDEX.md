# Council Module Implementation Guide - Index

This document serves as a navigation guide for understanding and implementing the AI Risk Council module in the sengol-api codebase.

## Quick Navigation

### For Understanding the Architecture
Start here: **COUNCIL_CODEBASE_EXPLORATION.md**
- Complete breakdown of all type definitions
- Prisma model specifications
- Architectural patterns from existing code
- Full implementation guide with examples

### For Quick Reference During Development
Use: **COUNCIL_QUICK_REFERENCE.md**
- Enum values summary
- Prisma models quick lookup
- Code templates
- File organization
- Development workflow

## Current Status Summary

| Component | Status | Location |
|-----------|--------|----------|
| **Type Definitions** | ✓ Complete | `/src/types/council/common.ts` (224 lines) |
| **Policy Types** | ✓ Complete | `/src/types/council/policies.ts` (146 lines) |
| **Prisma Models** | Not Created | Detailed spec in exploration doc |
| **Services** | Not Created | 4 services needed |
| **Controllers** | Not Created | 4 controllers needed |
| **Routes** | Placeholder | 501 responses, needs implementation |
| **Schemas** | Not Created | Zod validation schemas needed |

## The Two Type Files Explained

### `/src/types/council/common.ts` (224 lines)
**Purpose**: Shared types across all Council modules

**What's Inside**:
- 15 Major Enums covering policies, violations, vendors, assessments, schedules
- Pagination types (PaginationParams, PaginationResponse)
- Policy Conditions with recursive structure (PolicyConditionGroup)
- Policy Actions (discriminated union with 3 types)
- Violation interface
- Response types (CouncilResponse<T> wrapper)
- Feature limit and status types

**Key Enums**: AICouncilModule, PolicyCategory, PolicyStatus, PolicySeverity, PolicyType, PolicyScope, EnforcementMode, ConditionOperator, ComparisonOperator, NotificationChannel, ViolationStatus, VendorStatus, AssessmentType, AssessmentStatus, ScheduleFrequency

### `/src/types/council/policies.ts` (146 lines)
**Purpose**: Policy Engine specific types

**What's Inside**:
- CreatePolicyRequest / Policy / UpdatePolicyRequest
- Policy evaluation types (EvaluatePolicyRequest, EvaluatePolicyResponse)
- Bulk evaluation types (BulkEvaluateRequest, BulkEvaluateResponse)
- List and query filter types
- Violation response types

## Prisma Models Needed (9 Models)

### Core Models (5)
1. **CouncilPolicy** - Policy definitions with conditions and actions
2. **CouncilViolation** - Violation tracking and lifecycle
3. **CouncilVendor** - Vendor information and risk profiles
4. **CouncilSchedule** - Automated assessment scheduling
5. **PolicyEvaluation** - Policy evaluation history

### Supporting Models (4)
6. **VendorAssessment** - Vendor assessment records
7. **VendorScorecard** - Vendor risk scorecards
8. **ScheduleRun** - Schedule execution records

See COUNCIL_CODEBASE_EXPLORATION.md Section 3 for full Prisma schema definitions.

## API Endpoints Overview

### 24 Total Endpoints Across 4 Groups

**Policy Engine** (8 endpoints)
- CRUD operations on policies
- Policy evaluation (single and bulk)
- Violation tracking

**Vendor Governance** (7 endpoints)
- CRUD operations on vendors
- Assessment triggering
- Scorecard generation

**Automated Assessment** (5 endpoints)
- CRUD operations on schedules
- Manual run triggering

**Status** (2 endpoints)
- Health check
- Module status

See COUNCIL_QUICK_REFERENCE.md for complete endpoint list.

## Implementation Phases

1. **Phase 1: Database (1-2 hrs)** - Prisma models
2. **Phase 2: Validation (1 hr)** - Zod schemas
3. **Phase 3: Business Logic (3-4 hrs)** - Services
4. **Phase 4: HTTP Layer (3-4 hrs)** - Controllers
5. **Phase 5: Routes & Integration (2 hrs)** - Route registration
6. **Phase 6: Testing (2-3 hrs)** - Unit & integration tests
7. **Phase 7: Features (ongoing)** - Advanced functionality

Total estimated time: 12-18 hours for basic implementation

## Key Design Decisions

1. **JSON Storage** - PolicyConditionGroup and PolicyActions stored as JSON (recursive/union types)
2. **Multi-tenancy** - All entities linked to GeographyAccount
3. **String Enums** - Stored as VARCHAR, not numeric
4. **Pagination** - offset/limit with hasMore boolean
5. **Response Format** - Generic CouncilResponse<T> wrapper
6. **Error Handling** - 10 custom error classes with proper HTTP codes

## Reference Implementations in Codebase

These existing implementations show the patterns to follow:

| Pattern | Reference File | What to Copy |
|---------|----------------|--------------|
| Controller | `/src/controllers/compliance.controller.ts` | Response handling, error flow |
| Service | `/src/services/risk.service.ts` | Business logic structure |
| Routes | `/src/routes/compliance.routes.ts` | Route registration pattern |
| Errors | `/src/lib/errors.ts` | Error class hierarchy |
| Models | `/src/prisma/schema.prisma` | Similar entity patterns |

## File Organization Checklist

```
EXISTING (Complete):
✓ /src/types/council/common.ts
✓ /src/types/council/policies.ts

TO CREATE:
[ ] /src/types/council/vendors.ts (optional, if needed)
[ ] /src/types/council/schedules.ts (optional, if needed)
[ ] /src/types/council/assessments.ts (optional, if needed)

[ ] /src/schemas/council/policies.ts
[ ] /src/schemas/council/vendors.ts
[ ] /src/schemas/council/schedules.ts

[ ] /src/services/council-policy.service.ts
[ ] /src/services/council-violation.service.ts
[ ] /src/services/council-vendor.service.ts
[ ] /src/services/council-schedule.service.ts

[ ] /src/controllers/council/policies.controller.ts
[ ] /src/controllers/council/violations.controller.ts
[ ] /src/controllers/council/vendors.controller.ts
[ ] /src/controllers/council/schedules.controller.ts

[ ] /src/routes/council/policies.routes.ts
[ ] /src/routes/council/violations.routes.ts
[ ] /src/routes/council/vendors.routes.ts
[ ] /src/routes/council/schedules.routes.ts

[ ] Update /src/app.ts with route registrations
[ ] Update /prisma/schema.prisma with models
```

## Critical Implementation Details

### Multi-Tenancy
- All queries must filter by `geographyAccountId`
- Inherited from existing pattern in RiskAssessment model
- Enables SaaS isolation between customers/jurisdictions

### JSON Fields Strategy
- `CouncilPolicy.conditions` → PolicyConditionGroup (recursive)
- `CouncilPolicy.actions` → PolicyActions (union type)
- Avoids complex relational schema for flexible structures

### Response Format
```typescript
// Success
{ success: true, data: {...} }

// Error
{ success: false, error: "msg", code: "CODE", statusCode: 400 }

// List
{ success: true, items: [...], pagination: {...} }
```

### Error Handling
Use custom error classes from `/src/lib/errors.ts`:
- ValidationError (400)
- NotFoundError (404)
- DatabaseError (500)
- etc.

## Development Workflow

```bash
# 1. Add Prisma models
# Edit: /prisma/schema.prisma

npx prisma generate
npx prisma migrate dev --name add_council_models

# 2. Create types (if needed beyond common.ts/policies.ts)
# Create: /src/types/council/*.ts

# 3. Create Zod schemas
# Create: /src/schemas/council/*.ts

# 4. Create services
# Create: /src/services/council-*.service.ts

# 5. Create controllers
# Create: /src/controllers/council/*.controller.ts

# 6. Create routes
# Create: /src/routes/council/*.routes.ts

# 7. Register in app.ts
# Edit: /src/app.ts
# Add: await fastify.register(councilPoliciesRoutes)

# 8. Test
npm test
npm run dev
```

## Getting Help During Implementation

1. **Type questions** → Look at `common.ts` and `policies.ts`
2. **Pattern questions** → Check `compliance.controller.ts` and `risk.service.ts`
3. **Database questions** → Review `RiskAssessment` model in `schema.prisma`
4. **Error handling** → Copy from `/src/lib/errors.ts`
5. **Route setup** → Reference `/src/routes/compliance.routes.ts`

## Files Generated from This Exploration

1. **COUNCIL_CODEBASE_EXPLORATION.md** (30 KB)
   - Complete 600+ line breakdown
   - Full Prisma model specifications
   - Code examples and patterns
   - Architectural details

2. **COUNCIL_QUICK_REFERENCE.md** (7.3 KB)
   - Quick lookup tables
   - Code templates
   - Command snippets
   - File organization

3. **COUNCIL_MODULE_INDEX.md** (this file)
   - Navigation guide
   - Quick summary
   - Checklist

## Next Steps

1. Read **COUNCIL_CODEBASE_EXPLORATION.md** for complete understanding
2. Add Prisma models to `schema.prisma` (use specs from exploration doc)
3. Create Zod schemas for request validation
4. Implement services following risk.service.ts pattern
5. Implement controllers following compliance.controller.ts pattern
6. Create route files following compliance.routes.ts pattern
7. Register routes in app.ts
8. Write tests

## Additional Resources

- CLAUDE.md - Project overview and development commands
- /src/lib/errors.ts - Available error classes
- /src/routes/compliance.routes.ts - Route pattern reference
- /src/controllers/compliance.controller.ts - Controller pattern reference
- /src/services/risk.service.ts - Service pattern reference
- /prisma/schema.prisma - Database patterns and existing models

---

**Generated**: 2025-11-18
**Exploration Method**: Comprehensive codebase scan
**Files Analyzed**: 20+ files
**Documentation Approach**: Patterns extracted from existing code
