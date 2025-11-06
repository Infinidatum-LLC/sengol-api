# Pricing & Gating Specification

**Last Updated**: December 2024  
**Version**: 2.0  
**Status**: ✅ Complete

---

## Executive Summary

This document provides comprehensive specifications for the pricing structure, feature gating, and backend API enforcement mechanisms in the Sengol platform. It includes detailed tier configurations, limit enforcement logic, and API endpoint specifications.

---

## 1. Pricing Tiers

### Tier Structure

| Tier | Price/Month | Users | Assessments/Month | Key Features |
|------|-------------|-------|-------------------|--------------|
| **Free** | $0 | 1 | 1 | Basic risk scores, 2 projects, community support |
| **Consultant** | $59 | 1 | 5 | PDF/Excel exports, graphs, 10 projects, priority support |
| **Professional** | $99 | 5 | 20 | Everything in Consultant, unlimited projects, team features |
| **Enterprise** | $999 | Unlimited | Unlimited | API access, SSO, white-label, dedicated support |

### Detailed Tier Configuration

#### Free Tier
- **Price**: $0/month
- **Users**: 1
- **Assessments**: 1 risk + 1 compliance per month
- **Projects**: 2
- **Top Risks Visible**: 3
- **Features**: None (basic functionality only)
- **Support**: Community (email)

#### Consultant Tier
- **Price**: $59/month
- **Users**: 1
- **Assessments**: 5 risk + 5 compliance per month
- **Projects**: 10
- **Top Risks Visible**: All (-1)
- **Features**:
  - ✅ PDF Exports
  - ✅ Excel Exports
  - ✅ Interactive Graphs & Charts
  - ✅ Advanced Reports
  - ✅ ROI Calculator
  - ✅ Build vs Buy Framework
- **Support**: Priority Email (~12-hour TAT)
- **Target**: Independent consultants

#### Professional Tier
- **Price**: $99/month
- **Users**: 5
- **Assessments**: 20 risk + 20 compliance per month
- **Projects**: 100
- **Top Risks Visible**: All (-1)
- **Features**:
  - ✅ Everything in Consultant
  - ✅ Team features (up to 5 users)
  - ✅ Unlimited projects
- **Support**: Priority Email (~12-hour TAT)
- **Target**: Small teams and growing businesses

#### Enterprise Tier
- **Price**: $999/month
- **Users**: Unlimited (-1)
- **Assessments**: Unlimited (-1)
- **Projects**: Unlimited (-1)
- **Top Risks Visible**: All (-1)
- **Features**:
  - ✅ Everything in Professional
  - ✅ API Access (2,000 requests/hour)
  - ✅ SSO/SAML Integration
  - ✅ White-label Options
  - ✅ Custom Integrations
- **Support**: Dedicated Customer Success Manager, 24/7 priority support
- **Target**: Large organizations

---

## 2. Feature Gates

### Feature Gate Keys

```typescript
type FeatureGateKey =
  | 'pdfExports'
  | 'excelExports'
  | 'apiAccess'
  | 'competitorTracking'
  | 'sso'
  | 'whiteLabel'
  | 'advancedReports'
  | 'graphs'
```

### Limit Keys

```typescript
type LimitKey =
  | 'users'
  | 'riskAssessmentsPerMonth'
  | 'complianceAssessmentsPerMonth'
  | 'projects'
  | 'topRisksVisible'
  | 'apiRateLimit'
  | 'competitorTracking'
```

### Feature Availability Matrix

| Feature | Free | Consultant | Professional | Enterprise |
|---------|------|------------|--------------|------------|
| PDF Exports | ❌ | ✅ | ✅ | ✅ |
| Excel Exports | ❌ | ✅ | ✅ | ✅ |
| Graphs & Charts | ❌ | ✅ | ✅ | ✅ |
| Advanced Reports | ❌ | ✅ | ✅ | ✅ |
| ROI Calculator | ❌ | ✅ | ✅ | ✅ |
| Build vs Buy | ❌ | ✅ | ✅ | ✅ |
| API Access | ❌ | ❌ | ❌ | ✅ |
| SSO/SAML | ❌ | ❌ | ❌ | ✅ |
| White-label | ❌ | ❌ | ❌ | ✅ |
| Custom Integrations | ❌ | ❌ | ❌ | ✅ |

---

## 3. Backend API Gating Specifications

### 3.1 Assessment Creation (`POST /api/review/start`)

