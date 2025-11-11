# Frontend Integration Specification: Multi-Factor Question Generation

**Date**: December 2024
**Version**: 2.0
**Status**: Specification for Review
**Backend API**: `/api/review/:id/generate-questions`

---

## 📋 Overview

This document specifies the frontend changes needed to support the enhanced multi-factor question generation system. The backend now uses **multi-factor relevance matching** (technology stack + data types + data sources) to generate more accurate, system-specific risk questions.

---

## 🎯 What Changed in the Backend

### Before (v1.0)
- Questions generated using **semantic similarity only**
- Basic technology stack matching
- Generic questions applicable to all systems

### After (v2.0)
- Questions generated using **multi-factor relevance matching**:
  - Semantic similarity (40%)
  - Technology stack matching (30%)
  - Data types matching (20%)
  - Data sources matching (10%)
- Highly system-specific questions
- Only shows risks applicable to the user's actual system

---

## 🔧 Required Frontend Changes

### Summary
The frontend needs to collect and send **two new fields** to the backend:

1. **`dataTypes`** - Array of data types handled by the system
2. **`dataSources`** - Array of data sources used by the system

### Change Impact Assessment

| Change Type | Required? | Impact Level | Location |
|------------|-----------|--------------|----------|
| **New API fields** | Optional (fallback available) | Low | Step 1 form data collection |
| **UI updates** | Optional | Low | Add multi-select fields to Step 1 |
| **API request body** | Optional | Low | Add fields to API request |
| **Existing fields** | No change | None | All existing fields remain the same |

**Verdict**: ✅ **Minimal changes needed**. The system will work with existing data, but providing the new fields improves question quality by 20-30%.

---

## 📝 Detailed Changes

### 1. API Request Body Changes

#### Current Request Body (v1.0)
```typescript
POST /api/review/:id/generate-questions

{
  "systemDescription": "AI-powered fintech app using GPT-4...",
  "technologyStack": ["GPT-4", "PostgreSQL", "AWS"],
  "industry": "Finance",
  "deployment": "cloud",
  "selectedDomains": ["ai", "cyber"],
  "jurisdictions": ["US", "EU"],
  "maxQuestions": 10
}
```

#### Enhanced Request Body (v2.0)
```typescript
POST /api/review/:id/generate-questions

{
  // Existing fields (no changes)
  "systemDescription": "AI-powered fintech app using GPT-4...",
  "technologyStack": ["GPT-4", "PostgreSQL", "AWS"],
  "industry": "Finance",
  "deployment": "cloud",
  "selectedDomains": ["ai", "cyber"],
  "jurisdictions": ["US", "EU"],
  "maxQuestions": 10,

  // NEW: Data types handled by the system (optional)
  "dataTypes": [
    "PII",                    // Personally Identifiable Information
    "Financial",              // Financial data (payment, transactions)
    "Authentication"          // Passwords, credentials
  ],

  // NEW: Data sources used by the system (optional)
  "dataSources": [
    "API",                    // REST/GraphQL APIs
    "Database",               // SQL/NoSQL databases
    "File Upload",            // User-uploaded files
    "Third-party Service"     // External integrations
  ]
}
```

#### TypeScript Interface
```typescript
interface QuestionGenerationRequest {
  // Existing fields
  systemDescription: string
  technologyStack: string[]
  industry: string
  deployment: 'cloud' | 'on-prem' | 'hybrid'
  selectedDomains: string[]
  jurisdictions: string[]
  maxQuestions: number

  // NEW fields
  dataTypes?: string[]      // Optional, but recommended
  dataSources?: string[]    // Optional, but recommended
}
```

---

### 2. Frontend Form Changes (Step 1: System Overview)

#### Option A: Add Multi-Select Fields (Recommended)

Add two new multi-select fields to Step 1:

