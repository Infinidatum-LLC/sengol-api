# Qdrant Refactor - UX Team Requirements

## Executive Summary

The incident search backend has been refactored from Vertex AI RAG/Gemini Grounding to direct Qdrant vector search. This change significantly improves incident retrieval and enables new UX opportunities for the frontend.

**Key Impact**: The API now returns **real historical incidents** (78,827+ records) instead of 0 results, enabling evidence-based risk assessments.

---

## What Changed (Backend)

### Before
- **Implementation**: Vertex AI RAG with Gemini Grounding
- **Problem**: Returned 0 incidents (data not available in Vertex AI)
- **Code**: 695 lines with complex caching layers
- **Dependencies**: Google Cloud Storage, Vertex AI, Gemini AI
- **Performance**: N/A (not functional)

### After
- **Implementation**: Direct Qdrant vector search
- **Result**: Returns real incidents from 78,827-record database
- **Code**: 403 lines (simplified)
- **Dependencies**: Only Qdrant + OpenAI embeddings
- **Performance**: ~700ms average query time

---

## API Contract (No Breaking Changes)

**IMPORTANT**: The API contract remains 100% backward compatible. All existing frontend code will continue to work without modifications.

### Endpoint (Unchanged)
```
POST /api/review/{assessmentId}/similar-incidents
GET /api/incidents/search
```

### Response Structure (Unchanged)
```typescript
interface IncidentMatch {
  id: string
  incidentId: string
  incidentType: string
  attackType?: string | null
  organization?: string | null
  industry?: string | null
  severity?: string | null
  incidentDate?: Date | null
  hadMfa?: boolean | null
  hadBackups?: boolean | null
  hadIrPlan?: boolean | null
  estimatedCost?: number | null
  downtimeHours?: number | null
  recordsAffected?: number | null
  similarity: number
  embeddingText: string
}
```

### Request Options (Unchanged)
```typescript
interface IncidentSearchOptions {
  limit?: number           // Default: 20
  minSimilarity?: number   // Default: 0.3 (range: 0.0-1.0)
  industry?: string        // Filter by industry
  severity?: string[]      // Filter by severity levels
  requireMfaData?: boolean // Only incidents with MFA data
  requireBackupData?: boolean
  requireIrPlanData?: boolean
  incidentTypes?: string[]
}
```

---

## Expected Behavior Changes (UX Impact)

### 1. Incident Results Now Populated

**Before**: Empty results, showing "No similar incidents found"

**After**: Consistently returns 10-20 relevant incidents per query

**UX Action Required**: None (will automatically populate)

**UX Opportunity**:
- Add loading states with better copy: "Searching 78,000+ historical incidents..."
- Show incident count in UI: "Found 15 similar incidents"
- Add empty state only if minSimilarity is too high

---

### 2. Similarity Scores Are More Meaningful

**Score Range**: 0.0 to 1.0 (higher = more similar)

**Typical Ranges**:
- **0.7-1.0**: Highly relevant (almost exact match)
- **0.5-0.7**: Moderately relevant (good match)
- **0.3-0.5**: Loosely relevant (tangentially related)
- **<0.3**: Not relevant (filtered out by default)

**Current Results**: Healthcare AI queries return scores 0.63-0.65

**UX Recommendation**:
```typescript
// Color coding for similarity scores
const getSimilarityColor = (score: number) => {
  if (score >= 0.7) return 'green'   // High confidence
  if (score >= 0.5) return 'yellow'  // Medium confidence
  if (score >= 0.3) return 'orange'  // Low confidence
  return 'gray'                       // Very low (shouldn't appear)
}

// Display as percentage for better user understanding
const displayScore = (score: number) => `${Math.round(score * 100)}% match`
```

---

### 3. Performance Expectations

**Query Time**: ~700ms average (436ms embedding + 198ms search + 66ms overhead)

**UX Recommendation**:
- Show loading spinner after 200ms
- Add skeleton screens for incident cards
- Implement optimistic UI updates where possible

**Timeout Handling**:
- API timeout: 120 seconds (REQUEST_TIMEOUT)
- Typical response: <1 second
- If >3 seconds: Show "Still searching..." message
- If >10 seconds: Show "Taking longer than usual..." message

---

## New UX Opportunities

### 1. Incident Filtering & Facets

The API now supports rich filtering. Consider adding:

**Industry Filter**:
```typescript
// Example: Filter healthcare incidents
const options = {
  industry: 'Healthcare',
  limit: 20
}
```

**UX Component**: Dropdown or multi-select for industries
- Healthcare
- Financial Services
- Technology
- Retail
- Manufacturing
- Government
- Education

**Severity Filter**:
```typescript
const options = {
  severity: ['critical', 'high'],
  limit: 20
}
```

**UX Component**: Checkboxes or pills for severity levels
- Critical (red)
- High (orange)
- Medium (yellow)
- Low (blue)

**Security Controls Filter**:
```typescript
const options = {
  requireMfaData: true,      // Only show incidents with MFA data
  requireBackupData: true,   // Only show incidents with backup data
  requireIrPlanData: true,   // Only show incidents with IR plan data
}
```

