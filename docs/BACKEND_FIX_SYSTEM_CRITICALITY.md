# Backend Fix: systemCriticality Not Being Saved

**Date**: January 2025  
**Issue**: `systemCriticality` field is not being persisted to database  
**Status**: 🔴 **CRITICAL - Blocking Step 1 completion validation**

---

## Problem Summary

When the frontend sends `systemCriticality` in the Step 1 update request, the backend:
- ✅ Receives the field correctly
- ❌ Does NOT save it to the database
- ❌ Returns `null` in the response

This causes Step 1 completion validation to fail, blocking access to Step 2.

---

## Evidence

### Request Sent to Backend
```json
PUT /api/assessments/{id}/step1
{
  "systemDescription": "Test system description...",
  "industry": "Financial Services & Banking",
  "systemCriticality": "High",
  "dataTypes": ["PII"],
  "techStack": ["GPT-4"],
  "userId": "cmh8hqvk200009shpct2veolh"
}
```

### Response from Backend
```json
{
  "success": true,
  "data": {
    "id": "cmhn3cf3y000jrt00s5p1jzv9",
    "systemDescription": "Test system description...",
    "industry": "Financial Services & Banking",
    "systemCriticality": null,  // ❌ Should be "High"
    "dataTypes": [],
    "techStack": []
  }
}
```

---

## Root Cause

The backend API endpoint `PUT /api/assessments/{id}/step1` is:
1. Receiving `systemCriticality` in the request body ✓
2. NOT including it in the database update operation ✗
3. Returning `null` because it's not saved ✗

---

## Required Fix

### 1. Update Database Model/Schema

Ensure the database schema includes `systemCriticality` field:

**PostgreSQL/Prisma Schema:**
```prisma
model Assessment {
  id                String   @id @default(cuid())
  userId            String
  projectId         String?
  
  // Step 1 fields
  systemDescription String?  @db.Text
  industry          String?
  systemCriticality String?  // ✅ Ensure this field exists
  dataTypes         String[]
  techStack         String[]
  
  // ... other fields
}
```

**Verify the field exists:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'Assessment' 
  AND column_name = 'systemCriticality';
```

If the field doesn't exist, add it:
```sql
ALTER TABLE "Assessment" 
ADD COLUMN "systemCriticality" TEXT;
```

---

### 2. Update Backend API Endpoint

**File**: `PUT /api/assessments/{id}/step1`

**Current Issue**: The endpoint is not including `systemCriticality` in the database update.

**Required Changes**:

```typescript
// BEFORE (incorrect):
await prisma.assessment.update({
  where: { id: assessmentId },
  data: {
    systemDescription: body.systemDescription,
    industry: body.industry,
    dataTypes: body.dataTypes,
    techStack: body.techStack,
    // ❌ systemCriticality is missing
  }
})

