# AI Risk Council - Backend Integration Guide

**Last Updated**: 2025-11-19
**Backend API**: https://sengol-api-dev-678287061519.us-central1.run.app
**Status**: Ready for Implementation

---

## Overview

This document provides the complete specification for implementing AI Risk Council backend endpoints. The frontend is production-ready and waiting for these API endpoints to be implemented.

**Frontend Repository**: `sengol` (Next.js)
**Backend Repository**: `sengol-api` (Node.js/Fastify on Cloud Run)
**Database**: PostgreSQL (Neon - sengol-nf)
**Authentication**: Bearer token via `Authorization` header

---

## Environment Configuration

### Backend API URL

The frontend is configured to call the backend API:

```bash
# .env.local (frontend)
NEXT_PUBLIC_API_URL=https://sengol-api-dev-678287061519.us-central1.run.app
API_AUTH_TOKEN=9BpZkJ_X1cW4NsE6Q69J61bpw4-nJvCqMaUO26flhXg
```

All frontend API calls will use:
```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/council/...`)
```

### Database Access

The backend must have access to the same PostgreSQL database:

```bash
# Backend .env
DATABASE_URL=postgresql://neondb_owner:npg_bzUfiMdp6A2G@ep-polished-snow-a4rsbutf-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

---

## Database Schema

The Prisma schema is already deployed to the database. Key models:

### Core Models

```prisma
model Policy {
  id                String   @id @default(cuid())
  geographyAccountId String
  name              String
  description       String?
  category          PolicyCategory
  severity          PolicySeverity
  type              PolicyType
  status            PolicyStatus @default(DRAFT)
  scope             Json?
  conditions        Json?
  enforcementMode   EnforcementMode
  autoRemediation   Boolean @default(false)
  notificationChannels Json?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  createdBy         String

  geographyAccount  GeographyAccount @relation(fields: [geographyAccountId], references: [id])
  violations        PolicyViolation[]

  @@index([geographyAccountId])
  @@index([status])
  @@index([category])
  @@index([severity])
}

model PolicyViolation {
  id                String   @id @default(cuid())
  policyId          String
  geographyAccountId String
  severity          PolicySeverity
  status            ViolationStatus
  detectedAt        DateTime @default(now())
  resolvedAt        DateTime?

  policy            Policy @relation(fields: [policyId], references: [id])

  @@index([policyId])
  @@index([status])
}

model Vendor {
  id                String   @id @default(cuid())
  geographyAccountId String
  name              String
  description       String?
  website           String?
  status            VendorStatus @default(ACTIVE)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([geographyAccountId])
}

model AssessmentSchedule {
  id                String   @id @default(cuid())
  geographyAccountId String
  name              String
  description       String?
  frequency         ScheduleFrequency
  status            ScheduleStatus @default(ACTIVE)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([geographyAccountId])
}
```

### Enums

```prisma
enum PolicyCategory {
  DATA_PRIVACY
  MODEL_GOVERNANCE
  SECURITY
  COMPLIANCE
  ETHICS
  OPERATIONAL
  THIRD_PARTY
}

enum PolicySeverity {
  CRITICAL
  HIGH
  MEDIUM
  LOW
  INFO
}

enum PolicyStatus {
  DRAFT
  ACTIVE
  DEPRECATED
  ARCHIVED
}

enum ViolationStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  ACKNOWLEDGED
}

enum EnforcementMode {
  DETECT
  PREVENT
  REMEDIATE
}
```

---

## API Endpoints to Implement

### 1. Module Status & Licensing

**Endpoint**: `GET /api/council/status`

**Purpose**: Returns module license status and feature usage limits for the current user

**Authentication**: Required (Bearer token)

**Request Headers**:
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Response**:
```json
{
  "success": true,
  "data": {
    "policies": {
      "allowed": true,
      "limit": 50,
      "current": 12,
      "remaining": 38,
      "upgradeRequired": false,
      "upgradeUrl": "/products/ai-council/policy-engine"
    },
    "vendors": {
      "allowed": false,
      "limit": 0,
      "current": 0,
      "remaining": 0,
      "upgradeRequired": true,
      "upgradeUrl": "/products/ai-council/vendor-governance"
    },
    "schedules": {
      "allowed": false,
      "limit": 0,
      "current": 0,
      "remaining": 0,
      "upgradeRequired": true,
      "upgradeUrl": "/products/ai-council/automated-assessment"
    },
    "licenses": {
      "policyEngine": {
        "hasAccess": true,
        "productSlug": "policy-engine",
        "expiresAt": null
      },
      "vendorGovernance": {
        "hasAccess": false,
        "productSlug": "vendor-governance",
        "expiresAt": null
      },
      "automatedAssessment": {
        "hasAccess": false,
        "productSlug": "automated-assessment",
        "expiresAt": null
      },
      "completeBundle": {
        "hasAccess": false,
        "productSlug": "ai-council-complete",
        "expiresAt": null
      }
    }
  }
}
```

