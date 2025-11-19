# Sengol API - Council Module Codebase Exploration Summary

Generated: 2025-11-18

## Executive Summary

The sengol-api codebase is a Fastify-based TypeScript middleware providing risk assessment and compliance management. The Council module (AI Risk Council) is in early stages with type definitions ready but no database models or implementation yet.

---

## 1. Complete Types/Council Directory Structure

### Location
`/Users/durai/Documents/GitHub/sengol-api/src/types/council/`

### Files and Purposes

#### 1.1 `common.ts` (224 lines)
**Purpose**: Shared types and enums across all Council API modules

**Key Enums Defined**:
- `AICouncilModule` - Module identifiers
  - `POLICY_ENGINE = 'ai-council-policy-engine'`
  - `VENDOR_GOVERNANCE = 'ai-council-vendor-governance'`
  - `AUTOMATED_ASSESSMENT = 'ai-council-automated-assessment'`

- `PolicyCategory` - 8 categories
  - DATA_PRIVACY, DATA_SECURITY, COMPLIANCE, GOVERNANCE, INFRASTRUCTURE, VENDOR_MANAGEMENT, INCIDENT_RESPONSE, ACCESS_CONTROL

- `PolicyStatus` - 4 states
  - DRAFT, ACTIVE, DEPRECATED, ARCHIVED

- `PolicySeverity` - 4 levels
  - LOW, MEDIUM, HIGH, CRITICAL

- `PolicyType` - 4 types
  - COMPLIANCE_CHECK, SECURITY_AUDIT, DATA_GOVERNANCE, VENDOR_RISK

- `PolicyScope` - 4 scopes
  - GLOBAL, JURISDICTION, INDUSTRY, CUSTOM

- `EnforcementMode` - 3 modes
  - ALERT, WARN, PREVENT

- `ConditionOperator` - Logical operators
  - AND, OR, NOT

- `ComparisonOperator` - 16 comparison operators
  - EQUALS, NOT_EQUALS, CONTAINS, NOT_CONTAINS, CONTAINS_ANY, CONTAINS_ALL, REGEX_MATCH, GREATER_THAN, LESS_THAN, GREATER_EQUAL, LESS_EQUAL, IN, NOT_IN, EXISTS, NOT_EXISTS

- `NotificationChannel` - 4 channels
  - EMAIL, SLACK, WEBHOOK, DASHBOARD

- `ViolationStatus` - 5 states
  - OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED, APPEALED

- `VendorStatus` - 5 states
  - ACTIVE, INACTIVE, UNDER_REVIEW, SUSPENDED, ARCHIVED

- `AssessmentType` - 5 types
  - SECURITY, COMPLIANCE, OPERATIONAL, FINANCIAL, CUSTOM

- `AssessmentStatus` - 4 statuses
  - PENDING, IN_PROGRESS, COMPLETED, FAILED

- `ScheduleFrequency` - 6 frequencies
  - DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, ANNUALLY

**Key Interfaces Defined**:

```typescript
// Pagination
interface PaginationParams { limit?: number; offset?: number }
interface PaginationResponse { total, limit, offset, hasMore }

// Policy Conditions (nested/recursive)
interface PolicyCondition { field, operator, value? }
interface PolicyConditionGroup { operator: ConditionOperator; conditions: [] }

// Policy Actions (discriminated union)
interface NotificationAction { type: 'notify'; channels[]; recipients?; webhookUrl? }
interface BlockAction { type: 'block'; message; autoRemediateAfterHours? }
interface RemediateAction { type: 'remediate'; action; parameters? }
type PolicyAction = NotificationAction | BlockAction | RemediateAction

interface PolicyActions { onViolation: PolicyAction[]; onApproval?: PolicyAction[] }

// Violation entity
interface Violation {
  id, policyId, assessmentId?, vendorId?, status, severity, 
  detectedAt, resolvedAt?, description, evidence?
}

// Feature Limits
interface FeatureLimitInfo { feature, limit, used, remaining, upgradeUrl }
interface ModuleStatus { module, enabled, limits[] }
interface CouncilStatus { timestamp, modules[], dbHealth }

// Response Types
interface CouncilError { error, details, statusCode, field?, upgradeUrl? }
interface CouncilSuccess<T> { success: true; data: T }
type CouncilResponse<T> = CouncilSuccess<T> | CouncilError
```