// AFTER (correct):
await prisma.assessment.update({
  where: { id: assessmentId },
  data: {
    systemDescription: body.systemDescription,
    industry: body.industry,
    systemCriticality: body.systemCriticality, // ✅ Add this
    dataTypes: body.dataTypes,
    techStack: body.techStack,
  }
})
```

**Full Example**:

```typescript
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    
    // Validate required fields
    if (!body.systemDescription || body.systemDescription.length < 50) {
      return Response.json(
        { error: 'systemDescription is required and must be at least 50 characters' },
        { status: 400 }
      )
    }
    
    if (!body.industry) {
      return Response.json(
        { error: 'industry is required' },
        { status: 400 }
      )
    }
    
    // ✅ CRITICAL: Include systemCriticality in the update
    const updatedAssessment = await prisma.assessment.update({
      where: { id },
      data: {
        systemDescription: body.systemDescription,
        industry: body.industry,
        systemCriticality: body.systemCriticality || null, // ✅ Add this line
        dataTypes: body.dataTypes || [],
        techStack: body.techStack || [],
        updatedAt: new Date(),
      }
    })
    
    return Response.json({
      success: true,
      data: updatedAssessment
    })
    
  } catch (error) {
    console.error('Error updating assessment step1:', error)
    return Response.json(
      { error: 'Failed to update assessment' },
      { status: 500 }
    )
  }
}
```

---

### 3. Update Response Mapping

Ensure the response includes `systemCriticality`:

```typescript
return Response.json({
  success: true,
  data: {
    id: updatedAssessment.id,
    systemDescription: updatedAssessment.systemDescription,
    industry: updatedAssessment.industry,
    systemCriticality: updatedAssessment.systemCriticality, // ✅ Include this
    dataTypes: updatedAssessment.dataTypes,
    techStack: updatedAssessment.techStack,
    // ... other fields
  }
})
```

---

### 4. Verify GET Endpoint

Ensure the GET endpoint also returns `systemCriticality`:

```typescript
// GET /api/assessments/{id}
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  
  const assessment = await prisma.assessment.findUnique({
    where: { id },
    select: {
      id: true,
      systemDescription: true,
      industry: true,
      systemCriticality: true, // ✅ Ensure this is included
      dataTypes: true,
      techStack: true,
      // ... other fields
    }
  })
  
  if (!assessment) {
    return Response.json(
      { error: 'Assessment not found' },
      { status: 404 }
    )
  }
  
  return Response.json({
    success: true,
    data: assessment
  })
}
```

---

## Testing Instructions

### 1. Test PUT Endpoint

```bash
curl -X PUT "https://api.sengol.ai/api/assessments/{assessmentId}/step1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {API_AUTH_TOKEN}" \
  -H "X-User-Email: user@example.com" \
  -H "X-User-Id: {userId}" \
  -d '{
    "systemDescription": "Test system description that is at least 50 characters long",
    "industry": "Financial Services & Banking",
    "systemCriticality": "High",
    "dataTypes": ["PII"],
    "techStack": ["GPT-4"],
    "userId": "{userId}"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "id": "{assessmentId}",
    "systemDescription": "Test system description...",
    "industry": "Financial Services & Banking",
    "systemCriticality": "High",  // ✅ Should NOT be null
    "dataTypes": ["PII"],
    "techStack": ["GPT-4"]
  }
}
```

### 2. Test GET Endpoint

```bash
curl -X GET "https://api.sengol.ai/api/assessments/{assessmentId}?userId={userId}" \
  -H "Authorization: Bearer {API_AUTH_TOKEN}" \
  -H "X-User-Email: user@example.com" \
  -H "X-User-Id: {userId}"
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "id": "{assessmentId}",
    "systemDescription": "Test system description...",
    "industry": "Financial Services & Banking",
    "systemCriticality": "High",  // ✅ Should NOT be null
    // ... other fields
  }
}
```

### 3. Verify Database

```sql
SELECT id, "systemDescription", industry, "systemCriticality"
FROM "Assessment"
WHERE id = '{assessmentId}';
```

**Expected Result**:
```
id                                  | systemDescription | industry                    | systemCriticality
------------------------------------|-------------------|-----------------------------|------------------
cmhn3cf3y000jrt00s5p1jzv9          | Test system...    | Financial Services & Banking| High  ✅
```

---

## Validation Checklist

- [ ] Database schema includes `systemCriticality` field
- [ ] PUT endpoint accepts `systemCriticality` in request body
- [ ] PUT endpoint includes `systemCriticality` in database update
- [ ] PUT endpoint returns `systemCriticality` in response
- [ ] GET endpoint includes `systemCriticality` in select/query
- [ ] GET endpoint returns `systemCriticality` in response
- [ ] Database actually persists `systemCriticality` value
- [ ] Test with curl shows `systemCriticality` is saved and returned

---

## Field Name Consistency

**Frontend sends**: `systemCriticality`  
**Backend should**: Accept `systemCriticality` (not `criticality` or other variations)

If the backend uses a different field name internally, add mapping:

```typescript
// If backend uses 'criticality' internally
data: {
  systemDescription: body.systemDescription,
  industry: body.industry,
  criticality: body.systemCriticality, // Map frontend field to backend field
  // ...
}
```

But the response should still return `systemCriticality`:

```typescript
return Response.json({
  success: true,
  data: {
    systemCriticality: assessment.criticality, // Map back to frontend field name
    // ...
  }
})
```

---

## Priority

🔴 **CRITICAL** - This is blocking users from completing Step 1 and accessing Step 2.

---

## Temporary Frontend Workaround

The frontend has a temporary workaround that allows Step 2 access if `systemDescription` and `industry` are present, even if `systemCriticality` is missing. This workaround will be removed once the backend is fixed.

---

## Contact

If you need clarification or have questions about this fix, please contact the frontend team.