**Logic**:
1. Extract `userId` from auth token
2. Get user's `currentGeographyId` from User table
3. Query `ProductAccess` table for module licenses:
   - Policy Engine: productSlug = "policy-engine"
   - Vendor Governance: productSlug = "vendor-governance"
   - Automated Assessment: productSlug = "automated-assessment"
   - Complete Bundle: productSlug = "ai-council-complete"
4. Count current usage:
   - Policies: `COUNT(*) FROM Policy WHERE geographyAccountId = ? AND status != 'ARCHIVED'`
   - Vendors: `COUNT(*) FROM Vendor WHERE geographyAccountId = ? AND status != 'INACTIVE'`
   - Schedules: `COUNT(*) FROM AssessmentSchedule WHERE geographyAccountId = ? AND status != 'INACTIVE'`
5. Apply limits based on tier:
   - Free: 10 policies, 0 vendors, 0 schedules
   - Policy Engine: 50 policies, 0 vendors, 0 schedules
   - Vendor Governance: 0 policies, 25 vendors, 0 schedules
   - Automated Assessment: 0 policies, 0 vendors, 50 schedules
   - Complete Bundle: 50 policies, 25 vendors, 50 schedules

**Frontend Usage**:
```typescript
// components/council/shared/ModuleLicenseCheck.tsx:103
// components/council/shared/FeatureLimitIndicator.tsx:52
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/council/status`)
const { data } = await response.json()
```

---

### 2. Policy CRUD Operations

#### List Policies

**Endpoint**: `GET /api/council/policies`

**Query Parameters**:
- `page` (number, default: 1): Page number
- `limit` (number, default: 20): Items per page
- `search` (string, optional): Search in name/description
- `status` (PolicyStatus, optional): Filter by status
- `category` (PolicyCategory, optional): Filter by category
- `severity` (PolicySeverity, optional): Filter by severity
- `sortBy` (string, default: "createdAt"): Sort field (createdAt, updatedAt, name, severity)
- `sortOrder` (string, default: "desc"): Sort order (asc, desc)

**Response**:
```json
{
  "success": true,
  "data": {
    "policies": [
      {
        "id": "cm3qj...",
        "name": "PII Data Protection",
        "description": "Prevent PII exposure in model outputs",
        "category": "DATA_PRIVACY",
        "severity": "CRITICAL",
        "type": "PREVENTIVE",
        "status": "ACTIVE",
        "enforcementMode": "PREVENT",
        "violationCount": 3,
        "lastEvaluatedAt": "2025-11-18T10:30:00Z",
        "createdAt": "2025-11-01T00:00:00Z",
        "updatedAt": "2025-11-15T14:20:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

**Logic**:
1. Extract `userId` and `geographyAccountId` from auth
2. Build Prisma query with filters:
```typescript
const where = {
  geographyAccountId,
  ...(search && {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ]
  }),
  ...(status && { status }),
  ...(category && { category }),
  ...(severity && { severity })
}

const policies = await prisma.policy.findMany({
  where,
  include: {
    _count: {
      select: { violations: true }
    }
  },
  orderBy: { [sortBy]: sortOrder },
  skip: (page - 1) * limit,
  take: limit
})

const total = await prisma.policy.count({ where })
```

**Frontend Usage**:
```typescript
// components/council/policy/PolicyList.tsx:85
const params = new URLSearchParams({
  page: page.toString(),
  limit: limit.toString(),
  sortBy,
  ...(search && { search }),
  ...(statusFilter !== 'all' && { status: statusFilter })
})
const response = await fetch(`${API_URL}/api/council/policies?${params}`)
```

---

#### Get Policy Details

**Endpoint**: `GET /api/council/policies/:id`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "cm3qj...",
    "name": "PII Data Protection",
    "description": "Prevent PII exposure in model outputs",
    "category": "DATA_PRIVACY",
    "severity": "CRITICAL",
    "type": "PREVENTIVE",
    "status": "ACTIVE",
    "scope": {
      "models": ["gpt-4", "claude-3"],
      "applications": ["chatbot", "email-assistant"]
    },
    "conditions": {
      "rules": [
        {
          "field": "output.content",
          "operator": "contains",
          "value": ["email", "phone", "ssn"],
          "logic": "OR"
        }
      ]
    },
    "enforcementMode": "PREVENT",
    "autoRemediation": true,
    "notificationChannels": {
      "email": ["security@company.com"],
      "slack": ["#ai-compliance"]
    },
    "violations": [
      {
        "id": "viol_...",
        "severity": "CRITICAL",
        "status": "RESOLVED",
        "detectedAt": "2025-11-18T10:30:00Z",
        "resolvedAt": "2025-11-18T11:00:00Z"
      }
    ],
    "evaluationHistory": [
      {
        "date": "2025-11-18",
        "passed": 147,
        "failed": 3,
        "totalChecks": 150
      }
    ],
    "createdAt": "2025-11-01T00:00:00Z",
    "updatedAt": "2025-11-15T14:20:00Z"
  }
}
```

**Logic**:
```typescript
const policy = await prisma.policy.findUnique({
  where: { id: params.id },
  include: {
    violations: {
      orderBy: { detectedAt: 'desc' },
      take: 10
    }
  }
})

// Verify geographyAccountId matches current user
if (policy.geographyAccountId !== currentGeographyId) {
  return { success: false, error: 'Unauthorized', status: 403 }
}
```

---

#### Create Policy

**Endpoint**: `POST /api/council/policies`

**Request Body**:
```json
{
  "name": "PII Data Protection",
  "description": "Prevent PII exposure in model outputs",
  "category": "DATA_PRIVACY",
  "severity": "CRITICAL",
  "type": "PREVENTIVE",
  "status": "DRAFT",
  "scope": {
    "models": ["gpt-4"],
    "applications": ["chatbot"]
  },
  "conditions": {
    "rules": [...]
  },
  "enforcementMode": "PREVENT",
  "autoRemediation": true,
  "notificationChannels": {
    "email": ["security@company.com"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "cm3qj...",
    "name": "PII Data Protection",
    ...
  }
}
```

**Logic**:
1. Check feature limit: `checkFeatureLimit(geographyAccountId, userId, 'policies')`
2. Create policy:
```typescript
const policy = await prisma.policy.create({
  data: {
    ...body,
    geographyAccountId,
    createdBy: userId
  }
}
)
```

---

#### Update Policy

**Endpoint**: `PUT /api/council/policies/:id`

**Request/Response**: Same as Create

**Logic**:
```typescript
const policy = await prisma.policy.update({
  where: { id: params.id },
  data: body
})
```

---

#### Delete Policy

**Endpoint**: `DELETE /api/council/policies/:id`

**Response**:
```json
{
  "success": true,
  "message": "Policy deleted successfully"
}
```

**Logic**:
```typescript
// Soft delete by archiving
await prisma.policy.update({
  where: { id: params.id },
  data: { status: 'ARCHIVED' }
})
```

---

#### Evaluate Policy

**Endpoint**: `POST /api/council/policies/:id/evaluate`

**Purpose**: Trigger policy evaluation on-demand

**Response**:
```json
{
  "success": true,
  "data": {
    "policyId": "cm3qj...",
    "evaluatedAt": "2025-11-18T10:30:00Z",
    "passed": 147,
    "failed": 3,
    "totalChecks": 150,
    "newViolations": 1
  }
}
```

**Logic**:
1. Fetch policy conditions
2. Run evaluation logic (to be implemented based on policy type)
3. Create violation records if violations detected
4. Return evaluation summary

---

### 3. Bulk Operations

#### Bulk Activate Policies

**Endpoint**: `POST /api/council/policies/bulk/activate`

**Request Body**:
```json
{
  "policyIds": ["cm3qj...", "cm3qk..."]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "updated": 5,
    "failed": 0
  }
}
```

---

#### Bulk Deactivate Policies

**Endpoint**: `POST /api/council/policies/bulk/deactivate`

**Request/Response**: Same as Activate

---

#### Bulk Archive Policies

**Endpoint**: `POST /api/council/policies/bulk/archive`

**Request/Response**: Same as Activate

---

### 4. Vendor Endpoints (Future)

**Endpoints**:
- `GET /api/council/vendors`
- `POST /api/council/vendors`
- `GET /api/council/vendors/:id`
- `PUT /api/council/vendors/:id`
- `DELETE /api/council/vendors/:id`

**Status**: Not yet required (placeholder page on frontend)

---

### 5. Assessment Schedule Endpoints (Future)

**Endpoints**:
- `GET /api/council/schedules`
- `POST /api/council/schedules`
- `GET /api/council/schedules/:id`
- `PUT /api/council/schedules/:id`
- `DELETE /api/council/schedules/:id`

**Status**: Not yet required (placeholder page on frontend)

---

## Authentication & Authorization

### Request Headers

All protected endpoints require:

```http
Authorization: Bearer 9BpZkJ_X1cW4NsE6Q69J61bpw4-nJvCqMaUO26flhXg
Content-Type: application/json
```

### Token Validation

```typescript
// Middleware example
async function authenticateRequest(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token || token !== process.env.API_AUTH_TOKEN) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    })
  }

  // Extract userId from token or session
  // Set req.userId and req.currentGeographyId
  next()
}
```

### Geography Account Isolation

All queries MUST filter by `geographyAccountId`:

```typescript
// ALWAYS include geographyAccountId in queries
const policies = await prisma.policy.findMany({
  where: {
    geographyAccountId: req.currentGeographyId,
    // other filters...
  }
})
```

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": "Error message",
  "details": {
    "field": "name",
    "message": "Policy name is required"
  }
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden (license limit exceeded, wrong geography)
- `404` - Not Found
- `409` - Conflict (duplicate)
- `500` - Internal Server Error

---

## Testing the Implementation

### 1. Health Check

```bash
curl https://sengol-api-dev-678287061519.us-central1.run.app/health
# Expected: {"status":"ok","timestamp":"...","uptime":123.45,"version":"v1"}
```

### 2. Status Endpoint

```bash
curl -H "Authorization: Bearer 9BpZkJ_X1cW4NsE6Q69J61bpw4-nJvCqMaUO26flhXg" \
  https://sengol-api-dev-678287061519.us-central1.run.app/api/council/status