#### 1.2 `policies.ts` (146 lines)
**Purpose**: Policy Engine specific types for CRUD and evaluation operations

**Key Interfaces**:

```typescript
// Create/Update
interface CreatePolicyRequest {
  name, description, category, severity, policyType, scope,
  jurisdictions?, industries?, conditions, enforcementMode,
  autoRemediate, actions
}

interface Policy extends CreatePolicyRequest {
  id, status, version, createdBy, createdAt, updatedAt,
  lastReviewedAt?, reviewedBy?, geographyAccountId,
  violationCount?, lastEvaluatedAt?
}

interface UpdatePolicyRequest { ... partial fields ... }

// Evaluation
interface EvaluatePolicyRequest {
  assessmentId, systemDescription?, industry?,
  jurisdictions?, dataTypes?, techStack?
}

interface EvaluatePolicyResponse {
  policyId, violated, violations?,
  evidence?, severity
}

interface BulkEvaluateRequest {
  assessmentId, policies?, systemDescription?,
  industry?, jurisdictions?, dataTypes?, techStack?
}

interface BulkEvaluateResponse {
  assessmentId, totalPolicies, violatedCount,
  passedCount, results[], evaluatedAt
}

// Responses
interface PolicyListResponse { policies[], pagination }
interface ListViolationsResponse { violations[], pagination }
interface ViolationResponse { ... violation fields ... }

// Query Filters
interface ListPoliciesQuery extends PaginationParams {
  category?, status?, severity?
}

interface ListViolationsQuery extends PaginationParams {
  policyId?, assessmentId?, vendorId?,
  status?, severity?
}
```

---

## 2. Key Type Definitions and Enums Summary

### Critical Enums Count: 11 Major Enums + Operator Enums

| Enum Name | Values | Purpose |
|-----------|--------|---------|
| AICouncilModule | 3 | Module identifiers |
| PolicyCategory | 8 | Categorize policy domains |
| PolicyStatus | 4 | Policy lifecycle state |
| PolicySeverity | 4 | Risk severity levels |
| PolicyType | 4 | Policy classification |
| PolicyScope | 4 | Policy applicability |
| EnforcementMode | 3 | Action on violation |
| ConditionOperator | 3 | Logical operators (AND/OR/NOT) |
| ComparisonOperator | 16 | Field comparison operators |
| NotificationChannel | 4 | Alert delivery channels |
| ViolationStatus | 5 | Violation lifecycle |
| VendorStatus | 5 | Vendor status tracking |
| AssessmentType | 5 | Assessment classification |
| AssessmentStatus | 4 | Assessment progress |
| ScheduleFrequency | 6 | Automation frequency |

### Type Hierarchy
```
PaginationParams/Response
├── ListPoliciesQuery (extends PaginationParams)
├── ListViolationsQuery (extends PaginationParams)
├── PolicyListResponse (has PaginationResponse)
└── ListViolationsResponse (has PaginationResponse)

PolicyConditionGroup (recursive)
├── conditions[]: (PolicyCondition | PolicyConditionGroup)[]

PolicyAction (discriminated union)
├── NotificationAction
├── BlockAction
└── RemediateAction

PolicyActions
└── onViolation: PolicyAction[]
    └── onApproval?: PolicyAction[]

CouncilResponse<T> (generic discriminated union)
├── CouncilSuccess<T>
└── CouncilError
```

---

## 3. Prisma Models for Council Entities

### Current Status: **NO COUNCIL MODELS EXIST IN SCHEMA**

The Prisma schema (`/Users/durai/Documents/GitHub/sengol-api/prisma/schema.prisma`) contains **79+ models** but **NONE** for Council entities:

- No `CouncilPolicy` model
- No `CouncilVendor` model
- No `CouncilSchedule` model
- No `CouncilViolation` model
- No `PolicyEvaluation` model

