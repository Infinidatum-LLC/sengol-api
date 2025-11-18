# AI Risk Council - Backend API Specification

**Version:** 1.0
**Date:** 2025-11-18
**Database:** sengol-nf (PostgreSQL via Neon)
**Base URL:** `/api/council`

## Overview

The AI Risk Council provides three independently licensed modules:
1. **Policy Engine** - Declarative policy creation and enforcement
2. **Vendor Governance** - Third-party AI vendor risk management
3. **Automated Assessment** - Scheduled continuous risk assessments

All endpoints require authentication and check module licenses before processing requests.

---

## Authentication & Authorization

### Headers Required
```http
Authorization: Bearer <session-token>
Content-Type: application/json
```

### License Checking Pattern
Every endpoint must verify:
1. User is authenticated (NextAuth session)
2. User has access to required module
3. Geography account has not exceeded feature limits

```typescript
// Example from any endpoint
const session = await getServerSession(authOptions)
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

await requireModuleAccess(session.user.id, AI_COUNCIL_PRODUCTS.POLICY_ENGINE)
await enforceFeatureLimit(geographyAccountId, session.user.id, 'policies')
```

---

## Module 1: Policy Engine API

### Product Slug
`ai-council-policy-engine`

### Feature Limits
- Maximum 50 active policies per geography account
- 90-day violation retention
- Unlimited policy evaluations

---

### 1.1 Create Policy

**Endpoint:** `POST /api/council/policies`

**Description:** Create a new governance policy with declarative conditions

**Request Body:**
```json
{
  "name": "Data Residency Compliance",
  "description": "Ensure all AI systems processing EU citizen data comply with GDPR data residency requirements",
  "category": "DATA_PRIVACY",
  "severity": "HIGH",
  "policyType": "COMPLIANCE_CHECK",
  "scope": "JURISDICTION",
  "jurisdictions": ["EU", "UK"],
  "industries": ["healthcare", "finance"],
  "conditions": {
    "operator": "AND",
    "conditions": [
      {
        "field": "jurisdictions",
        "operator": "CONTAINS",
        "value": "EU"
      },
      {
        "field": "dataTypes",
        "operator": "CONTAINS_ANY",
        "value": ["PII", "Health"]
      },
      {
        "field": "techStack",
        "operator": "NOT_CONTAINS",
        "value": "AWS US-EAST-1"
      }
    ]
  },
  "enforcementMode": "PREVENT",
  "autoRemediate": false,
  "actions": {
    "onViolation": [
      {
        "type": "notify",
        "channels": ["email", "slack"],
        "recipients": ["compliance@company.com"]
      },
      {
        "type": "block",
        "message": "Assessment violates GDPR data residency requirements"
      }
    ]
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "pol_abc123",
  "name": "Data Residency Compliance",
  "category": "DATA_PRIVACY",
  "severity": "HIGH",
  "status": "ACTIVE",
  "version": 1,
  "createdBy": "user_xyz",
  "createdAt": "2025-11-18T10:30:00Z",
  "geographyAccountId": "geo_123"
}
```

**Errors:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No license or limit exceeded
- `400 Bad Request` - Invalid policy definition

---

### 1.2 List Policies

**Endpoint:** `GET /api/council/policies`

**Query Parameters:**
- `category` (optional): Filter by category
- `status` (optional): Filter by status (DRAFT, ACTIVE, DEPRECATED, ARCHIVED)
- `severity` (optional): Filter by severity
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset

**Response:** `200 OK`
```json
{
  "policies": [
    {
      "id": "pol_abc123",
      "name": "Data Residency Compliance",
      "category": "DATA_PRIVACY",
      "severity": "HIGH",
      "status": "ACTIVE",
      "enforcementMode": "PREVENT",
      "violationCount": 3,
      "lastEvaluatedAt": "2025-11-18T09:00:00Z",
      "createdAt": "2025-11-18T08:00:00Z"
    }
  ],
  "pagination": {
    "total": 12,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### 1.3 Get Policy Details

**Endpoint:** `GET /api/council/policies/:id`

**Response:** `200 OK`
```json
{
  "id": "pol_abc123",
  "name": "Data Residency Compliance",
  "description": "Ensure all AI systems...",
  "category": "DATA_PRIVACY",
  "severity": "HIGH",
  "status": "ACTIVE",
  "policyType": "COMPLIANCE_CHECK",
  "scope": "JURISDICTION",
  "jurisdictions": ["EU", "UK"],
  "industries": ["healthcare", "finance"],
  "conditions": { /* full conditions object */ },
  "enforcementMode": "PREVENT",
  "autoRemediate": false,
  "actions": { /* actions object */ },
  "version": 1,
  "createdBy": "user_xyz",
  "createdAt": "2025-11-18T08:00:00Z",
  "updatedAt": "2025-11-18T08:00:00Z",
  "lastReviewedAt": null,
  "reviewedBy": null,
  "recentViolations": [
    {
      "id": "vio_123",
      "assessmentId": "assess_456",
      "severity": "HIGH",
      "detectedAt": "2025-11-18T09:15:00Z",
      "status": "OPEN"
    }
  ]
}
```

---

### 1.4 Update Policy

**Endpoint:** `PUT /api/council/policies/:id`

**Request Body:** (Same as Create Policy, all fields optional)

**Response:** `200 OK`
```json
{
  "id": "pol_abc123",
  "version": 2,
  "updatedAt": "2025-11-18T11:00:00Z",
  "message": "Policy updated successfully"
}
```

**Note:** Version is automatically incremented on each update.

---

### 1.5 Delete Policy

**Endpoint:** `DELETE /api/council/policies/:id`

**Query Parameters:**
- `archive` (optional): If true, archives instead of deleting

**Response:** `200 OK`
```json
{
  "message": "Policy deleted successfully",
  "id": "pol_abc123"
}
```

---

### 1.6 Evaluate Policy Against Assessment

**Endpoint:** `POST /api/council/policies/:id/evaluate`

**Description:** Evaluate a policy against a risk assessment to detect violations

**Request Body:**
```json
{
  "assessmentId": "assess_789"
}
```

**Response:** `200 OK`
```json
{
  "policyId": "pol_abc123",
  "assessmentId": "assess_789",
  "passed": false,
  "violations": [
    {
      "id": "vio_new123",
      "severity": "HIGH",
      "violationType": "DATA_RESIDENCY_VIOLATION",
      "detectedAt": "2025-11-18T12:00:00Z",
      "violationData": {
        "field": "techStack",
        "expected": "NOT AWS US-EAST-1",
        "actual": "AWS US-EAST-1",
        "message": "Assessment uses US data centers for EU citizen data"
      },
      "evidenceIds": ["assess_789"],
      "status": "OPEN"
    }
  ],
  "enforcementAction": "BLOCKED",
  "notificationsSent": ["compliance@company.com"]
}
```

---

### 1.7 Bulk Evaluate All Policies

**Endpoint:** `POST /api/council/policies/evaluate-all`

**Description:** Evaluate all active policies against an assessment

**Request Body:**
```json
{
  "assessmentId": "assess_789"
}
```

**Response:** `200 OK`
```json
{
  "assessmentId": "assess_789",
  "evaluatedPolicies": 12,
  "passedPolicies": 9,
  "failedPolicies": 3,
  "violations": [
    {
      "policyId": "pol_abc123",
      "policyName": "Data Residency Compliance",
      "violationId": "vio_123",
      "severity": "HIGH"
    }
  ],
  "overallStatus": "VIOLATIONS_DETECTED",
  "blockingViolations": 1
}
```

---

### 1.8 List Policy Violations

**Endpoint:** `GET /api/council/violations`

**Query Parameters:**
- `policyId` (optional): Filter by policy
- `assessmentId` (optional): Filter by assessment
- `status` (optional): OPEN, ACKNOWLEDGED, IN_REMEDIATION, RESOLVED, etc.
- `severity` (optional): Filter by severity
- `fromDate` (optional): ISO date string
- `toDate` (optional): ISO date string
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset

**Response:** `200 OK`
```json
{
  "violations": [
    {
      "id": "vio_123",
      "policyId": "pol_abc123",
      "policyName": "Data Residency Compliance",
      "assessmentId": "assess_789",
      "severity": "HIGH",
      "violationType": "DATA_RESIDENCY_VIOLATION",
      "detectedAt": "2025-11-18T09:15:00Z",
      "status": "OPEN",
      "autoRemediated": false
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 50,
    "offset": 0
  }
}
```

---

### 1.9 Update Violation Status

**Endpoint:** `PUT /api/council/violations/:id`

**Request Body:**
```json
{
  "status": "RESOLVED",
  "resolution": "Migrated data processing to EU-WEST-1 region",
  "resolvedBy": "user_xyz"
}
```

**Response:** `200 OK`
```json
{
  "id": "vio_123",
  "status": "RESOLVED",
  "resolvedAt": "2025-11-18T14:00:00Z",
  "resolvedBy": "user_xyz"
}
```

---

## Module 2: Vendor Governance API

### Product Slug
`ai-council-vendor-governance`

### Feature Limits
- Maximum 25 vendors per geography account
- 1 assessment per vendor per month included
- Additional assessments: $50 each
- 24-month scorecard retention

---

### 2.1 Create Vendor

**Endpoint:** `POST /api/council/vendors`

**Request Body:**
```json
{
  "name": "OpenAI",
  "description": "AI model provider - GPT-4, ChatGPT",
  "website": "https://openai.com",
  "vendorType": "LLM_PROVIDER",
  "category": "AI Models",
  "industries": ["technology", "enterprise"],
  "primaryContact": "partnerships@openai.com",
  "contractStartDate": "2024-01-01",
  "contractEndDate": "2025-12-31",
  "contractValue": 120000.00,
  "riskTier": "HIGH",
  "certifications": {
    "iso27001": true,
    "soc2": true,
    "hipaa": false
  },
  "dataResidency": ["US", "EU"],
  "jurisdictions": ["US", "EU", "UK"]
}
```

**Response:** `201 Created`
```json
{
  "id": "ven_abc123",
  "name": "OpenAI",
  "vendorType": "LLM_PROVIDER",
  "riskTier": "HIGH",
  "createdAt": "2025-11-18T10:00:00Z",
  "nextAssessmentDue": "2025-12-18T00:00:00Z"
}
```

---

### 2.2 List Vendors

**Endpoint:** `GET /api/council/vendors`

**Query Parameters:**
- `vendorType` (optional)
- `riskTier` (optional)
- `category` (optional)
- `limit`, `offset` for pagination

**Response:** `200 OK`
```json
{
  "vendors": [
    {
      "id": "ven_abc123",
      "name": "OpenAI",
      "vendorType": "LLM_PROVIDER",
      "riskTier": "HIGH",
      "lastAssessedAt": "2025-10-18T00:00:00Z",
      "nextAssessmentDue": "2025-12-18T00:00:00Z",
      "contractEndDate": "2025-12-31",
      "overallScore": 78
    }
  ],
  "pagination": { "total": 8, "limit": 50, "offset": 0 }
}
```

---

### 2.3 Get Vendor Details

**Endpoint:** `GET /api/council/vendors/:id`

**Response:** `200 OK`
```json
{
  "id": "ven_abc123",
  "name": "OpenAI",
  "description": "AI model provider...",
  "website": "https://openai.com",
  "vendorType": "LLM_PROVIDER",
  "category": "AI Models",
  "riskTier": "HIGH",
  "lastAssessedAt": "2025-10-18T00:00:00Z",
  "nextAssessmentDue": "2025-12-18T00:00:00Z",
  "contractValue": 120000.00,
  "certifications": { "iso27001": true, "soc2": true },
  "recentAssessments": [
    {
      "id": "vass_123",
      "assessmentType": "PERIODIC",
      "overallScore": 78,
      "assessedAt": "2025-10-18T00:00:00Z"
    }
  ],
  "recentViolations": [
    {
      "id": "vio_456",
      "policyName": "Vendor SLA Requirements",
      "severity": "MEDIUM",
      "detectedAt": "2025-11-01T00:00:00Z"
    }
  ]
}
```

---

### 2.4 Update Vendor

**Endpoint:** `PUT /api/council/vendors/:id`

**Request Body:** (Same as Create Vendor, all fields optional)

**Response:** `200 OK`

---

### 2.5 Delete Vendor

**Endpoint:** `DELETE /api/council/vendors/:id`

**Response:** `200 OK`

---

### 2.6 Trigger Vendor Assessment

**Endpoint:** `POST /api/council/vendors/:id/assess`

**Description:** Trigger an evidence-based AI assessment of a vendor

**Request Body:**
```json
{
  "assessmentType": "TRIGGERED",
  "notes": "Quarterly security review"
}
```

**Response:** `202 Accepted`
```json
{
  "assessmentId": "vass_new123",
  "vendorId": "ven_abc123",
  "status": "IN_PROGRESS",
  "estimatedCompletionTime": "2025-11-18T12:30:00Z",
  "message": "Assessment job queued"
}
```

**Background Job:** `vendor-assessment`
```typescript
// Job payload
{
  vendorId: "ven_abc123",
  assessmentType: "TRIGGERED",
  assessedBy: "user_xyz"
}

// Job tasks:
// 1. Search d-vecDB for vendor-related incidents
// 2. Analyze vendor website, certifications, public disclosures
// 3. Calculate scores: security, compliance, reliability, privacy
// 4. Generate findings and recommendations
// 5. Create VendorAssessment record
// 6. Send notifications
```

---

### 2.7 Get Vendor Assessment

**Endpoint:** `GET /api/council/vendors/:vendorId/assessments/:assessmentId`

**Response:** `200 OK`
```json
{
  "id": "vass_123",
  "vendorId": "ven_abc123",
  "vendorName": "OpenAI",
  "assessmentType": "PERIODIC",
  "assessedAt": "2025-10-18T10:00:00Z",
  "assessedBy": "user_xyz",
  "overallScore": 78,
  "securityScore": 82,
  "complianceScore": 75,
  "reliabilityScore": 80,
  "privacyScore": 73,
  "findings": {
    "strengths": [
      "SOC 2 Type II certified",
      "Strong incident response history",
      "Transparent AI safety research"
    ],
    "weaknesses": [
      "Limited data residency options",
      "No HIPAA compliance",
      "Frequent model updates may break integrations"
    ]
  },
  "risks": [
    {
      "category": "COMPLIANCE",
      "severity": "MEDIUM",
      "description": "No HIPAA certification limits healthcare use cases",
      "mitigation": "Use Azure OpenAI Service for HIPAA workloads"
    }
  ],
  "recommendations": [
    "Request HIPAA compliance roadmap",
    "Establish SLA for model versioning",
    "Review data processing agreement quarterly"
  ],
  "incidentMatches": 3,
  "evidenceIds": ["inc_001", "inc_002", "inc_003"],
  "status": "COMPLETED",
  "nextReviewDate": "2026-01-18T00:00:00Z"
}
```

---

### 2.8 Generate Vendor Scorecard

**Endpoint:** `POST /api/council/vendors/:id/scorecard`

**Description:** Generate monthly scorecard aggregating assessments and violations

**Request Body:**
```json
{
  "periodStart": "2025-10-01",
  "periodEnd": "2025-10-31"
}
```

**Response:** `201 Created`
```json
{
  "id": "sc_abc123",
  "vendorId": "ven_abc123",
  "periodStart": "2025-10-01T00:00:00Z",
  "periodEnd": "2025-10-31T23:59:59Z",
  "overallScore": 78,
  "trend": "STABLE",
  "scores": {
    "security": 82,
    "compliance": 75,
    "reliability": 80,
    "privacy": 73
  },
  "incidentCount": 0,
  "violationCount": 1,
  "complianceRate": 95.5,
  "recommendations": [
    "Address HIPAA compliance gap",
    "Review data processing agreement"
  ],
  "actionItems": [
    {
      "priority": "HIGH",
      "item": "Request HIPAA roadmap",
      "dueDate": "2025-12-01"
    }
  ],
  "generatedAt": "2025-11-18T14:00:00Z"
}
```

---

### 2.9 List Vendor Scorecards

**Endpoint:** `GET /api/council/vendors/:id/scorecards`

**Query Parameters:**
- `fromDate`, `toDate` - Filter by period

**Response:** `200 OK`
```json
{
  "scorecards": [
    {
      "id": "sc_abc123",
      "periodStart": "2025-10-01",
      "periodEnd": "2025-10-31",
      "overallScore": 78,
      "trend": "STABLE",
      "generatedAt": "2025-11-01T00:00:00Z"
    }
  ]
}
```

---

## Module 3: Automated Assessment API

### Product Slug
`ai-council-automated-assessment`

### Feature Limits
- Maximum 50 scheduled assessments per geography account
- Minimum frequency: Daily
- 24-month assessment retention

---

### 3.1 Create Assessment Schedule

**Endpoint:** `POST /api/council/schedules`

**Request Body:**
```json
{
  "targetType": "RISK_ASSESSMENT",
  "targetId": "assess_789",
  "frequency": "WEEKLY",
  "cronExpression": null,
  "enabled": true
}
```

**Response:** `201 Created`
```json
{
  "id": "sched_abc123",
  "targetType": "RISK_ASSESSMENT",
  "targetId": "assess_789",
  "frequency": "WEEKLY",
  "nextRunAt": "2025-11-25T00:00:00Z",
  "enabled": true,
  "createdAt": "2025-11-18T10:00:00Z"
}
```

---

### 3.2 List Assessment Schedules

**Endpoint:** `GET /api/council/schedules`

**Query Parameters:**
- `targetType` (optional)
- `status` (optional): ACTIVE, PAUSED, COMPLETED, FAILED
- `enabled` (optional): true/false

**Response:** `200 OK`
```json
{
  "schedules": [
    {
      "id": "sched_abc123",
      "targetType": "RISK_ASSESSMENT",
      "targetId": "assess_789",
      "frequency": "WEEKLY",
      "nextRunAt": "2025-11-25T00:00:00Z",
      "lastRunAt": "2025-11-18T00:00:00Z",
      "status": "ACTIVE",
      "enabled": true
    }
  ],
  "pagination": { "total": 8, "limit": 50, "offset": 0 }
}
```

---

### 3.3 Get Schedule Details

**Endpoint:** `GET /api/council/schedules/:id`

**Response:** `200 OK`
```json
{
  "id": "sched_abc123",
  "targetType": "RISK_ASSESSMENT",
  "targetId": "assess_789",
  "frequency": "WEEKLY",
  "cronExpression": null,
  "nextRunAt": "2025-11-25T00:00:00Z",
  "lastRunAt": "2025-11-18T00:00:00Z",
  "status": "ACTIVE",
  "enabled": true,
  "createdAt": "2025-11-10T00:00:00Z",
  "createdBy": "user_xyz",
  "executionHistory": [
    {
      "executedAt": "2025-11-18T00:00:00Z",
      "status": "COMPLETED",
      "duration": 45,
      "scoreChange": -2
    }
  ]
}
```

---

### 3.4 Update Schedule

**Endpoint:** `PUT /api/council/schedules/:id`

**Request Body:**
```json
{
  "frequency": "DAILY",
  "enabled": false
}
```

**Response:** `200 OK`

---

### 3.5 Delete Schedule

**Endpoint:** `DELETE /api/council/schedules/:id`

**Response:** `200 OK`

---

### 3.6 Trigger Manual Reassessment

**Endpoint:** `POST /api/council/schedules/:id/run-now`

**Description:** Manually trigger a scheduled assessment outside its normal schedule

**Response:** `202 Accepted`
```json
{
  "jobId": "job_xyz789",
  "scheduleId": "sched_abc123",
  "status": "QUEUED",
  "message": "Reassessment job queued"
}
```

**Background Job:** `scheduled-assessment`
```typescript
// Job payload
{
  scheduleId: "sched_abc123",
  targetType: "RISK_ASSESSMENT",
  targetId: "assess_789",
  triggeredBy: "manual"
}

// Job tasks:
// 1. Re-run risk assessment calculation
// 2. Compare new score with previous
// 3. Detect significant changes (threshold: ±5 points)
// 4. Send notifications if score changed
// 5. Update AssessmentSchedule.lastRunAt
```

---

## Cross-Module APIs

### 4.1 Get Module Status & Limits

**Endpoint:** `GET /api/council/status`

**Description:** Get comprehensive status of all licensed modules and current usage

**Response:** `200 OK`
```json
{
  "licenses": {
    "policyEngine": {
      "hasAccess": true,
      "expiresAt": "2026-11-18T00:00:00Z",
      "status": "active"
    },
    "vendorGovernance": {
      "hasAccess": false
    },
    "automatedAssessment": {
      "hasAccess": true,
      "expiresAt": "2026-11-18T00:00:00Z",
      "status": "active"
    },
    "completeBundle": {
      "hasAccess": false
    }
  },
  "limits": {
    "policies": {
      "limit": 50,
      "current": 12,
      "remaining": 38,
      "allowed": true
    },
    "vendors": {
      "limit": 0,
      "current": 0,
      "remaining": 0,
      "allowed": false,
      "upgradeUrl": "/products/ai-council/vendor-governance"
    },
    "schedules": {
      "limit": 50,
      "current": 8,
      "remaining": 42,
      "allowed": true
    }
  },
  "usage": {
    "totalPolicies": 12,
    "activePolicies": 10,
    "openViolations": 3,
    "totalVendors": 0,
    "totalSchedules": 8,
    "activeSchedules": 6
  }
}
```

---

## Error Response Format

All API errors follow this structure:

```json
{
  "error": "Error type",
  "details": "Human-readable error message",
  "statusCode": 400,
  "field": "fieldName",
  "upgradeUrl": "/products/ai-council/upgrade"
}
```

### Common Error Codes

**401 Unauthorized**
```json
{
  "error": "Unauthorized",
  "details": "Authentication required",
  "statusCode": 401
}
```

**403 Forbidden - No License**
```json
{
  "error": "Module not licensed",
  "details": "Policy Engine module required. Please purchase or upgrade your plan.",
  "upgradeUrl": "/products/ai-council/policy-engine",
  "statusCode": 403
}
```

**403 Forbidden - Limit Exceeded**
```json
{
  "error": "Feature limit reached",
  "details": "You have reached the maximum of 50 policies. Please upgrade to increase limits.",
  "upgradeUrl": "/products/ai-council/upgrade",
  "current": 50,
  "limit": 50,
  "statusCode": 403
}
```

**400 Bad Request**
```json
{
  "error": "Validation error",
  "details": "Invalid policy condition operator",
  "field": "conditions.operator",
  "statusCode": 400
}
```

**404 Not Found**
```json
{
  "error": "Not found",
  "details": "Policy with ID pol_abc123 not found",
  "statusCode": 404
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal server error",
  "details": "An unexpected error occurred",
  "statusCode": 500
}
```

---

## Background Jobs (Graphile Worker)

### Job Queue Configuration

All long-running operations are processed via Graphile Worker jobs.

### Job Types

**1. `scheduled-assessment`**
```typescript
interface ScheduledAssessmentPayload {
  scheduleId: string
  targetType: 'RISK_ASSESSMENT' | 'VENDOR_ASSESSMENT' | 'COMPLIANCE_CHECK'
  targetId: string
  triggeredBy: 'schedule' | 'manual'
}
```

**2. `policy-validation`**
```typescript
interface PolicyValidationPayload {
  policyId: string
  assessmentId: string
}
```

**3. `vendor-assessment`**
```typescript
interface VendorAssessmentPayload {
  vendorId: string
  assessmentType: VendorAssessmentType
  assessedBy: string
}
```

**4. `vendor-scorecard-generation`**
```typescript
interface VendorScorecardPayload {
  vendorId: string
  periodStart: string // ISO date
  periodEnd: string // ISO date
}
```

**5. `schedule-executor`** (Cron job)
```typescript
// Runs every hour
// Checks AssessmentSchedule.nextRunAt
// Queues scheduled-assessment jobs
```

---

## Policy Condition Operators

### Supported Operators

**Comparison:**
- `EQUALS`
- `NOT_EQUALS`
- `GREATER_THAN`
- `LESS_THAN`
- `GREATER_THAN_OR_EQUAL`
- `LESS_THAN_OR_EQUAL`

**String:**
- `CONTAINS`
- `NOT_CONTAINS`
- `STARTS_WITH`
- `ENDS_WITH`
- `REGEX_MATCH`

**Array:**
- `CONTAINS_ANY`
- `CONTAINS_ALL`
- `NOT_CONTAINS_ANY`

**Boolean:**
- `IS_TRUE`
- `IS_FALSE`
- `IS_NULL`
- `IS_NOT_NULL`

**Logical:**
- `AND`
- `OR`
- `NOT`

### Example Complex Condition

```json
{
  "operator": "AND",
  "conditions": [
    {
      "operator": "OR",
      "conditions": [
        {
          "field": "jurisdictions",
          "operator": "CONTAINS",
          "value": "EU"
        },
        {
          "field": "jurisdictions",
          "operator": "CONTAINS",
          "value": "UK"
        }
      ]
    },
    {
      "field": "sengolScore",
      "operator": "LESS_THAN",
      "value": 70
    },
    {
      "field": "dataTypes",
      "operator": "CONTAINS_ANY",
      "value": ["PII", "Financial", "Health"]
    }
  ]
}
```

---

## Webhook Events (Future)

### Event Types

- `policy.created`
- `policy.updated`
- `policy.violation_detected`
- `vendor.assessed`
- `vendor.scorecard_generated`
- `schedule.executed`
- `schedule.failed`

### Webhook Payload

```json
{
  "event": "policy.violation_detected",
  "timestamp": "2025-11-18T12:00:00Z",
  "data": {
    "violationId": "vio_123",
    "policyId": "pol_abc123",
    "severity": "HIGH",
    "assessmentId": "assess_789"
  }
}
```

---

## Rate Limiting

- **Per User**: 100 requests/minute
- **Per Geography Account**: 500 requests/minute
- **Assessment Evaluations**: 10 concurrent evaluations per geography account

---

## Changelog

### v1.0 (2025-11-18)
- Initial API specification
- All three modules defined
- Background job specifications
- Error response standardization
