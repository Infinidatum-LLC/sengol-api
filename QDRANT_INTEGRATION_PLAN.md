# Qdrant Integration Plan - Maintaining API Compatibility

## Executive Summary

This document outlines the plan to integrate the newly deployed Qdrant vector database with the sengol-api while maintaining 100% backward compatibility with existing API contracts used by frontend clients.

## Current State Analysis

### Existing API Endpoints

The sengol-api currently exposes these endpoints for questionnaire generation and incident search:

1. **POST /api/review/:id/generate-questions**
   - Generates risk assessment questions
   - Uses `findSimilarIncidents()` from `incident-search.ts`
   - Returns `IncidentMatch[]` data type
   - Current Implementation: Vertex AI Vector Search (fallback to Gemini ranking)

2. **Response Contract**:
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

### Newly Deployed Infrastructure

- **Qdrant VM**: 10.128.0.2:6333 (sengol-vector-db)
- **Collection**: sengol_incidents_full
- **Dimensions**: 1536 (OpenAI text-embedding-3-small)
- **Distance Metric**: COSINE
- **Data Pipeline**: Crawler → Embedding Generator → Qdrant Loader

## Integration Strategy (No Breaking Changes)

### Phase 1: Add Qdrant Client (Backward Compatible)

Create new Qdrant client library that can coexist with existing Vertex AI implementation:

**File**: `src/lib/qdrant-client.ts`

Key Features:
- Connects to deployed Qdrant database
- Uses same OpenAI embedding model (text-embedding-3-small)
- Returns data in compatible format
- Independent of existing code

### Phase 2: Update incident-search.ts (Feature Flag Pattern)

Modify `src/services/incident-search.ts` to support BOTH implementations:

```typescript
// Environment variable to control which backend to use
const USE_QDRANT = process.env.USE_QDRANT === 'true'

export async function findSimilarIncidents(
  projectDescription: string,
  options: IncidentSearchOptions = {}
): Promise<IncidentMatch[]> {
  
  if (USE_QDRANT) {
    // New Qdrant implementation
    return await findSimilarIncidentsQdrant(projectDescription, options)
  } else {
    // Existing Vertex AI implementation (default)
    return await findSimilarIncidentsVertexAI(projectDescription, options)
  }
}
```

**Benefits**:
- Zero risk deployment
- Can switch backends via environment variable
- Existing clients unaffected
- Can A/B test performance

### Phase 3: Adapter Pattern for Data Mapping

Create adapter function to map Qdrant results to existing `IncidentMatch` interface:

```typescript
function mapQdrantToIncidentMatch(
  qdrantResult: QdrantSearchResult
): IncidentMatch {
  const metadata = qdrantResult.payload.metadata
  
  return {
    id: String(qdrantResult.id),
    incidentId: qdrantResult.payload.embedding_id,
    incidentType: qdrantResult.payload.category,
    attackType: metadata.attack_type || null,
    organization: metadata.organization || null,
    industry: metadata.industry || null,
    severity: metadata.severity || null,
    incidentDate: metadata.incident_date 
      ? new Date(metadata.incident_date) 
      : null,
    hadMfa: metadata.had_mfa ?? null,
    hadBackups: metadata.had_backups ?? null,
    hadIrPlan: metadata.had_ir_plan ?? null,
    estimatedCost: metadata.estimated_cost || null,
    downtimeHours: metadata.downtime_hours || null,
    recordsAffected: metadata.records_affected || null,
    similarity: qdrantResult.score,
    embeddingText: qdrantResult.payload.embedding_text
  }
}
```

### Phase 4: Environment Variables

Add to `.env` (optional, defaults to existing behavior):

```bash
# Qdrant Configuration (optional - defaults to Vertex AI)
USE_QDRANT=false              # Set to 'true' to use Qdrant
QDRANT_HOST=10.128.0.2        # Internal IP of sengol-vector-db
QDRANT_PORT=6333              # Default Qdrant port
```

### Phase 5: Gradual Rollout Plan

1. **Week 1**: Deploy code with feature flag OFF
   - Verify no regressions
   - All existing tests pass
   - Frontend clients unaffected

2. **Week 2**: Enable Qdrant for staging/dev environment
   - Test response compatibility
   - Compare results with Vertex AI
   - Performance benchmarking

3. **Week 3**: Canary deployment (10% traffic)
   - Monitor error rates
   - Compare response times
   - Validate data quality

4. **Week 4**: Full production rollout (100% traffic)
   - Monitor for 48 hours
   - Keep Vertex AI as fallback
   - Document cost savings

## API Contract Compatibility Matrix

| Field | Existing (Vertex AI) | New (Qdrant) | Status |
|-------|---------------------|--------------|--------|
| id | string | string | ✅ Compatible |
| incidentId | string | string | ✅ Compatible |
| incidentType | string | string | ✅ Compatible |
| attackType | string\|null | string\|null | ✅ Compatible |
| organization | string\|null | string\|null | ✅ Compatible |
| industry | string\|null | string\|null | ✅ Compatible |
| severity | string\|null | string\|null | ✅ Compatible |
| incidentDate | Date\|null | Date\|null | ✅ Compatible |
| hadMfa | boolean\|null | boolean\|null | ✅ Compatible |
| hadBackups | boolean\|null | boolean\|null | ✅ Compatible |
| hadIrPlan | boolean\|null | boolean\|null | ✅ Compatible |
| estimatedCost | number\|null | number\|null | ✅ Compatible |
| downtimeHours | number\|null | number\|null | ✅ Compatible |
| recordsAffected | number\|null | number\|null | ✅ Compatible |
| similarity | number (0-1) | number (0-1) | ✅ Compatible |
| embeddingText | string | string | ✅ Compatible |