### Related Models That Exist (for reference)
```prisma
model RiskAssessment {
  id                    String
  userId                String
  projectId             String?
  name                  String
  industry              String
  // ... 30+ fields for assessment data
  riskNotes             Json?  // Flexible JSON storage pattern
  // ... relationships to other models
}

model User {
  id                    String
  email                 String
  name                  String?
  geographyAccountId    String?
  // ... 15+ other fields
}

model GeographyAccount {
  id                    String
  name                  String
  jurisdiction          String
  // ... multi-tenancy support
}

model Project {
  id                    String
  name                  String
  userId                String
  geographyAccountId    String?
  // ... project tracking
}
```

### Database Model Requirements

Based on type definitions, you'll need to create these Prisma models:

#### 1. **CouncilPolicy Model**
```prisma
model CouncilPolicy {
  id                    String      @id @default(cuid())
  geographyAccountId    String
  
  // Basic info
  name                  String
  description           String      @db.Text
  category              String      // PolicyCategory enum value
  severity              String      // PolicySeverity enum value
  policyType            String      // PolicyType enum value
  scope                 String      // PolicyScope enum value
  status                String      @default("DRAFT") // PolicyStatus enum value
  
  // Jurisdictions & Industries
  jurisdictions         String[]    @default([])
  industries            String[]    @default([])
  
  // Conditions & Actions (stored as JSON due to nesting complexity)
  conditions            Json        // PolicyConditionGroup (recursive structure)
  actions               Json        // PolicyActions
  
  // Enforcement
  enforcementMode       String      // EnforcementMode enum value
  autoRemediate         Boolean     @default(false)
  
  // Versioning & Tracking
  version               Int         @default(1)
  createdBy             String
  updatedBy             String?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  lastReviewedAt        DateTime?
  reviewedBy            String?
  lastEvaluatedAt       DateTime?
  violationCount        Int         @default(0)
  
  // Relations
  geographyAccount      GeographyAccount @relation(fields: [geographyAccountId], references: [id], onDelete: Cascade)
  violations            CouncilViolation[]
  evaluations           PolicyEvaluation[]
  
  @@index([geographyAccountId])
  @@index([status])
  @@index([category])
  @@index([severity])
}
```

#### 2. **CouncilViolation Model**
```prisma
model CouncilViolation {
  id                    String      @id @default(cuid())
  policyId              String
  assessmentId          String?
  vendorId              String?
  
  // Status tracking
  status                String      // ViolationStatus enum value
  severity              String      // PolicySeverity enum value
  
  // Detection & Resolution
  detectedAt            DateTime    @default(now())
  resolvedAt            DateTime?
  description           String      @db.Text
  evidence              Json?       // Evidence data
  
  // Metadata
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  
  // Relations
  policy                CouncilPolicy @relation(fields: [policyId], references: [id], onDelete: Cascade)
  riskAssessment        RiskAssessment? @relation(fields: [assessmentId], references: [id], onDelete: SetNull)
  vendor                CouncilVendor? @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  
  @@index([policyId])
  @@index([assessmentId])
  @@index([vendorId])
  @@index([status])
}
```

#### 3. **CouncilVendor Model**
```prisma
model CouncilVendor {
  id                    String      @id @default(cuid())
  geographyAccountId    String
  
  // Basic info
  name                  String
  description           String?     @db.Text
  status                String      // VendorStatus enum value
  
  // Vendor details
  vendorType            String?
  contactEmail          String?
  website               String?
  riskProfile           Json?
  
  // Assessment info
  lastAssessmentAt      DateTime?
  riskScore             Float?
  
  // Metadata
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  
  // Relations
  geographyAccount      GeographyAccount @relation(fields: [geographyAccountId], references: [id], onDelete: Cascade)
  assessments           VendorAssessment[]
  violations            CouncilViolation[]
  scorecards            VendorScorecard[]
  
  @@index([geographyAccountId])
  @@index([status])
}
```

