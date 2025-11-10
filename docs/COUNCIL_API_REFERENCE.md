# Council API Reference

**Version**: 1.0.0
**Base URL**: `/v1`
**Authentication**: Required (X-User-Id, X-User-Role headers)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Council Management](#council-management)
3. [Membership Management](#membership-management)
4. [Assessment Workflow](#assessment-workflow)
5. [Evidence Ledger](#evidence-ledger)
6. [Data Models](#data-models)
7. [Error Handling](#error-handling)

---

## Authentication

All endpoints require authentication via headers (temporary implementation):

```http
X-User-Id: <user_id>
X-User-Role: <role>
```

**Supported Roles**:
- `admin` - Full access to all endpoints
- `council_chair` - Submit decisions, view council data
- `council_partner` - Submit decisions, view council data
- `council_observer` - Read-only access
- `user` - No council access

---

## Council Management

### Create Council

Create a new AI Risk Council.

**Endpoint**: `POST /v1/councils`
**Auth**: Admin only
**Rate Limit**: 10/minute

**Request Body**:
```json
{
  "name": "AI Ethics Review Board",
  "description": "Reviews high-risk AI systems",
  "orgId": "org_123",  // Optional
  "quorum": 2,  // Minimum approvals required
  "requireUnanimous": false,  // Optional, default: false
  "approvalPolicy": {},  // Optional JSON policy
  "metadata": {}  // Optional metadata
}
```

**Response**: `201 Created`
```json
{
  "success": true,
  "council": {
    "id": "cmhr6m8ss000013smqpbvrn7y",
    "name": "AI Ethics Review Board",
    "description": "Reviews high-risk AI systems",
    "status": "ACTIVE",
    "quorum": 2,
    "requireUnanimous": false,
    "createdAt": "2025-11-09T03:56:52.108Z",
    "updatedAt": "2025-11-09T03:56:52.108Z"
  }
}
```

---

### List Councils

List all councils with pagination.

**Endpoint**: `GET /v1/councils`
**Auth**: Council roles (chair, partner, observer, admin)

**Query Parameters**:
- `status` - Filter by status (ACTIVE, ARCHIVED, SUSPENDED)
- `orgId` - Filter by organization
- `cursor` - Pagination cursor (council ID)
- `limit` - Results per page (default: 20, max: 100)

**Example Request**:
```http
GET /v1/councils?status=ACTIVE&limit=10
```

**Response**: `200 OK`
```json
{
  "success": true,
  "councils": [
    {
      "id": "cmhr6m8ss000013smqpbvrn7y",
      "name": "AI Ethics Review Board",
      "status": "ACTIVE",
      "_count": {
        "memberships": 2,
        "riskAssessments": 5
      }
    }
  ],
  "pagination": {
    "limit": 10,
    "cursor": "cmhr6m8ss000013smqpbvrn7y"
  }
}
```

---

### Get Council Details

Get detailed council information including members.

**Endpoint**: `GET /v1/councils/:councilId`
**Auth**: Council roles

**Query Parameters**:
- `includeRevoked` - Include revoked members (default: false)

**Response**: `200 OK`
```json
{
  "success": true,
  "council": {
    "id": "cmhr6m8ss000013smqpbvrn7y",
    "name": "AI Ethics Review Board",
    "status": "ACTIVE",
    "quorum": 2,
    "memberships": [
      {
        "id": "mem_123",
        "userId": "user_456",
        "role": "PARTNER",
        "status": "ACTIVE",
        "user": {
          "name": "John Doe",
          "email": "john@example.com"
        }
      }
    ],
    "_count": {
      "riskAssessments": 5,
      "approvals": 12
    }
  }
}
```

---

### Update Council

Update council configuration.

**Endpoint**: `PATCH /v1/councils/:councilId`
**Auth**: Admin only

**Request Body** (all fields optional):
```json
{
  "name": "Updated Council Name",
  "description": "Updated description",
  "quorum": 3,
  "requireUnanimous": true,
  "status": "ACTIVE",
  "approvalPolicy": {},
  "metadata": {}
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "council": {
    "id": "cmhr6m8ss000013smqpbvrn7y",
    "name": "Updated Council Name",
    "quorum": 3,
    "updatedAt": "2025-11-09T04:11:31.439Z"
  }
}
```

---

### Archive Council

Archive a council (soft delete).

**Endpoint**: `POST /v1/councils/:councilId/archive`
**Auth**: Admin only

**Response**: `200 OK`
```json
{
  "success": true,
  "council": {
    "id": "cmhr6m8ss000013smqpbvrn7y",
    "status": "ARCHIVED",
    "updatedAt": "2025-11-09T04:13:05.630Z"
  }
}
```

---

## Membership Management

### Add Member

Add a user to a council or reactivate existing membership.

**Endpoint**: `POST /v1/councils/:councilId/assignments`
**Auth**: Admin only

**Request Body**:
```json
{
  "userId": "user_456",
  "role": "PARTNER",  // CHAIR, PARTNER, OBSERVER
  "permissions": {},  // Optional JSON permissions
  "notes": "Senior AI risk expert"
}
```

**Response**: `201 Created`
```json
{
  "success": true,
  "membership": {
    "id": "mem_123",
    "councilId": "council_456",
    "userId": "user_456",
    "role": "PARTNER",
    "status": "ACTIVE",
    "assignedAt": "2025-11-09T04:00:54.253Z",
    "notes": "Senior AI risk expert"
  }
}
```

---

### List Members

List council members.

**Endpoint**: `GET /v1/councils/:councilId/members`
**Auth**: Council roles

**Query Parameters**:
- `status` - Filter by status (ACTIVE, REVOKED, SUSPENDED)

**Response**: `200 OK`
```json
{
  "success": true,
  "members": [
    {
      "id": "mem_123",
      "role": "PARTNER",
      "status": "ACTIVE",
      "user": {
        "id": "user_456",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "assignedAt": "2025-11-09T04:00:54.253Z"
    }
  ]
}
```

---

### Update Membership

Update member role or permissions.

**Endpoint**: `PATCH /v1/councils/:councilId/members/:membershipId`
**Auth**: Admin only

**Request Body** (all fields optional):
```json
{
  "role": "CHAIR",
  "status": "ACTIVE",
  "permissions": {},
  "notes": "Promoted to Chair"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "membership": {
    "id": "mem_123",
    "role": "CHAIR",
    "notes": "Promoted to Chair",
    "updatedAt": "2025-11-09T04:11:48.333Z"
  }
}
```

---

### Revoke Membership

Revoke a member's access to the council.

**Endpoint**: `POST /v1/councils/:councilId/members/:membershipId/revoke`
**Auth**: Admin only

**Request Body**:
```json
{
  "notes": "Membership revoked due to organizational changes"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "membership": {
    "id": "mem_123",
    "status": "REVOKED",
    "revokedAt": "2025-11-09T04:12:03.896Z",
    "notes": "Membership revoked due to organizational changes"
  }
}
```

---

## Assessment Workflow

### Assign Assessment to Council

Assign a risk assessment to a council for review.

**Endpoint**: `POST /v1/assessments/:assessmentId/council/assign`
**Auth**: Admin only

**Request Body**:
```json
{
  "councilId": "council_456"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "assessment": {
    "id": "assessment_789",
    "councilId": "council_456",
    "updatedAt": "2025-11-09T04:01:29.750Z"
  }
}
```

---

### Unassign Assessment

Remove assessment from council review.

**Endpoint**: `DELETE /v1/assessments/:assessmentId/council/assign`
**Auth**: Admin only

**Response**: `200 OK`
```json
{
  "success": true,
  "assessment": {
    "id": "assessment_789",
    "councilId": null,
    "updatedAt": "2025-11-09T04:12:51.251Z"
  }
}
```

---

### Submit Decision

Submit an approval/rejection decision for an assessment.

**Endpoint**: `POST /v1/assessments/:assessmentId/council/decision`
**Auth**: Council roles (chair, partner)

**Request Body**:
```json
{
  "councilId": "council_456",
  "membershipId": "mem_123",  // Optional, inferred from user
  "step": "final_review",  // Assessment workflow step
  "status": "APPROVED",  // APPROVED, REJECTED, PENDING, CONDITIONAL
  "notes": "All controls implemented",
  "reasonCodes": ["RISK_MITIGATED", "CONTROLS_ADEQUATE"],  // Optional
  "evidenceSnapshotId": "snapshot_123",  // Optional
  "attachments": [  // Optional
    {
      "storageKey": "s3://evidence/doc.pdf",
      "filename": "review.pdf",
      "contentType": "application/pdf",
      "size": 12345
    }
  ]
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "approval": {
    "id": "approval_123",
    "status": "APPROVED",
    "decisionNotes": "All controls implemented",
    "decidedAt": "2025-11-09T04:01:42.439Z"
  },
  "ledgerEntry": {
    "id": "ledger_456",
    "hash": "a9696f5c365b7ef2ca2b4539ac3fc132a1eae6773b9718487cd3ebc20e6114b3",
    "prevHash": null,
    "entryType": "APPROVAL"
  },
  "approvalStatus": {
    "approved": false,
    "quorumMet": false,
    "totalApprovals": 1,
    "requiredQuorum": 2,
    "requiresUnanimous": false
  }
}
```

---

### List Approvals

Get all approval decisions for an assessment.

**Endpoint**: `GET /v1/assessments/:assessmentId/council/approvals`
**Auth**: Council roles

**Response**: `200 OK`
```json
{
  "success": true,
  "approvals": [
    {
      "id": "approval_123",
      "status": "APPROVED",
      "decisionNotes": "All controls implemented",
      "decidedAt": "2025-11-09T04:01:42.439Z",
      "membership": {
        "user": {
          "name": "John Doe",
          "email": "john@example.com"
        },
        "role": "PARTNER"
      },
      "council": {
        "id": "council_456",
        "name": "AI Ethics Review Board"
      }
    }
  ]
}
```

---

### List Council Assessments

List all assessments assigned to a council.

**Endpoint**: `GET /v1/councils/:councilId/assessments`
**Auth**: Council roles

**Query Parameters**:
- `status` - Filter by approval status
- `cursor` - Pagination cursor
- `limit` - Results per page (default: 20)

**Response**: `200 OK`
```json
{
  "success": true,
  "assessments": [
    {
      "id": "assessment_789",
      "name": "Production ML Model",
      "approvals": [...],
      "_count": {
        "approvals": 2,
        "ledgerEntries": 3
      }
    }
  ],
  "pagination": {
    "limit": 20,
    "cursor": "assessment_789"
  }
}
```

---

## Evidence Ledger

### Get Ledger Entries

Retrieve tamper-evident audit trail for an assessment.

**Endpoint**: `GET /v1/assessments/:assessmentId/ledger`
**Auth**: Council roles

**Query Parameters**:
- `entryType` - Filter by type (comma-separated: APPROVAL,REJECTION,STATUS_CHANGE)
- `cursor` - Pagination cursor
- `limit` - Results per page (default: 50)

**Response**: `200 OK`
```json
{
  "success": true,
  "entries": [
    {
      "id": "ledger_456",
      "entryType": "APPROVAL",
      "hash": "a9696f5c365b7ef2ca2b4539ac3fc132a1eae6773b9718487cd3ebc20e6114b3",
      "prevHash": null,
      "payload": {
        "step": "final_review",
        "status": "APPROVED",
        "notes": "All controls implemented"
      },
      "actorId": "user_456",
      "actorRole": "council_partner",
      "createdAt": "2025-11-09T04:01:42.624Z",
      "membership": {
        "user": {
          "name": "John Doe",
          "email": "john@example.com"
        }
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "cursor": "ledger_456"
  }
}
```

---

### Append Ledger Entry

Add a custom entry to the audit trail (admin only).

**Endpoint**: `POST /v1/assessments/:assessmentId/ledger`
**Auth**: Admin only

**Request Body**:
```json
{
  "councilId": "council_456",  // Optional
  "membershipId": "mem_123",  // Optional
  "approvalId": "approval_123",  // Optional
  "actorId": "user_456",  // Optional
  "actorRole": "admin",
  "entryType": "STATUS_CHANGE",  // APPROVAL, REJECTION, STATUS_CHANGE, ESCALATION, etc.
  "payload": {
    "action": "membership_revoked",
    "reason": "Organizational restructuring",
    "details": {}
  }
}
```

**Response**: `201 Created`
```json
{
  "success": true,
  "entry": {
    "id": "ledger_789",
    "entryType": "STATUS_CHANGE",
    "hash": "8438c4d9459658ff85efa4b8c98285883590d741d7e68ad22ff25859fcf5c379",
    "prevHash": "d145f85cff58a281c4ea54bfaf666b51ef8cd8a42086a020a8f646d53abb40d1",
    "payload": {
      "action": "membership_revoked",
      "reason": "Organizational restructuring"
    },
    "createdAt": "2025-11-09T04:12:26.416Z"
  }
}
```

---

### Verify Ledger Chain

Verify the integrity of the hash chain.

**Endpoint**: `POST /v1/assessments/:assessmentId/ledger/verify`
**Auth**: Admin only

**Response**: `200 OK`
```json
{
  "success": true,
  "verification": {
    "verified": true,
    "totalEntries": 3,
    "chainStart": "2025-11-09T04:01:42.624Z",
    "chainEnd": "2025-11-09T04:12:26.416Z"
  }
}
```

**Response (if tampering detected)**: `200 OK`
```json
{
  "success": true,
  "verification": {
    "verified": false,
    "failureIndex": 2,
    "expectedHash": "abc123...",
    "actualHash": "def456..."
  }
}
```

---

## Data Models

### Council

```typescript
{
  id: string
  name: string
  description?: string
  orgId?: string
  status: "ACTIVE" | "ARCHIVED" | "SUSPENDED"
  approvalPolicy?: object
  quorum: number  // Minimum approvals required
  requireUnanimous: boolean
  metadata?: object
  createdAt: datetime
  updatedAt: datetime
}
```

### CouncilMembership

```typescript
{
  id: string
  councilId: string
  userId: string
  role: "CHAIR" | "PARTNER" | "OBSERVER"
  status: "ACTIVE" | "REVOKED" | "SUSPENDED"
  permissions?: object
  assignedBy?: string
  assignedAt: datetime
  revokedAt?: datetime
  notes?: string
  createdAt: datetime
  updatedAt: datetime
}
```

### RiskApproval

```typescript
{
  id: string
  assessmentId: string
  councilId: string
  membershipId: string
  partnerId: string
  step: string
  status: "APPROVED" | "REJECTED" | "PENDING" | "CONDITIONAL"
  decisionNotes?: string
  reasonCodes: string[]
  evidenceSnapshotId?: string
  attachments?: object[]
  createdAt: datetime
  decidedAt: datetime
}
```

### EvidenceLedgerEntry

```typescript
{
  id: string
  assessmentId: string
  councilId?: string
  membershipId?: string
  approvalId?: string
  actorId?: string
  actorRole?: string
  entryType: "APPROVAL" | "REJECTION" | "STATUS_CHANGE" | "ESCALATION" | "EVIDENCE_ADDED" | "COMMENT" | "POLICY_UPDATE"
  payload: object
  hash: string  // SHA-256 hash
  prevHash?: string  // Links to previous entry
  createdAt: datetime
}
```

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "details": {},  // Optional additional context
  "metadata": {}  // Optional error metadata
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Invalid request data |
| `INTERNAL_ERROR` | 500 | Server error |
| `RATE_LIMIT_ERROR` | 429 | Too many requests |

### Example Error Responses

**Unauthorized**:
```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED",
  "statusCode": 401
}
```

**Forbidden**:
```json
{
  "error": "Forbidden - Admin access required",
  "code": "FORBIDDEN",
  "statusCode": 403
}
```

**Validation Error**:
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 422,
  "details": [
    {
      "field": "quorum",
      "message": "Must be a positive integer"
    }
  ]
}
```

**Not Found**:
```json
{
  "error": "Council not found",
  "code": "NOT_FOUND",
  "statusCode": 404
}
```

---

## Rate Limits

- **Default**: 100 requests per minute per IP
- **Council Creation**: 10 requests per minute
- **Decision Submission**: 20 requests per minute
- **Ledger Verification**: 5 requests per minute

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699564800
```

When rate limited:
```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_ERROR",
  "statusCode": 429,
  "retryAfter": "60"
}
```

---

## Best Practices

### 1. Idempotency

Multiple calls to `POST /v1/councils/:councilId/assignments` with the same `userId` will reactivate the membership rather than creating duplicates.

### 2. Hash Chain Integrity

Always verify the ledger chain after critical operations using the `/ledger/verify` endpoint.

### 3. Quorum Checking

After each decision submission, check the `approvalStatus` field to determine if the assessment is approved.

### 4. Pagination

Use cursor-based pagination for all list endpoints. The `cursor` value is the ID of the last item in the previous page.

### 5. Error Handling

Always check the `success` field and handle errors gracefully based on the `code` field.

---

## Webhooks (Future)

Webhook support is planned for:
- `council.member.added`
- `council.member.revoked`
- `assessment.decision.submitted`
- `assessment.approved`
- `assessment.rejected`

---

## Changelog

### Version 1.0.0 (2025-11-09)
- Initial release
- All 23 endpoints implemented
- SHA-256 hash chain integrity
- Quorum-based approval logic
- Role-based access control
