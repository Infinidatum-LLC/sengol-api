# Backend API Implementation Checklist

**Date**: December 2024  
**Backend API**: `api.sengol.ai`  
**Status**: ⏳ Pending Backend Implementation

---

## Overview

This document lists all backend API endpoints that need to be implemented at `api.sengol.ai` to support the frontend proxy layer.

---

## Authentication

All endpoints must:
- Accept `Authorization: Bearer {API_AUTH_TOKEN}` header
- Accept `X-User-Email` header for user identification
- Accept `X-User-Id` header for user ID
- Accept `X-User-Role` header for user role (admin/user)
- Return `401 Unauthorized` if authentication fails
- Return `403 Forbidden` if user lacks permissions

---

## Assessment Management Endpoints

### 1. Create Assessment

**Endpoint**: `POST /api/assessments`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Assessment Name",
  "projectId": "project-id"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "assessment": {
    "id": "assessment-id",
    "name": "Assessment Name",
    "createdAt": "2024-12-01T00:00:00Z"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing or invalid fields
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: Assessment limit reached (with upgrade details)
- `404 Not Found`: Project not found

**Implementation Status**: ⏳ Pending

---

### 2. Get Assessment

**Endpoint**: `GET /api/assessments/{id}`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
```

**Response** (200 OK):
```json
{
  "success": true,
  "assessment": {
    "id": "assessment-id",
    "name": "Assessment Name",
    "status": "in_progress",
    "projectName": "Project Name",
    "industry": "tech",
    "useCase": "General AI",
    "systemDescription": "...",
    "systemCriticality": "high",
    "dataTypes": ["personal", "financial"],
    "overallRiskScore": 65.5,
    "aiRiskScore": 70.0,
    "cyberRiskScore": 60.0,
    "cloudRiskScore": 65.0,
    "riskCoverageScore": 85.0,
    "complianceScore": 75.0,
    "complianceCoverageScore": 80.0,
    "sengolScore": 78.5,
    "letterGrade": "B",
    "evidenceCount": 5,
    "createdAt": "2024-12-01T00:00:00Z",
    "updatedAt": "2024-12-01T00:00:00Z"
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: User doesn't own this assessment
- `404 Not Found`: Assessment not found

**Implementation Status**: ⏳ Pending

---

### 3. Update Step 1 (System Description)

**Endpoint**: `PUT /api/assessments/{id}/step1`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
Content-Type: application/json
```

**Request Body**:
```json
{
  "systemDescription": "Detailed system description...",
  "industry": "tech",
  "systemCriticality": "high",
  "dataTypes": ["personal", "financial"],
  "techStack": ["python", "tensorflow"]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "assessment": {
    "id": "assessment-id",
    "name": "Assessment Name",
    "systemDescription": "...",
    "industry": "tech",
    "systemCriticality": "high",
    "dataTypes": ["personal", "financial"],
    "techStack": ["python", "tensorflow"]
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing or invalid fields
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: User doesn't own this assessment
- `404 Not Found`: Assessment not found

**Implementation Status**: ⏳ Pending

---

### 4. Update Step 2 (Risk Assessment)

**Endpoint**: `PUT /api/assessments/{id}/step2`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
Content-Type: application/json
```

**Request Body**:
```json
{
  "selectedDomains": ["ai", "cyber", "cloud"],
  "riskQuestionResponses": {
    "question-id-1": {
      "status": "addressed",
      "notes": "..."
    },
    "dynamic_123": {
      "status": "partial",
      "notes": "..."
    }
  },
  "userRiskScores": {
    "question-id-1": 30,
    "dynamic_123": 50
  },
  "riskNotes": {
    "question-id-1": "..."
  },
  "additionalRiskElements": []
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "assessment": {
    "id": "assessment-id",
    "overallRiskScore": 65.5,
    "aiRiskScore": 70.0,
    "cyberRiskScore": 60.0,
    "cloudRiskScore": 65.0,
    "riskCoverageScore": 85.0,
    "riskCoverageDetails": {...},
    "riskQuestionResponses": {...},
    "userRiskScores": {...},
    "riskNotes": {...},
    "additionalRiskElements": []
  }
}
```

**Critical Requirements**:
- ✅ Must calculate risk scores on backend
- ✅ Must support weighted scoring for dynamic questions
- ✅ Must calculate coverage scores
- ✅ Must validate all inputs

**Error Responses**:
- `400 Bad Request`: Missing or invalid fields, invalid scores
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: User doesn't own this assessment
- `404 Not Found`: Assessment not found

**Implementation Status**: ⏳ Pending

---

### 5. Update Step 3 (Compliance Profile)

**Endpoint**: `PUT /api/assessments/{id}/step3`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
Content-Type: application/json
```

**Request Body**:
```json
{
  "jurisdictions": ["US", "EU", "UK"],
  "regulationIds": ["gdpr", "ccpa"],
  "questionResponses": {
    "question-id-1": {
      "status": "addressed",
      "notes": "..."
    },
    "compliance_123": {
      "status": "partial",
      "notes": "..."
    }
  },
  "userScores": {
    "question-id-1": 80,
    "compliance_123": 70
  },
  "complianceNotes": {
    "question-id-1": "..."
  },
  "additionalComplianceElements": []
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "assessment": {
    "id": "assessment-id",
    "jurisdictions": ["US", "EU", "UK"],
    "regulationIds": ["gdpr", "ccpa"],
    "complianceScore": 75.0,
    "complianceCoverageScore": 80.0,
    "complianceCoverageDetails": {...},
    "complianceQuestionResponses": {...},
    "complianceUserScores": {...},
    "complianceNotes": {...},
    "additionalComplianceElements": []
  }
}
```

**Critical Requirements**:
- ✅ Must calculate compliance scores on backend
- ✅ Must support weighted scoring for dynamic questions
- ✅ Must calculate coverage scores
- ✅ Must validate all inputs

**Error Responses**:
- `400 Bad Request`: Missing or invalid fields, invalid scores
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: User doesn't own this assessment
- `404 Not Found`: Assessment not found

**Implementation Status**: ⏳ Pending

---

### 6. Submit Assessment

**Endpoint**: `POST /api/assessments/{id}/submit`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
```

**Response** (200 OK):
```json
{
  "success": true,
  "assessment": {
    "id": "assessment-id",
    "sengolScore": 78.5,
    "letterGrade": "B",
    "riskScore": 65.5,
    "complianceScore": 75.0,
    "aiRiskScore": 70.0,
    "cyberRiskScore": 60.0,
    "cloudRiskScore": 65.0,
    "evidenceCount": 5,
    "analysisStatus": "complete",
    "analysisCompletedAt": "2024-12-01T00:00:00Z"
  }
}
```

**Critical Requirements**:
- ✅ Must calculate Sengol Score (weighted: 60% risk health, 40% compliance health)
- ✅ Must determine letter grade (A-F)
- ✅ Must perform semantic search for similar incidents
- ✅ Must validate all steps are complete
- ✅ Must mark assessment as complete

**Error Responses**:
- `400 Bad Request`: Missing steps (Step 1, 2, or 3 incomplete)
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: User doesn't own this assessment
- `404 Not Found`: Assessment not found

**Implementation Status**: ⏳ Pending

---

### 7. Get Assessment Scores

**Endpoint**: `GET /api/assessments/{id}/scores`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
```

**Response** (200 OK):
```json
{
  "id": "assessment-id",
  "overallRiskScore": 65.5,
  "aiRiskScore": 70.0,
  "cyberRiskScore": 60.0,
  "cloudRiskScore": 65.0,
  "complianceScore": 75.0,
  "updatedAt": "2024-12-01T00:00:00Z",
  "createdAt": "2024-12-01T00:00:00Z"
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Assessment not found

**Implementation Status**: ⏳ Pending

---

## Project Management Endpoints

### 8. Get All Projects

**Endpoint**: `GET /api/projects`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
```

**Response** (200 OK):
```json
{
  "projects": [
    {
      "id": "project-id",
      "name": "Project Name",
      "description": "...",
      "color": "#3B82F6",
      "status": "active",
      "createdAt": "2024-12-01T00:00:00Z",
      "updatedAt": "2024-12-01T00:00:00Z",
      "_count": {
        "riskAssessments": 5,
        "complianceAssessments": 3
      },
      "riskAssessments": [...],
      "complianceAssessments": [...],
      "sengolScore": {
        "score": 78.5,
        "grade": "B",
        ...
      }
    }
  ]
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication failed

**Implementation Status**: ⏳ Pending

---

### 9. Create Project

**Endpoint**: `POST /api/projects`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Project Name",
  "description": "Project description",
  "color": "#3B82F6"
}
```

**Response** (201 Created):
```json
{
  "project": {
    "id": "project-id",
    "name": "Project Name",
    "description": "Project description",
    "color": "#3B82F6",
    "status": "active",
    "createdAt": "2024-12-01T00:00:00Z",
    "updatedAt": "2024-12-01T00:00:00Z"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing or invalid fields
- `401 Unauthorized`: Authentication failed
- `403 Forbidden`: Project limit reached (with upgrade details)

**Implementation Status**: ⏳ Pending

---

## User Management Endpoints

### 10. Get User Usage

**Endpoint**: `GET /api/user/usage`

**Request Headers**:
```
Authorization: Bearer {API_AUTH_TOKEN}
X-User-Email: user@example.com
X-User-Id: user-id
X-User-Role: user
```

**Response** (200 OK):
```json
{
  "assessments": {
    "used": 5,
    "limit": 20,
    "resetDate": "2024-12-01T00:00:00Z",
    "tier": "professional"
  },
  "signals": {
    "used": 15,
    "limit": 100,
    "resetDate": "2024-12-01T00:00:00Z",
    "tier": "professional"
  },
  "exports": {
    "used": 3,
    "limit": 999,
    "resetDate": "2024-12-01T00:00:00Z",
    "tier": "professional"
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Authentication failed
- `503 Service Unavailable`: Database connection error

**Implementation Status**: ⏳ Pending

---

## Implementation Priority

### Phase 1: Critical (Must Have First)
1. ✅ Create Assessment (`POST /api/assessments`)
2. ✅ Get Assessment (`GET /api/assessments/{id}`)
3. ✅ Update Step 1 (`PUT /api/assessments/{id}/step1`)
4. ✅ Update Step 2 (`PUT /api/assessments/{id}/step2`)
5. ✅ Update Step 3 (`PUT /api/assessments/{id}/step3`)
6. ✅ Submit Assessment (`POST /api/assessments/{id}/submit`)

### Phase 2: Supporting (Can Implement After Phase 1)
7. ✅ Get Assessment Scores (`GET /api/assessments/{id}/scores`)
8. ✅ Get All Projects (`GET /api/projects`)
9. ✅ Create Project (`POST /api/projects`)
10. ✅ Get User Usage (`GET /api/user/usage`)

---

## Testing Checklist

- [ ] Test all endpoints with valid authentication
- [ ] Test all endpoints with invalid authentication (401)
- [ ] Test all endpoints with missing permissions (403)
- [ ] Test all endpoints with invalid data (400)
- [ ] Test all endpoints with non-existent resources (404)
- [ ] Test assessment creation with project validation
- [ ] Test assessment limits enforcement
- [ ] Test risk score calculations
- [ ] Test compliance score calculations
- [ ] Test Sengol Score calculation
- [ ] Test weighted scoring for dynamic questions
- [ ] Test coverage score calculations
- [ ] Test semantic search for similar incidents
- [ ] Test project limits enforcement
- [ ] Test usage data calculation

---

## Related Documentation

- [API Proxy Migration Complete](./API_PROXY_MIGRATION_COMPLETE.md)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [Pricing & Gating Specification](./PRICING_AND_GATING_SPECIFICATION.md)