#### 4. **CouncilSchedule Model**
```prisma
model CouncilSchedule {
  id                    String      @id @default(cuid())
  geographyAccountId    String
  
  // Basic info
  name                  String
  description           String?     @db.Text
  
  // Scheduling
  frequency             String      // ScheduleFrequency enum value
  isActive              Boolean     @default(true)
  
  // Assessment type
  assessmentType        String      // AssessmentType enum value
  policyIds             String[]    @default([]) // Associated policies
  
  // Last run info
  lastRunAt             DateTime?
  nextRunAt             DateTime?
  status                String      @default("PENDING") // AssessmentStatus
  
  // Metadata
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  
  // Relations
  geographyAccount      GeographyAccount @relation(fields: [geographyAccountId], references: [id], onDelete: Cascade)
  runs                  ScheduleRun[]
  
  @@index([geographyAccountId])
  @@index([frequency])
}
```

#### 5. **Supporting Models**

```prisma
model PolicyEvaluation {
  id                    String      @id @default(cuid())
  policyId              String
  assessmentId          String
  
  violated              Boolean
  result                Json        // EvaluatePolicyResponse data
  evidence              Json?
  
  evaluatedAt           DateTime    @default(now())
  createdAt             DateTime    @default(now())
  
  policy                CouncilPolicy @relation(fields: [policyId], references: [id], onDelete: Cascade)
  riskAssessment        RiskAssessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  
  @@index([policyId])
  @@index([assessmentId])
  @@unique([policyId, assessmentId])
}

model VendorAssessment {
  id                    String      @id @default(cuid())
  vendorId              String
  assessmentId          String?
  
  type                  String      // AssessmentType enum value
  status                String      // AssessmentStatus enum value
  
  result                Json?
  riskScore             Float?
  
  startedAt             DateTime    @default(now())
  completedAt           DateTime?
  
  vendor                CouncilVendor @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  riskAssessment        RiskAssessment? @relation(fields: [assessmentId], references: [id], onDelete: SetNull)
  
  @@index([vendorId])
}

model VendorScorecard {
  id                    String      @id @default(cuid())
  vendorId              String
  
  category              String
  score                 Float
  details               Json?
  
  generatedAt           DateTime    @default(now())
  
  vendor                CouncilVendor @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  
  @@index([vendorId])
}

model ScheduleRun {
  id                    String      @id @default(cuid())
  scheduleId            String
  
  status                String      // AssessmentStatus enum value
  startedAt             DateTime    @default(now())
  completedAt           DateTime?
  result                Json?
  error                 String?
  
  schedule              CouncilSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  
  @@index([scheduleId])
}
```

---

## 4. Service/Controller Architectural Pattern

### Directory Structure Pattern

```
/src
├── controllers/
│   ├── {resource}.controller.ts      # HTTP request handlers
│   └── council/                      # Empty (placeholder)
├── services/
│   ├── {resource}.service.ts         # Business logic
│   └── (none for council yet)
├── routes/
│   ├── {resource}.routes.ts          # Route registration
│   └── council.routes.ts             # Placeholder with 501 responses
├── types/
│   └── council/
│       ├── common.ts                 # Shared types/enums
│       └── policies.ts               # Policy-specific types
└── schemas/
    └── council/                      # Empty (validation schemas would go here)
```

### Controller Pattern

**Template from existing controllers** (`compliance.controller.ts`, `review.controller.ts`):

```typescript
// 1. IMPORTS
import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { ValidationError, NotFoundError, DatabaseError } from '../lib/errors'

// 2. TYPE DEFINITIONS (Request/Response interfaces)
interface CreatePolicyBody {
  name: string
  description: string
  // ... typed fields
}

interface CreatePolicyParams {}

// 3. CONTROLLER FUNCTIONS (Fastify-style)
export async function createPolicyController(
  request: FastifyRequest<{
    Body: CreatePolicyBody
    Params: CreatePolicyParams
  }>,
  reply: FastifyReply
) {
  try {
    // 3a. Validation
    const { name, description } = request.body
    if (!name || name.trim().length === 0) {
      throw new ValidationError('name is required')
    }

    // 3b. Logging
    request.log.info({ name }, 'Creating policy')

    // 3c. Database operations
    const policy = await prisma.councilPolicy.create({
      data: {
        name,
        description,
        geographyAccountId: 'from-context',
        // ...
      }
    })

    // 3d. Success response
    return reply.code(201).send({
      success: true,
      data: policy
    })
  } catch (error) {
    // 3e. Error handling
    request.log.error({ err: error }, 'Failed to create policy')

    if (error instanceof ValidationError) {
      return reply.code(400).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: 400
      })
    }

    if (error instanceof NotFoundError) {
      return reply.code(404).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: 404
      })
    }

    // Default 500 error
    return reply.code(500).send({
      success: false,
      error: 'Failed to create policy',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500
    })
  }
}
```