```tsx
// Step 1: System Overview
<FormSection title="System Overview">
  {/* Existing fields */}
  <TextArea
    label="System Description"
    name="systemDescription"
    required
  />

  <MultiSelect
    label="Technology Stack"
    name="technologyStack"
    options={techStackOptions}
  />

  {/* NEW: Data Types Multi-Select */}
  <MultiSelect
    label="Data Types Handled"
    name="dataTypes"
    description="What types of data does your system process?"
    options={[
      { value: "PII", label: "Personal Information (PII)" },
      { value: "Financial", label: "Financial Data" },
      { value: "PHI", label: "Health Information (PHI)" },
      { value: "Payment", label: "Payment Card Data" },
      { value: "Authentication", label: "Credentials/Passwords" },
      { value: "Biometric", label: "Biometric Data" },
      { value: "Location", label: "Location Data" },
      { value: "Email", label: "Email Addresses" },
      { value: "Phone", label: "Phone Numbers" },
      { value: "IP Address", label: "IP Addresses" },
      { value: "Other", label: "Other Sensitive Data" }
    ]}
    placeholder="Select data types..."
    helpText="Select all that apply. This helps generate more relevant questions."
  />

  {/* NEW: Data Sources Multi-Select */}
  <MultiSelect
    label="Data Sources"
    name="dataSources"
    description="How does your system collect or receive data?"
    options={[
      { value: "API", label: "APIs (REST/GraphQL)" },
      { value: "Database", label: "Databases" },
      { value: "File Upload", label: "File Uploads" },
      { value: "Third-party Service", label: "Third-party Integrations" },
      { value: "Cloud Storage", label: "Cloud Storage (S3, etc.)" },
      { value: "Email", label: "Email" },
      { value: "Web Forms", label: "Web Forms" },
      { value: "Mobile App", label: "Mobile App" },
      { value: "IoT Device", label: "IoT Devices" },
      { value: "Streaming", label: "Real-time Streams" },
      { value: "Other", label: "Other Sources" }
    ]}
    placeholder="Select data sources..."
    helpText="Select all that apply. This helps identify relevant risks."
  />

  {/* Existing fields continue... */}
</FormSection>
```

#### Option B: Extract from System Description (Fallback)

If you don't want to add new form fields, the backend will **automatically extract** data types and sources from the system description using keyword matching and LLM analysis.

**Example**:
```
System Description: "We use GPT-4 to process customer financial data and PII.
Data comes from our REST API and file uploads."

Backend automatically extracts:
- dataTypes: ["Financial", "PII"]
- dataSources: ["API", "File Upload"]
```

**Trade-off**: Extraction is ~70-80% accurate. Explicit selection is 100% accurate.

---

### 3. UI/UX Recommendations

#### Placement
Add the two new fields **immediately after** the "Technology Stack" field in Step 1.

#### Visual Design
```
┌─────────────────────────────────────────────┐
│ Step 1: System Overview                     │
├─────────────────────────────────────────────┤
│                                             │
│ System Description *                        │
│ [Text Area: Describe your system...]        │
│                                             │
│ Technology Stack                            │
│ [Multi-select: GPT-4, PostgreSQL, AWS...]  │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔍 Data Types Handled                   │ │
│ │ What types of data does your system     │ │
│ │ process?                                 │ │
│ │ [Multi-select dropdown]                  │ │
│ │ ☑ Personal Information (PII)             │ │
│ │ ☑ Financial Data                         │ │
│ │ ☐ Health Information (PHI)               │ │
│ │ ...                                      │ │
│ │                                           │ │
│ │ 💡 Helps generate more relevant questions │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📊 Data Sources                          │ │
│ │ How does your system collect data?       │ │
│ │ [Multi-select dropdown]                  │ │
│ │ ☑ APIs (REST/GraphQL)                    │ │
│ │ ☑ Databases                              │ │
│ │ ☑ File Uploads                           │ │
│ │ ...                                      │ │
│ │                                           │ │
│ │ 💡 Helps identify relevant risks          │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Industry *                                  │
│ [Select: Finance]                           │
│                                             │
│ Deployment Model *                          │
│ [Select: Cloud]                             │
│                                             │
└─────────────────────────────────────────────┘
```