**Result**: 100% API compatibility - no breaking changes

## Benefits of Qdrant Integration

### Performance Improvements
- **Faster Search**: Direct vector search (no API overhead)
- **Lower Latency**: Internal network (10.128.0.0/24)
- **Better Caching**: Qdrant's built-in HNSW index

### Cost Savings
- **No Vertex AI Costs**: $0 vs. $X per 1000 queries
- **Predictable Costs**: Fixed VM cost (~$45/month)
- **No API Rate Limits**: Direct database access

### Data Freshness
- **Real-time Updates**: Crawler pipeline updates Qdrant hourly
- **15 Data Sources**: Regulatory, incidents, research, news
- **Automated Pipeline**: No manual data uploads

### Operational Benefits
- **Self-hosted**: Full control over infrastructure
- **No External Dependencies**: Runs in our VPC
- **Disaster Recovery**: Can backup/restore collection

## Testing Strategy

### Unit Tests
```typescript
describe('Qdrant Integration', () => {
  it('should return same interface as Vertex AI', async () => {
    const qdrantResults = await findSimilarIncidentsQdrant(query, options)
    const vertexResults = await findSimilarIncidentsVertexAI(query, options)
    
    expect(qdrantResults[0]).toMatchObject({
      id: expect.any(String),
      incidentId: expect.any(String),
      similarity: expect.any(Number),
      // ... all fields
    })
  })
  
  it('should maintain backward compatibility', async () => {
    const results = await findSimilarIncidents(query, options)
    expect(results).toBeInstanceOf(Array)
    expect(results[0]).toHaveProperty('incidentId')
  })
})
```

### Integration Tests
- Test against live Qdrant database
- Verify filter parameters work correctly
- Confirm similarity scores in expected range (0.7-1.0)
- Validate metadata fields populated

### E2E Tests
- Test full questionnaire generation flow
- Verify frontend receives expected data
- Confirm no UI breaking changes
- Performance regression tests

## Rollback Plan

If issues arise after deployment:

1. **Immediate Rollback** (< 5 minutes):
   ```bash
   # Set environment variable
   export USE_QDRANT=false
   # Restart API server
   pm2 restart sengol-api
   ```

2. **Database Rollback** (if data issues):
   - Qdrant is read-only from API perspective
   - No data migrations needed
   - Safe to switch back and forth

3. **Code Rollback** (if critical bugs):
   - Revert to previous deployment
   - Feature flag ensures old code path still exists

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Response Time**:
   - P50, P95, P99 latency
   - Target: < 500ms (vs. 1-3s with Vertex AI)

2. **Error Rate**:
   - Qdrant connection errors
   - Embedding generation failures
   - Data mapping errors

3. **Data Quality**:
   - Average similarity scores
   - Number of results returned
   - Filter effectiveness

4. **Cost Tracking**:
   - Vertex AI API costs (should drop to $0)
   - OpenAI embedding costs (same as before)
   - Infrastructure costs (Qdrant VM)

### Alert Thresholds
- Error rate > 1%: Warning
- Error rate > 5%: Critical
- Response time > 2s: Warning
- Qdrant VM down: Critical

## Security Considerations

### Network Security
- Qdrant VM: Private IP only (10.128.0.2)
- No public internet exposure
- Firewall rules: Only allow from sengol-api VM

### Access Control
- No authentication on Qdrant (internal network)
- API layer handles all authorization
- Service account permissions unchanged

### Data Privacy
- Same data as existing system
- No PII in vector embeddings
- Metadata follows existing privacy policies

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Qdrant client creation | 1 day | ⏳ In Progress |
| incident-search.ts update | 1 day | 📋 Planned |
| Unit tests | 1 day | 📋 Planned |
| Integration tests | 2 days | 📋 Planned |
| Staging deployment | 3 days | 📋 Planned |
| Canary rollout | 7 days | 📋 Planned |
| Full production | 2 days | 📋 Planned |
| **Total** | **17 days** | |

## Success Criteria

✅ **Must Have**:
1. Zero breaking API changes
2. All existing tests pass
3. Response time < 500ms (P95)
4. Error rate < 0.1%
5. Cost savings > 80%

✅ **Nice to Have**:
1. Better relevance (similarity > 0.8)
2. More results (> 20 per query)
3. Real-time data (< 1 hour lag)

## Appendix: Environment Setup

### Development Environment
```bash
# .env.development
USE_QDRANT=true
QDRANT_HOST=localhost
QDRANT_PORT=6333
OPENAI_API_KEY=sk-...
```

### Staging Environment
```bash
# .env.staging
USE_QDRANT=true
QDRANT_HOST=10.128.0.2
QDRANT_PORT=6333
OPENAI_API_KEY=sk-...
```

### Production Environment
```bash
# .env.production
USE_QDRANT=false  # Start with false, flip to true after validation
QDRANT_HOST=10.128.0.2
QDRANT_PORT=6333
OPENAI_API_KEY=sk-...
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-10
**Owner**: Sengol AI Engineering Team