**UX Component**: Toggle switches or checkboxes
- "Only incidents with MFA data"
- "Only incidents with backup data"
- "Only incidents with incident response plan data"

---

### 2. Incident Cards/List View

Each incident has rich metadata. Recommended card structure:

```
┌─────────────────────────────────────────────┐
│ 🔴 Critical - Healthcare Data Breach        │
│ 65% match                                   │
├─────────────────────────────────────────────┤
│ Organization: [Redacted Hospital System]    │
│ Date: March 2024                            │
│ Industry: Healthcare                        │
├─────────────────────────────────────────────┤
│ Impact:                                     │
│ • 50,000 records affected                   │
│ • $2.5M estimated cost                      │
│ • 72 hours downtime                         │
├─────────────────────────────────────────────┤
│ Security Controls:                          │
│ ✓ Had MFA  ✗ No Backups  ✓ Had IR Plan     │
└─────────────────────────────────────────────┘
```

**Available Fields**:
- `incidentType` / `attackType` (e.g., "Ransomware", "Phishing")
- `organization` (often redacted/anonymized)
- `industry`
- `severity` (critical/high/medium/low)
- `incidentDate`
- `estimatedCost` (in USD)
- `downtimeHours`
- `recordsAffected`
- `hadMfa`, `hadBackups`, `hadIrPlan` (boolean)
- `similarity` (0.0-1.0)
- `embeddingText` (short summary)

---

### 3. Statistics & Insights Dashboard

The API includes `calculateIncidentStatistics()` which returns:

```typescript
interface IncidentStatistics {
  totalIncidents: number
  dateRange: { earliest?: Date; latest?: Date }
  avgCost: number
  medianCost: number
  totalCost: number
  avgDowntime: number
  totalDowntime: number
  avgRecordsAffected: number
  totalRecordsAffected: number
  mfaAdoptionRate: number       // 0.0-1.0
  backupAdoptionRate: number    // 0.0-1.0
  irPlanAdoptionRate: number    // 0.0-1.0
  costSavingsMfa: number        // Avg cost savings with MFA
  costSavingsBackups: number    // Avg cost savings with backups
  costSavingsIrPlan: number     // Avg cost savings with IR plan
  severityBreakdown: Record<string, number>
  industryBreakdown: Record<string, number>
}
```

**UX Opportunity**: Create a statistics panel showing:

```
┌────────────────────────────────────────────┐
│ 📊 Analysis of 15 Similar Incidents        │
├────────────────────────────────────────────┤
│ Average Cost: $3.2M                        │
│ Average Downtime: 48 hours                 │
│ Records Affected: 125,000 avg              │
├────────────────────────────────────────────┤
│ Security Control Adoption:                 │
│ • MFA: 45% of incidents                    │
│ • Backups: 67% of incidents                │
│ • IR Plan: 34% of incidents                │
├────────────────────────────────────────────┤
│ 💰 Cost Savings with Controls:             │
│ • With MFA: Save $1.2M on average          │
│ • With Backups: Save $2.8M on average      │
│ • With IR Plan: Save $800K on average      │
└────────────────────────────────────────────┘
```

---

### 4. Incident Sorting & Ranking

**Default Sort**: By similarity score (descending)

**Additional Sort Options**:
- Most recent (incidentDate DESC)
- Highest impact (estimatedCost DESC)
- Most records affected (recordsAffected DESC)
- Longest downtime (downtimeHours DESC)

**UX Component**: Dropdown for sort options

```typescript
// Example API usage
const incidents = await searchIncidents(query, options)

// Client-side sort (if needed)
incidents.sort((a, b) => b.estimatedCost - a.estimatedCost)
```

---

### 5. Empty States & Error Handling

**No Results Found** (rare but possible):
```
Cause: minSimilarity too high or very specific query
Message: "No incidents found matching your criteria"
Action: "Try lowering the similarity threshold or broadening your search"
```

**API Error**:
```
Cause: Qdrant connection issue, OpenAI API error
Message: "Unable to search incidents at this time"
Action: "Please try again in a moment"
```

**Timeout**:
```
Cause: Query taking >120 seconds
Message: "Search is taking longer than expected"
Action: "Try simplifying your search or contact support"
```

---

## Performance Optimization Recommendations

### 1. Pagination

**Current**: API returns all results at once (up to `limit`)

**Recommendation**: Request smaller batches initially

```typescript
// Load 10 initially
const initialResults = await searchIncidents(query, { limit: 10 })

// Load more on scroll/click
const moreResults = await searchIncidents(query, {
  limit: 20,  // Total desired
  offset: 10  // Skip first 10 (not yet implemented in API)
})
```

**API Enhancement Needed**: Add `offset` parameter (not currently supported)

### 2. Caching

**Current**: No frontend caching

**Recommendation**: Cache results for identical queries

```typescript
const cacheKey = `incidents:${JSON.stringify({ query, options })}`
const cached = localStorage.getItem(cacheKey)

if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour
  return cached.results
}
```

### 3. Debouncing

For search-as-you-type features:

```typescript
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    searchIncidents(query, options)
  }, 500),
  [options]
)
```

---

## Mobile Considerations