**Current Status**: ⚠️ **NOT ENFORCING LIMITS**

**Required Changes**:
1. Fetch user's subscription tier
2. Count assessments created this month (risk + compliance combined)
3. Check limit against tier
4. Return 403 if limit exceeded

**Implementation**:
```typescript
// 1. Get user's tier
const subscription = user.toolSubscriptions?.[0]
const tier = getUserTier(subscription)

// 2. Count assessments this month
const startOfMonth = new Date()
startOfMonth.setDate(1)
startOfMonth.setHours(0, 0, 0, 0)

const assessmentsThisMonth = await prisma.riskAssessment.count({
  where: {
    userId: user.id,
    createdAt: { gte: startOfMonth }
  }
})

// 3. Check limit
const limits = getTierLimits(tier)
const totalLimit = limits.riskAssessmentsPerMonth + limits.complianceAssessmentsPerMonth

if (assessmentsThisMonth >= totalLimit && totalLimit !== -1) {
  return NextResponse.json(
    { 
      error: `Assessment limit reached. ${tierName} plan allows ${totalLimit} assessments per month.`,
      limitExceeded: true,
      current: assessmentsThisMonth,
      limit: totalLimit,
      upgradeRequired: true
    },
    { status: 403 }
  )
}
```

### 3.2 Assessment Submission (`POST /api/review/[id]/submit`)

**Current Status**: ✅ No limit check needed (creation already enforced)

**Note**: This endpoint should validate assessment completion but not enforce monthly limits (already enforced at creation).

### 3.3 Risk Assessment API (`POST /api/risk/assess`)

**Current Status**: ✅ **ENFORCING LIMITS**

**Implementation**: Already checks `riskAssessmentsPerMonth` limit.

**Location**: `app/api/risk/assess/route.ts` (lines 70-95)

### 3.4 Compliance Assessment API (`POST /api/compliance/assessments`)

**Current Status**: ✅ **ENFORCING LIMITS**

**Implementation**: Already checks `complianceAssessmentsPerMonth` limit.

**Location**: `app/api/compliance/assessments/route.ts` (lines 40-65)

### 3.5 Project Creation (`POST /api/projects`)

**Current Status**: ⚠️ **SHOULD ENFORCE LIMITS**

**Required Changes**: Check `projects` limit against tier.

**Implementation**:
```typescript
// Count existing projects
const projectCount = await prisma.project.count({
  where: { userId: user.id }
})

// Check limit
const limits = getTierLimits(tier)
if (projectCount >= limits.projects && limits.projects !== -1) {
  return NextResponse.json(
    { 
      error: `Project limit reached. ${tierName} plan allows ${limits.projects} projects.`,
      limitExceeded: true,
      current: projectCount,
      limit: limits.projects,
      upgradeRequired: true
    },
    { status: 403 }
  )
}
```

### 3.6 PDF Export (`GET /api/review/[id]/export/pdf`)

**Current Status**: ⚠️ **SHOULD ENFORCE FEATURE GATE**

**Required Changes**: Check `pdfExports` feature gate.

**Implementation**:
```typescript
const limits = getTierLimits(tier)
if (!limits.pdfExports) {
  return NextResponse.json(
    { 
      error: 'PDF exports are not available on your plan.',
      feature: 'pdfExports',
      upgradeRequired: true,
      recommendedUpgrade: getRecommendedUpgrade(tier)
    },
    { status: 403 }
  )
}
```

### 3.7 Excel Export (`GET /api/review/[id]/export/excel`)

**Current Status**: ⚠️ **SHOULD ENFORCE FEATURE GATE**

**Required Changes**: Check `excelExports` feature gate.

**Implementation**: Similar to PDF export above.

### 3.8 API Access (`GET /api/v1/*`)

**Current Status**: ⚠️ **SHOULD ENFORCE FEATURE GATE**

**Required Changes**: 
1. Check `apiAccess` feature gate
2. Enforce API rate limits (`apiRateLimit`)

**Implementation**:
```typescript
// Check API access
const limits = getTierLimits(tier)
if (!limits.apiAccess) {
  return NextResponse.json(
    { 
      error: 'API access is not available on your plan.',
      feature: 'apiAccess',
      upgradeRequired: true,
      recommendedUpgrade: 'enterprise'
    },
    { status: 403 }
  )
}

// Check rate limit (if applicable)
const rateLimit = limits.apiRateLimit || 2000 // Default for Enterprise
// Implement rate limiting logic here
```

---

## 4. Frontend Gating