### Service Pattern

**Template from existing services** (`risk.service.ts`, `benchmark.service.ts`):

```typescript
// 1. IMPORTS
import { prisma } from '../lib/prisma'
import { ValidationError, DatabaseError } from '../lib/errors'

// 2. TYPE DEFINITIONS (business logic interfaces)
interface PolicyEvaluationInput {
  policyId: string
  assessmentContext: Record<string, any>
}

interface PolicyEvaluationResult {
  violated: boolean
  violations?: Violation[]
  severity: PolicySeverity
}

// 3. CORE FUNCTIONS (pure business logic)
export async function evaluatePolicy(
  input: PolicyEvaluationInput
): Promise<PolicyEvaluationResult> {
  const { policyId, assessmentContext } = input

  // Fetch policy
  const policy = await prisma.councilPolicy.findUnique({
    where: { id: policyId }
  })

  if (!policy) {
    throw new NotFoundError('Policy', policyId)
  }

  // Evaluate conditions against context
  const violations = evaluateConditions(
    policy.conditions as PolicyConditionGroup,
    assessmentContext
  )

  return {
    violated: violations.length > 0,
    violations,
    severity: policy.severity as PolicySeverity
  }
}

// 4. HELPER FUNCTIONS (implementation details)
function evaluateConditions(
  group: PolicyConditionGroup,
  context: Record<string, any>
): Violation[] {
  // Implementation...
}
```

### Routes Pattern

**Template from existing routes** (`compliance.routes.ts`, `council.routes.ts`):

```typescript
// 1. IMPORTS
import { FastifyInstance } from 'fastify'
import { 
  createPolicyController, 
  listPoliciesController 
} from '../controllers/council.controller'

// 2. ROUTE REGISTRATION FUNCTION
export async function councilPolicyRoutes(fastify: FastifyInstance) {
  // POST - Create
  fastify.post<{ Body: CreatePolicyRequest }>(
    '/api/council/policies',
    {
      schema: {
        description: 'Create a new policy',
        tags: ['council', 'policies'],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            // ...
          },
          required: ['name', 'description']
        },
        response: {
          201: { type: 'object', properties: { success: true, data: {} } },
          400: { type: 'object', properties: { error: 'string' } }
        }
      }
    },
    createPolicyController
  )

  // GET - List with filtering
  fastify.get<{ Querystring: ListPoliciesQuery }>(
    '/api/council/policies',
    {
      schema: {
        description: 'List policies with filters',
        tags: ['council', 'policies'],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
            offset: { type: 'number' },
            status: { type: 'string' },
            category: { type: 'string' }
          }
        }
      }
    },
    listPoliciesController
  )

  // GET - Detail
  fastify.get<{ Params: { id: string } }>(
    '/api/council/policies/:id',
    getPolicyController
  )

  // PUT - Update
  fastify.put<{ Params: { id: string }; Body: UpdatePolicyRequest }>(
    '/api/council/policies/:id',
    updatePolicyController
  )

  // DELETE
  fastify.delete<{ Params: { id: string } }>(
    '/api/council/policies/:id',
    deletePolicyController
  )

  // POST - Special action
  fastify.post<{ 
    Params: { id: string }
    Body: EvaluatePolicyRequest 
  }>(
    '/api/council/policies/:id/evaluate',
    evaluatePolicyController
  )
}
```

### Error Handling Pattern

**Available custom error classes** (from `/src/lib/errors.ts`):

```typescript
AppError              // Base error class
├── ValidationError   // 400 Bad Request
├── DatabaseError     // 500 Database operation failed
├── NotFoundError     // 404 Resource not found
├── AuthenticationError // 401 Authentication required
├── AuthorizationError  // 403 Insufficient permissions
├── VectorDBError     // 503 Vector DB unavailable
├── LLMError          // 503 LLM service error
├── CircuitBreakerError // 503 Service circuit breaker open
├── TimeoutError      // 408 Operation timeout
└── RateLimitError    // 429 Rate limit exceeded
```