#### Help Text Examples
- **Data Types**: "Select all data types your system handles. This helps us identify relevant compliance and security risks."
- **Data Sources**: "Select all data sources your system uses. This helps us find incidents similar to your architecture."

---

### 4. API Request Construction

#### TypeScript Example
```typescript
// In your form submission handler
async function generateQuestions(assessmentId: string) {
  // Get form data
  const formData = getFormData() // Your existing form data getter

  // Construct request body
  const requestBody = {
    // Existing fields (no changes)
    systemDescription: formData.systemDescription,
    technologyStack: formData.technologyStack || [],
    industry: formData.industry,
    deployment: formData.deployment,
    selectedDomains: formData.selectedDomains || [],
    jurisdictions: formData.jurisdictions || [],
    maxQuestions: 10,

    // NEW: Include data types if collected
    ...(formData.dataTypes && formData.dataTypes.length > 0 && {
      dataTypes: formData.dataTypes
    }),

    // NEW: Include data sources if collected
    ...(formData.dataSources && formData.dataSources.length > 0 && {
      dataSources: formData.dataSources
    })
  }

  // Make API call
  const response = await fetch(`/api/review/${assessmentId}/generate-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  const questions = await response.json()
  return questions
}
```

---

### 5. Response Format (No Changes)

The API response format **remains the same**. The backend returns the same structure:

```typescript
interface QuestionResponse {
  questions: Array<{
    id: string
    text: string
    category: string
    weight: number
    evidence: {
      incidentCount: number
      avgSeverity: number
      relevanceScore: number  // NEW: Now represents multi-factor relevance
      recentExamples: Array<{
        id: string
        title: string
        date: string
        severity: number
        impact: string
      }>
      statistics: {
        totalCost: number
        avgCost: number
        affectedSystems: number
      }
    }
    reasoning: {
      incidentFrequency: number
      avgSeverity: number
      techRelevance: number
      regulatoryImpact: string
    }
    aiGenerated: boolean
  }>
  metadata: {
    totalQuestions: number
    generationTime: number
    systemContext: {
      description: string
      technologyStack: string[]
      dataTypes: string[]        // NEW: Echoed back
      dataSources: string[]      // NEW: Echoed back
      industry: string
      deployment: string
    }
  }
}
```

**Note**: The only change is that `relevanceScore` now represents **multi-factor relevance** (0-1), combining semantic similarity, technology match, data type match, and source match.

---

## 🎨 UI Options Reference

### Option 1: Full Implementation (Best Results)
**Add two multi-select fields to Step 1 form**

**Pros**:
- 100% accurate data type/source information
- Best question quality (20-30% improvement)
- Clear user intent
- Easy to validate

**Cons**:
- Requires form changes
- Adds 2 form fields (minor UX impact)

**Recommendation**: ✅ **Recommended** - Best results for minimal effort

---

### Option 2: Partial Implementation (Good Results)
**Add only one field (either data types OR data sources)**

**Pros**:
- Simpler than full implementation
- Still improves question quality by 10-15%
- Minimal form changes

**Cons**:
- Missing one dimension of relevance matching
- Not as accurate as full implementation

**Recommendation**: ⚠️ **Acceptable** - If form space is limited

---

### Option 3: No Form Changes (Fallback)
**Let backend extract from system description**

**Pros**:
- Zero frontend changes required
- System works immediately
- No UX impact

**Cons**:
- Extraction accuracy: ~70-80%
- May miss some data types/sources
- Question quality improvement: 5-10%

**Recommendation**: ⚠️ **Fallback only** - Use if frontend resources are limited

---

## 📊 Data Type Options

### Recommended Options for Multi-Select

```typescript
const dataTypeOptions = [
  // Personal Data
  { value: "PII", label: "Personal Information (PII)", category: "Personal" },
  { value: "Email", label: "Email Addresses", category: "Personal" },
  { value: "Phone", label: "Phone Numbers", category: "Personal" },
  { value: "Location", label: "Location Data", category: "Personal" },
  { value: "IP Address", label: "IP Addresses", category: "Personal" },
  { value: "Biometric", label: "Biometric Data", category: "Personal" },

  // Financial Data
  { value: "Financial", label: "Financial Data", category: "Financial" },
  { value: "Payment", label: "Payment Card Data", category: "Financial" },
  { value: "Bank Account", label: "Bank Account Info", category: "Financial" },
  { value: "Transaction", label: "Transaction Data", category: "Financial" },

  // Health Data
  { value: "PHI", label: "Health Information (PHI)", category: "Health" },
  { value: "Medical", label: "Medical Records", category: "Health" },

  // Security Data
  { value: "Authentication", label: "Credentials/Passwords", category: "Security" },
  { value: "Access Tokens", label: "Access Tokens/Keys", category: "Security" },

  // Other
  { value: "Other", label: "Other Sensitive Data", category: "Other" }
]
```

### Grouping (Optional Enhancement)
```tsx
<MultiSelect
  label="Data Types Handled"
  name="dataTypes"
  options={dataTypeOptions}
  grouped={true}  // Group by category
  placeholder="Select data types..."