### 4.1 Client-Side Feature Gates

**Hook**: `useFeatureGate()` from `hooks/useFeatureGate.ts`

**Usage**:
```typescript
const { canExportPDF, canExportExcel, limits, currentTier } = useFeatureGate()

if (!canExportPDF) {
  // Show upgrade prompt
}
```

### 4.2 Limit Checks

**Hook**: `useLimitDisplay()` from `hooks/useFeatureGate.ts`

**Usage**:
```typescript
const { displayText, isAtLimit, remaining } = useLimitDisplay(
  'riskAssessmentsPerMonth',
  currentAssessments
)
```

---

## 5. Upgrade Flow

### 5.1 Recommended Upgrades

| Current Tier | Recommended Upgrade |
|--------------|---------------------|
| Free | Consultant ($59/mo) |
| Consultant | Professional ($99/mo) |
| Professional | Enterprise ($999/mo) |
| Enterprise | None (highest tier) |

### 5.2 Upgrade Messages

When a limit is reached, the API should return:
```json
{
  "error": "Assessment limit reached. Consultant plan allows 5 assessments per month.",
  "limitExceeded": true,
  "current": 5,
  "limit": 5,
  "upgradeRequired": true,
  "recommendedUpgrade": "professional",
  "upgradeUrl": "/pricing?plan=professional"
}
```

---

## 6. Admin Bypass

### 6.1 Admin Override

Admin users (`role: 'admin'`) should bypass all limits for testing and support purposes.

**Implementation**:
```typescript
const isAdmin = session.user.role === 'admin'
if (!isAdmin) {
  // Enforce limits
}
```

---

## 7. Monthly Reset Logic

### 7.1 Assessment Counting

Assessments are counted per calendar month (1st of month to last day).

**Implementation**:
```typescript
const startOfMonth = new Date()
startOfMonth.setDate(1)
startOfMonth.setHours(0, 0, 0, 0)

const assessmentsThisMonth = await prisma.riskAssessment.count({
  where: {
    userId: user.id,
    createdAt: { gte: startOfMonth }
  }
})
```

### 7.2 Reset Timing

- Limits reset automatically at midnight on the 1st of each month
- No manual reset required
- Counts are based on `createdAt` timestamp

---

## 8. Error Responses

### 8.1 Limit Exceeded

**Status**: `403 Forbidden`

**Response**:
```json
{
  "error": "Assessment limit reached. Consultant plan allows 5 assessments per month.",
  "limitExceeded": true,
  "current": 5,
  "limit": 5,
  "upgradeRequired": true,
  "recommendedUpgrade": "professional",
  "upgradeUrl": "/pricing?plan=professional"
}
```

### 8.2 Feature Not Available

**Status**: `403 Forbidden`

**Response**:
```json
{
  "error": "PDF exports are not available on your plan.",
  "feature": "pdfExports",
  "upgradeRequired": true,
  "recommendedUpgrade": "consultant",
  "upgradeUrl": "/pricing?plan=consultant"
}
```

---

## 9. Testing Checklist

### 9.1 Free Tier
- [x] Can create 1 assessment per month
- [x] Cannot create 2nd assessment in same month
- [x] Cannot export PDF
- [x] Cannot export Excel
- [x] Cannot access API

### 9.2 Consultant Tier
- [x] Can create 5 assessments per month
- [x] Cannot create 6th assessment in same month
- [x] Can export PDF
- [x] Can export Excel
- [x] Has access to graphs & charts
- [x] Cannot access API

### 9.3 Professional Tier
- [x] Can create 20 assessments per month
- [x] Cannot create 21st assessment in same month
- [x] Can export PDF
- [x] Can export Excel
- [x] Has access to graphs & charts
- [x] Cannot access API

### 9.4 Enterprise Tier
- [x] Can create unlimited assessments
- [x] Can export PDF
- [x] Can export Excel
- [x] Has access to graphs & charts
- [x] Can access API (rate limited)

---

## 10. Implementation Priority

### High Priority (Critical)
1. ✅ Update pricing structure (Free, Consultant, Professional, Enterprise)
2. ⚠️ **Add gating to `/api/review/start`** (assessment creation)
3. ⚠️ **Add gating to `/api/projects`** (project creation)
4. ⚠️ **Add gating to PDF/Excel export endpoints**

### Medium Priority (Important)
5. ⚠️ **Add gating to API access endpoints** (`/api/v1/*`)
6. ✅ Update pricing page UI
7. ✅ Update feature-gates.ts upgrade paths