```

### 3. List Policies

```bash
curl -H "Authorization: Bearer 9BpZkJ_X1cW4NsE6Q69J61bpw4-nJvCqMaUO26flhXg" \
  "https://sengol-api-dev-678287061519.us-central1.run.app/api/council/policies?page=1&limit=20"
```

### 4. Create Policy

```bash
curl -X POST \
  -H "Authorization: Bearer 9BpZkJ_X1cW4NsE6Q69J61bpw4-nJvCqMaUO26flhXg" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Policy",
    "description": "Test policy for API integration",
    "category": "DATA_PRIVACY",
    "severity": "MEDIUM",
    "type": "PREVENTIVE",
    "status": "DRAFT",
    "enforcementMode": "DETECT",
    "autoRemediation": false
  }' \
  https://sengol-api-dev-678287061519.us-central1.run.app/api/council/policies
```

---

## Frontend Integration Points

### Where Frontend Calls Backend

1. **ModuleLicenseCheck.tsx:103**
   ```typescript
   const response = await fetch(`${API_URL}/api/council/status`)
   ```

2. **FeatureLimitIndicator.tsx:52**
   ```typescript
   const response = await fetch(`${API_URL}/api/council/status`)
   ```

3. **PolicyList.tsx:85**
   ```typescript
   const response = await fetch(`${API_URL}/api/council/policies?${params}`)
   ```

4. **Policy details page** (future)
   ```typescript
   const response = await fetch(`${API_URL}/api/council/policies/${id}`)
   ```

5. **Policy create/edit** (future)
   ```typescript
   const response = await fetch(`${API_URL}/api/council/policies`, {
     method: 'POST',
     body: JSON.stringify(policyData)
   })
   ```

---

## Implementation Checklist

### Phase 1: Core Functionality (CRITICAL)
- [ ] Implement `/api/council/status` endpoint
- [ ] Implement `/api/council/policies` GET (list)
- [ ] Implement `/api/council/policies/:id` GET (details)
- [ ] Implement `/api/council/policies` POST (create)
- [ ] Implement `/api/council/policies/:id` PUT (update)
- [ ] Implement `/api/council/policies/:id` DELETE (archive)
- [ ] Implement authentication middleware
- [ ] Implement geography account isolation
- [ ] Implement feature limit checking

### Phase 2: Enhanced Features
- [ ] Implement `/api/council/policies/:id/evaluate`
- [ ] Implement bulk operations (activate, deactivate, archive)
- [ ] Implement pagination and filtering
- [ ] Implement search functionality

### Phase 3: Future Modules
- [ ] Vendor Governance endpoints
- [ ] Automated Assessment endpoints

---

## Database Migration

The Prisma schema is already deployed. To verify:

```bash
# Connect to database
psql "postgresql://neondb_owner:npg_bzUfiMdp6A2G@ep-polished-snow-a4rsbutf-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Check tables
\dt

# Verify Policy table
\d+ "Policy"
```

Expected tables:
- `Policy`
- `PolicyViolation`
- `ViolationNotification`
- `Vendor`
- `VendorAssessment`
- `VendorScorecard`
- `AssessmentSchedule`
- `AssessmentPolicy`

---

## Support & Questions

- **Frontend Documentation**: `docs/AI_RISK_COUNCIL_QUICK_START.md`
- **API Specification**: This document
- **Database Schema**: `prisma/schema.prisma` (lines 2916-3302)
- **Frontend Status**: `docs/AI_RISK_COUNCIL_FRONTEND_STATUS.md`

---

**Next Steps**:
1. Backend team implements Phase 1 endpoints
2. Test with frontend using development server
3. Deploy backend changes
4. Frontend team tests live integration
5. Proceed to Phase 2 enhancements

**Estimated Timeline**: 2-3 days for Phase 1 (core functionality)