**Usage Pattern**:
```typescript
throw new ValidationError('Field is required', { field: 'name' })
throw new NotFoundError('Policy', policyId)
throw new DatabaseError('Failed to update policy')
```

### Database Query Pattern

**Commonly used Prisma patterns** (from existing code):

```typescript
// Simple CRUD
const policy = await prisma.councilPolicy.findUnique({ where: { id } })
const policies = await prisma.councilPolicy.findMany({ where: {...} })

const created = await prisma.councilPolicy.create({ data: {...} })
const updated = await prisma.councilPolicy.update({ 
  where: { id }, 
  data: {...} 
})

const deleted = await prisma.councilPolicy.delete({ where: { id } })

// With relations
const withViolations = await prisma.councilPolicy.findUnique({
  where: { id },
  include: { violations: true }
})

// Pagination pattern (observed in code)
const [policies, total] = await Promise.all([
  prisma.councilPolicy.findMany({
    skip: offset || 0,
    take: limit || 10,
    where: {...}
  }),
  prisma.councilPolicy.count({ where: {...} })
])

// Transactions (for multi-step operations)
await prisma.$transaction(async (tx) => {
  const policy = await tx.councilPolicy.create({...})
  const violation = await tx.councilViolation.create({...})
})
```

---

## 5. Implementation Checklist for Council Module

### Phase 1: Database Setup
- [ ] Create Prisma models:
  - [ ] `CouncilPolicy`
  - [ ] `CouncilViolation`
  - [ ] `CouncilVendor`
  - [ ] `CouncilSchedule`
  - [ ] Supporting models (PolicyEvaluation, VendorAssessment, VendorScorecard, ScheduleRun)
- [ ] Run `npx prisma generate`
- [ ] Create migration: `npx prisma migrate dev --name add_council_models`

### Phase 2: Type & Schema Validation
- [ ] Create Zod schemas in `/src/schemas/council/` for request validation
- [ ] Create additional type files if needed:
  - [ ] `vendors.ts` - Vendor types
  - [ ] `schedules.ts` - Schedule types
  - [ ] `assessments.ts` - Assessment types

### Phase 3: Services Implementation
- [ ] Create `/src/services/council-policy.service.ts`
  - [ ] CRUD operations
  - [ ] Policy evaluation logic
  - [ ] Bulk evaluation
- [ ] Create `/src/services/council-violation.service.ts`
  - [ ] Violation lifecycle management
  - [ ] Filtering and querying
- [ ] Create `/src/services/council-vendor.service.ts`
  - [ ] Vendor management
  - [ ] Assessment triggering
  - [ ] Scorecard generation
- [ ] Create `/src/services/council-schedule.service.ts`
  - [ ] Schedule creation/management
  - [ ] Cron job integration
  - [ ] Run history tracking

### Phase 4: Controllers Implementation
- [ ] Create `/src/controllers/council/policies.controller.ts`
- [ ] Create `/src/controllers/council/violations.controller.ts`
- [ ] Create `/src/controllers/council/vendors.controller.ts`
- [ ] Create `/src/controllers/council/schedules.controller.ts`

### Phase 5: Routes Implementation
- [ ] Update `/src/routes/council/` with separate route files
- [ ] Implement all endpoints currently returning 501

### Phase 6: Integration
- [ ] Update `/src/app.ts` to register individual council route modules
- [ ] Add authentication middleware to protected endpoints
- [ ] Add request validation middleware
- [ ] Test all endpoints

### Phase 7: Features
- [ ] Multi-tenancy support (via GeographyAccount)
- [ ] Audit logging for policy changes
- [ ] Notification system for violations
- [ ] Reporting/Analytics endpoints

---

## 6. Key Architectural Notes

### 1. **Multi-Tenancy**
- All Council entities should have `geographyAccountId` field
- Filter queries by `geographyAccountId` for data isolation
- Follows pattern from existing models (RiskAssessment, Project, etc.)