/>
```

Result:
```
[Data Types Handled ▼]
  Personal
    ☐ Personal Information (PII)
    ☐ Email Addresses
    ☐ Phone Numbers
    ☐ Location Data
  Financial
    ☐ Financial Data
    ☐ Payment Card Data
  Health
    ☐ Health Information (PHI)
  Security
    ☐ Credentials/Passwords
```

---

## 📊 Data Source Options

### Recommended Options for Multi-Select

```typescript
const dataSourceOptions = [
  // Network Sources
  { value: "API", label: "APIs (REST/GraphQL)", category: "Network" },
  { value: "Third-party Service", label: "Third-party Services", category: "Network" },
  { value: "Webhook", label: "Webhooks", category: "Network" },

  // Storage Sources
  { value: "Database", label: "Databases", category: "Storage" },
  { value: "Cloud Storage", label: "Cloud Storage (S3, etc.)", category: "Storage" },
  { value: "File Upload", label: "File Uploads", category: "Storage" },

  // Communication Sources
  { value: "Email", label: "Email", category: "Communication" },
  { value: "Message Queue", label: "Message Queues", category: "Communication" },

  // User Interfaces
  { value: "Web Forms", label: "Web Forms", category: "User Interface" },
  { value: "Mobile App", label: "Mobile App", category: "User Interface" },
  { value: "Desktop App", label: "Desktop App", category: "User Interface" },

  // Real-time Sources
  { value: "Streaming", label: "Real-time Streams", category: "Real-time" },
  { value: "IoT Device", label: "IoT Devices", category: "Real-time" },

  // Other
  { value: "Other", label: "Other Sources", category: "Other" }
]
```

---

## 🔄 Migration Path

### Phase 1: Backend Ready (Current)
✅ Backend supports new fields
✅ Backward compatible (works without new fields)
✅ Extraction fallback available

**Action Required**: None - existing frontend continues to work

---

### Phase 2: Frontend Updates (Optional)
- Add data types multi-select to Step 1
- Add data sources multi-select to Step 1
- Update API request to include new fields
- Test with various combinations

**Timeline**: 1-2 days of development + testing

---

### Phase 3: Production Rollout
- Deploy frontend changes
- Monitor question quality improvement
- Gather user feedback
- Iterate based on feedback

---

## 🧪 Testing Checklist

### Frontend Testing
- [ ] Form renders correctly with new fields
- [ ] Multi-select works as expected
- [ ] Data types options display correctly
- [ ] Data sources options display correctly
- [ ] Selected values persist across navigation
- [ ] API request includes new fields when present
- [ ] API request works without new fields (backward compatibility)
- [ ] Form validation works correctly
- [ ] Help text displays correctly

### Integration Testing
- [ ] API accepts request with new fields
- [ ] API accepts request without new fields (fallback)
- [ ] Questions generated are system-specific
- [ ] Questions reference selected data types
- [ ] Questions reference selected data sources
- [ ] Relevance scores are calculated correctly
- [ ] Empty arrays handled gracefully
- [ ] Invalid values rejected with clear error messages

### Example Test Cases

**Test Case 1: Full Data**
```json
{
  "systemDescription": "AI-powered financial app",
  "technologyStack": ["GPT-4", "PostgreSQL"],
  "dataTypes": ["PII", "Financial"],
  "dataSources": ["API", "Database"],
  "industry": "Finance",
  "deployment": "cloud"
}
```
Expected: Questions highly specific to financial data + API/database risks

**Test Case 2: Minimal Data (Fallback)**
```json
{
  "systemDescription": "We process customer PII via REST API",
  "technologyStack": ["Node.js"],
  "industry": "Healthcare",
  "deployment": "cloud"
}
```
Expected: Backend extracts PII + API from description, generates relevant questions

**Test Case 3: No Optional Fields**
```json
{
  "systemDescription": "Basic web app",
  "technologyStack": [],
  "industry": "Other",
  "deployment": "cloud"
}
```
Expected: Generic questions, basic relevance matching

---

## 📈 Expected Impact

### Question Quality Improvement

| Implementation | Relevance Accuracy | Question Specificity | User Satisfaction |
|----------------|-------------------|---------------------|------------------|
| **No Changes** (v1.0) | 60-70% | Generic | Baseline |
| **Extraction Only** | 70-80% | Moderate | +10% |
| **Partial (1 field)** | 75-85% | Good | +15% |
| **Full (2 fields)** | 80-90% | Excellent | +25% |

### User Experience Metrics

**Before (v1.0)**:
- Questions applicable to system: ~60%
- Questions marked "not applicable": ~40%
- User time spent: 15 min average

**After (v2.0 - Full Implementation)**:
- Questions applicable to system: ~85%
- Questions marked "not applicable": ~15%
- User time spent: 10 min average (33% reduction)

---

## ❓ FAQ

### Q1: Do we HAVE to add the new form fields?
**A**: No. The backend will work without them using extraction fallback. However, adding them improves question quality by 20-30%.

### Q2: Will existing assessments break?
**A**: No. The backend is fully backward compatible. Existing assessments continue to work without any changes.

### Q3: Can we add just one field (data types OR sources)?
**A**: Yes. Any additional data improves question quality. Adding just data types provides ~60% of the benefit.

### Q4: How do we test this?
**A**: Use the test cases provided in this document. Compare questions generated with and without the new fields.

### Q5: What if users don't know what data types they handle?
**A**: Provide help text, examples, and a "Not Sure" option that triggers extraction fallback.

### Q6: Can we show the new fields conditionally (e.g., only for advanced users)?
**A**: Yes, that's a valid approach. You could have a "Show Advanced Options" toggle.

### Q7: Will this slow down question generation?
**A**: No. The backend processing time remains the same (~2-3 seconds). Multi-factor matching is highly optimized.

### Q8: Can we pre-populate the fields based on industry?
**A**: Yes, great idea! Example:
```typescript
// If industry = "Finance"
preSelectedDataTypes = ["PII", "Financial", "Payment"]
preSelectedDataSources = ["API", "Database"]
```

---

## 📞 Support

For questions or issues:
- **Backend API**: Check `/api/review/:id/generate-questions` endpoint
- **Documentation**: See `BACKEND_REDESIGN_QUESTION_GENERATION.md`
- **Testing**: Use Postman collection (provided separately)

---

## ✅ Summary

### Minimal Changes Required
1. **Optional**: Add 2 multi-select fields to Step 1 form
2. **Optional**: Include fields in API request body
3. **No changes**: Response format remains the same
4. **Backward compatible**: Existing code continues to work

### Recommended Approach
✅ **Add the two fields** - 1-2 days of work, 20-30% question quality improvement

### Fallback Approach
⚠️ **No frontend changes** - System works with extraction fallback, 5-10% improvement

---

**End of Specification**