### Incident Cards (Mobile)

Simplify card layout for mobile:

```
┌─────────────────────────┐
│ 🔴 Healthcare Breach    │
│ 65% match               │
├─────────────────────────┤
│ March 2024              │
│ $2.5M • 72hrs downtime  │
│ 50K records             │
├─────────────────────────┤
│ ✓ MFA ✗ Backup ✓ IR     │
└─────────────────────────┘
```

### Filters (Mobile)

Use bottom sheet or modal for filters instead of sidebar.

---

## Accessibility (a11y)

### Screen Reader Announcements

```html
<div role="status" aria-live="polite">
  Searching incidents... Found 15 results.
</div>
```

### Similarity Score

```html
<span aria-label="65% similarity match">65% match</span>
```

### Loading States

```html
<div role="progressbar" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100">
  Loading incidents...
</div>
```

---

## Testing Scenarios

### 1. Standard Search
- Query: "Healthcare AI chatbot vulnerability"
- Expected: 10-20 results with scores 0.6-0.7
- Test: Verify all incident cards render correctly

### 2. Industry Filter
- Query: "Data breach"
- Filter: industry = "Healthcare"
- Expected: Only healthcare incidents
- Test: Verify filtering works

### 3. Severity Filter
- Query: "Ransomware attack"
- Filter: severity = ["critical", "high"]
- Expected: Only critical/high severity incidents
- Test: Verify no medium/low severity incidents

### 4. Empty Results
- Query: Very specific technical jargon
- minSimilarity: 0.9
- Expected: Empty state message
- Test: Verify empty state displays correctly

### 5. Performance
- Query: "Data breach"
- Expected: Results in <1 second
- Test: Measure time to first render

### 6. Error Handling
- Scenario: API timeout or 500 error
- Expected: Error message with retry option
- Test: Mock API failure

---

## API Examples for Frontend

### Basic Search
```typescript
import { searchIncidents } from '@/lib/api/incidents'

const results = await searchIncidents(
  'Healthcare AI vulnerability',
  { limit: 20, minSimilarity: 0.3 }
)

// Display results
results.forEach(incident => {
  console.log(incident.incidentType, incident.similarity)
})
```

### Filtered Search
```typescript
const results = await searchIncidents(
  'Ransomware attack',
  {
    limit: 20,
    minSimilarity: 0.5,
    industry: 'Healthcare',
    severity: ['critical', 'high'],
    requireMfaData: true
  }
)
```

### Calculate Statistics
```typescript
import { calculateIncidentStatistics } from '@/lib/api/incidents'

const stats = calculateIncidentStatistics(results)

console.log(`Average cost: $${stats.avgCost.toLocaleString()}`)
console.log(`MFA adoption: ${Math.round(stats.mfaAdoptionRate * 100)}%`)
console.log(`Cost savings with MFA: $${stats.costSavingsMfa.toLocaleString()}`)
```

---

## Migration Checklist

- [ ] Review incident card designs for new fields
- [ ] Add loading states for search (>200ms)
- [ ] Implement empty state handling
- [ ] Add error handling for API failures
- [ ] Update incident list/grid components
- [ ] Add filtering UI (industry, severity, security controls)
- [ ] Implement statistics dashboard
- [ ] Add similarity score visualization
- [ ] Test with various query types
- [ ] Test error scenarios
- [ ] Performance testing (<1s target)
- [ ] Mobile responsive testing
- [ ] Accessibility audit
- [ ] Cross-browser testing

---

## Questions for UX Team

1. **Incident Display**: Do you want cards, list view, or both?
2. **Filtering**: Should filters be in a sidebar, top bar, or modal?
3. **Statistics**: Where should the statistics panel be displayed?
4. **Sorting**: What sort options are most valuable to users?
5. **Mobile**: Should mobile use infinite scroll or pagination?
6. **Empty State**: What copy/imagery for "no results"?
7. **Loading**: Skeleton screens, spinners, or progress bars?

---

## Support & Contact

**Backend Lead**: Durai (sengol-api repository)
**API Documentation**: See `src/services/incident-search.ts` for implementation details
**Test Endpoint**: `https://sengol-api-678287061519.us-central1.run.app/health`

**Deployment Status**: ✅ Live in production (Cloud Run revision `sengol-api-00004-pwx`)

---

## Appendix: Sample API Response

```json
{
  "success": true,
  "data": [
    {
      "id": "12345",
      "incidentId": "12345",
      "incidentType": "Ransomware",
      "attackType": "Ransomware",
      "organization": "Healthcare Provider XYZ",
      "industry": "Healthcare",
      "severity": "critical",
      "incidentDate": "2024-03-15T00:00:00.000Z",
      "hadMfa": false,
      "hadBackups": true,
      "hadIrPlan": false,
      "estimatedCost": 2500000,
      "downtimeHours": 72,
      "recordsAffected": 50000,
      "similarity": 0.6471,
      "embeddingText": "Healthcare ransomware attack affecting patient records..."
    }
  ],
  "metadata": {
    "totalResults": 15,
    "queryTime": 691,
    "query": "Healthcare AI vulnerability"
  }
}
```