### 2. **JSON Storage Strategy**
- **PolicyConditionGroup**: Use JSON field for recursive structure (no single table design)
- **PolicyActions**: Use JSON field for discriminated union pattern
- **PolicyEvaluation result**: Use JSON for flexible evidence data
- Pattern follows existing `riskNotes` in RiskAssessment model

### 3. **Enum Conventions**
- Store enum values as STRING in database (not numeric)
- Use `@default()` for initial status values
- Create validation at Zod schema level

### 4. **Relationships**
- Use `@relation` with `onDelete` strategies:
  - `Cascade` for parent → children (policy → violations)
  - `SetNull` for optional references (assessment, vendor)
- Create indexes on foreign keys and filter fields

### 5. **Response Format**
- Standardized: `{ success: true/false, data/error: ... }`
- Use `StatusCode` in HTTP response as well
- Include `code` field for programmatic error handling
- Pagination responses include: `{ total, limit, offset, hasMore }`

### 6. **Error Handling Flow**
```
Controller → Validation (400)
         → Service Operation
         → NotFound (404)
         → Database Error (500)
         → Operational Error (catch block)
```

### 7. **Request Logging**
- Use `request.log` (provided by Fastify) for structured logging
- Include relevant IDs (policyId, assessmentId, userId)
- Always log before/after expensive operations

---

## 7. File Locations Summary

| Category | Path | Purpose |
|----------|------|---------|
| Types | `/src/types/council/common.ts` | All shared enums and base interfaces |
| Types | `/src/types/council/policies.ts` | Policy-specific types |
| Controllers | `/src/controllers/council/` | HTTP request handlers (to be created) |
| Services | `/src/services/` | Business logic (to be created) |
| Routes | `/src/routes/council.routes.ts` | Route registration (placeholder) |
| Schemas | `/src/schemas/council/` | Validation schemas (to be created) |
| Database | `/prisma/schema.prisma` | Models (to be created) |

---

## 8. Frontend Integration Points

Based on `/src/routes/council.routes.ts`, the API will expose these endpoints:

### Policy Engine
```
POST   /api/council/policies                      # Create
GET    /api/council/policies                      # List
GET    /api/council/policies/:id                  # Get
PUT    /api/council/policies/:id                  # Update
DELETE /api/council/policies/:id                  # Delete
POST   /api/council/policies/:id/evaluate         # Evaluate single
POST   /api/council/policies/evaluate-all         # Evaluate all
GET    /api/council/violations                    # List violations
PUT    /api/council/violations/:id                # Update violation
```

### Vendor Governance
```
POST   /api/council/vendors                       # Create
GET    /api/council/vendors                       # List
GET    /api/council/vendors/:id                   # Get
PUT    /api/council/vendors/:id                   # Update
DELETE /api/council/vendors/:id                   # Delete
POST   /api/council/vendors/:id/assess            # Start assessment
GET    /api/council/vendors/:vendorId/assessments/:assessmentId
POST   /api/council/vendors/:id/scorecard         # Generate scorecard
GET    /api/council/vendors/:id/scorecards        # Get scorecards
```

### Automated Assessment
```
POST   /api/council/schedules                     # Create
GET    /api/council/schedules                     # List
GET    /api/council/schedules/:id                 # Get
PUT    /api/council/schedules/:id                 # Update
DELETE /api/council/schedules/:id                 # Delete
POST   /api/council/schedules/:id/run-now         # Trigger run
```

### Status
```
GET    /api/council/health                        # Health check
GET    /api/council/status                        # Module status
```

---

## Summary

The Council module is architecturally well-designed with comprehensive types but needs:

1. **Database Models**: 5 main models + 4 supporting models
2. **Service Layer**: 4 main services following established patterns
3. **Controller Layer**: 4 controller files with CRUD + special operations
4. **Route Registration**: Implementation of 501 placeholder endpoints
5. **Validation Schemas**: Zod schemas for request validation
6. **Feature Development**: Policy evaluation, vendor assessment, automated scheduling

The codebase uses consistent patterns for:
- Error handling (custom error classes)
- Response formatting (success/error wrapper)
- Database queries (Prisma patterns)
- Route registration (Fastify hooks)
- Request validation (via schemas)
- Logging (structured request logging)
- Multi-tenancy (via GeographyAccount FK)

All new code should follow these established patterns for consistency.