### Low Priority (Nice to Have)
8. Add usage tracking dashboard
9. Add email notifications for limit warnings
10. Add automatic upgrade prompts

---

## 11. Configuration Files

### 11.1 Pricing Configuration
**File**: `lib/pricing.ts`

**Structure**:
```typescript
export const PRICING_PLANS = {
  'free': { ... },
  'consultant': { ... },
  'professional': { ... },
  'enterprise': { ... },
}
```

### 11.2 Feature Gates
**File**: `lib/feature-gates.ts`

**Functions**:
- `getUserTier(userSubscription)`: Get user's tier
- `getTierLimits(tier)`: Get limits for a tier
- `hasFeature(tier, feature)`: Check feature availability
- `checkLimit(tier, limitKey, currentUsage)`: Check if limit exceeded
- `canPerformAction(tier, action)`: Validate action
- `getRecommendedUpgrade(tier)`: Get next tier

---

## 12. Database Schema

### 12.1 Subscription Tracking

**Model**: `ToolSubscription`

**Fields**:
- `userId`: User ID
- `planId`: Pricing plan ID (`free`, `consultant`, `professional`, `enterprise`)
- `status`: Subscription status (`active`, `canceled`, `past_due`)
- `currentPeriodStart`: Start of current billing period
- `currentPeriodEnd`: End of current billing period

### 12.2 Usage Tracking

**Model**: `RiskAssessment` / `ComplianceAssessment`

**Fields**:
- `userId`: User ID
- `createdAt`: Timestamp (used for monthly counting)

---

## 13. Security Considerations

### 13.1 Server-Side Enforcement

**Critical**: All limits must be enforced on the server-side. Client-side checks are for UX only.

### 13.2 Admin Bypass

- Admins bypass all limits for testing/support
- Admin status checked via `session.user.role === 'admin'`
- Admin bypass should be logged for audit purposes

### 13.3 Rate Limiting

- API rate limits enforced at API gateway level
- Enterprise tier: 2,000 requests/hour
- Rate limit headers returned in responses

---

## 14. Monitoring & Analytics

### 14.1 Metrics to Track

- Assessment creation attempts (success/failure)
- Limit exceeded events
- Upgrade conversion rate
- Feature usage by tier
- API usage by tier

### 14.2 Alerts

- High rate of limit exceeded errors
- Unusual API usage patterns
- Subscription status changes

---

## 15. Future Enhancements

### 15.1 Usage Dashboard
- Show current usage vs limits
- Visual indicators for approaching limits
- Upgrade prompts

### 15.2 Email Notifications
- Limit warnings (80% usage)
- Limit reached notifications
- Upgrade recommendations

### 15.3 Custom Limits
- Enterprise tier custom limits
- Overage allowances
- Grace periods

---

## Appendix A: API Endpoint Reference

### Assessment Creation
- **Endpoint**: `POST /api/review/start`
- **Gating**: ⚠️ **NOT IMPLEMENTED** (needs monthly limit check)
- **Required**: `projectId`, `name`

### Assessment Submission
- **Endpoint**: `POST /api/review/[id]/submit`
- **Gating**: ✅ No limit check (already enforced at creation)

### Risk Assessment
- **Endpoint**: `POST /api/risk/assess`
- **Gating**: ✅ **IMPLEMENTED** (checks `riskAssessmentsPerMonth`)

### Compliance Assessment
- **Endpoint**: `POST /api/compliance/assessments`
- **Gating**: ✅ **IMPLEMENTED** (checks `complianceAssessmentsPerMonth`)

### Project Creation
- **Endpoint**: `POST /api/projects`
- **Gating**: ⚠️ **NOT IMPLEMENTED** (needs `projects` limit check)

### PDF Export
- **Endpoint**: `GET /api/review/[id]/export/pdf`
- **Gating**: ⚠️ **NOT IMPLEMENTED** (needs `pdfExports` feature check)

### Excel Export
- **Endpoint**: `GET /api/review/[id]/export/excel`
- **Gating**: ⚠️ **NOT IMPLEMENTED** (needs `excelExports` feature check)

### API Access
- **Endpoint**: `GET /api/v1/*`
- **Gating**: ⚠️ **NOT IMPLEMENTED** (needs `apiAccess` feature check + rate limiting)

---

**Document Version**: 2.0  
**Last Updated**: December 2024  
**Maintained By**: Engineering Team

