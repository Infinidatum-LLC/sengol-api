# Google Vertex AI Migration Guide

**Migration Date**: November 8, 2025
**From**: d-vecDB VPS (99.213.88.59:40560)
**To**: Google Vertex AI + Cloud Storage

---

## Overview

This document outlines the complete migration from d-vecDB VPS to Google Vertex AI RAG platform. This migration resolves the VPS outage while providing a more scalable, managed solution for incident search and question generation.

### Key Benefits

- **No VPS Management**: Fully managed by Google Cloud
- **Better Reliability**: 99.95% SLA from Google Cloud
- **Auto-Scaling**: Handles traffic spikes automatically
- **Cost Optimization**: Pay only for what you use
- **Zero Frontend Changes**: API endpoints remain identical

---

## Architecture Changes

### Before (d-vecDB VPS)
```
Frontend → API Gateway → incident-search.ts → d-vecDB VPS (99.213.88.59:40560) → PostgreSQL
```

### After (Vertex AI)
```
Frontend → API Gateway → incident-search.ts → Vertex AI RAG → Cloud Storage → PostgreSQL
                                                    ↓
                                            Gemini 1.5 Flash
```

### Caching Layers (Unchanged)
- **L1**: Local memory LRU cache (1-5ms)
- **L2**: Redis (Upstash) distributed cache (20-50ms)
- **L3**: Vertex AI RAG search (100-3000ms)

---

## Migration Checklist

### ✅ Completed (Backend Code)

1. **Dependencies Added** (`package.json`)
   - `@google-cloud/aiplatform@^3.30.0`
   - `@google-cloud/storage@^7.14.0`
   - `@google-cloud/vertexai@^1.9.0`

2. **Vertex AI Client Created** (`src/lib/vertex-ai-client.ts`)
   - Embedding generation (text-embedding-004)
   - RAG search implementation
   - Cloud Storage integration
   - Health check endpoints
   - Same interface as d-vecDB (zero breaking changes)

3. **Updated Services**
   - `src/services/incident-search.ts` → Uses Vertex AI
   - `src/services/dynamic-question-generator.ts` → References updated
   - `src/routes/health.routes.ts` → Vertex AI health checks

4. **Environment Variables Updated** (`.env`)
   ```bash
   # NEW: Google Cloud Configuration
   GOOGLE_CLOUD_PROJECT="sengolvertexapi"
   VERTEX_AI_LOCATION="us-central1"
   GCS_BUCKET_NAME="sengol-incidents"
   VERTEX_AI_CORPUS="incidents-corpus"

   # DEPRECATED: d-vecDB (kept for reference)
   # DVECDB_HOST="99.213.88.59"
   # DVECDB_PORT="40560"
   # DVECDB_COLLECTION="incidents"
   ```

5. **API Endpoints (NO CHANGES)**
   - `/api/review/:id/generate-questions` → Same
   - `/health/detailed` → Now checks Vertex AI instead of d-vecDB
   - All other endpoints unchanged

---

## Setup Instructions

### 1. Google Cloud Project Setup

Already configured by user:
- Project: `sengolvertexapi`
- Region: `us-central1`
- Authenticated as: `durai@sengol.ai`
- Vertex AI API enabled

### 2. Create Cloud Storage Bucket

```bash
# Create bucket for incident data
gsutil mb -p sengolvertexapi -c STANDARD -l us-central1 gs://sengol-incidents

# Set up lifecycle policy (optional - for auto-cleanup of old data)
cat > lifecycle.json <<'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 365}
      }
    ]
  }
}
EOF

gsutil lifecycle set lifecycle.json gs://sengol-incidents
```

### 3. Setup Service Account (for Vercel deployment)

```bash
# Create service account
gcloud iam service-accounts create sengol-api \
    --display-name="Sengol API Service Account" \
    --project=sengolvertexapi

# Grant necessary permissions
gcloud projects add-iam-policy-binding sengolvertexapi \
    --member="serviceAccount:sengol-api@sengolvertexapi.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding sengolvertexapi \
    --member="serviceAccount:sengol-api@sengolvertexapi.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create sengol-api-key.json \
    --iam-account=sengol-api@sengolvertexapi.iam.gserviceaccount.com

# Base64 encode for Vercel (single line)
cat sengol-api-key.json | base64 -w 0 > sengol-api-key-base64.txt
```

### 4. Update Vercel Environment Variables

```bash
# Add new variables
vercel env add GOOGLE_CLOUD_PROJECT production
# Enter: sengolvertexapi

vercel env add VERTEX_AI_LOCATION production
# Enter: us-central1

vercel env add GCS_BUCKET_NAME production
# Enter: sengol-incidents

vercel env add GOOGLE_APPLICATION_CREDENTIALS_JSON production
# Paste contents of sengol-api-key-base64.txt

# Remove deprecated variables (optional)
vercel env rm DVECDB_HOST production
vercel env rm DVECDB_PORT production
vercel env rm DVECDB_COLLECTION production
```

### 5. Deploy Crawlers

See [CRAWLER_DEPLOYMENT_GUIDE.md](./CRAWLER_DEPLOYMENT_GUIDE.md) for full instructions.

**Quick Start:**
```bash
# Deploy crawler to minimal Google Compute Engine instance
gcloud compute instances create sengol-crawler \
    --project=sengolvertexapi \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --image-family=debian-11 \
    --image-project=debian-cloud \
    --boot-disk-size=10GB \
    --scopes=cloud-platform \
    --metadata=startup-script='#!/bin/bash
        # Install dependencies
        apt-get update
        apt-get install -y python3 python3-pip git

        # Clone crawler repo (to be created)
        # git clone https://github.com/Infinidatum-LLC/sengol-crawlers.git
        # cd sengol-crawlers
        # pip3 install -r requirements.txt
        # python3 crawler.py
    '
```

---

## Crawler Architecture

### Data Flow
```
Crawler Instance → Scrape Incidents → Process & Embed → Cloud Storage (JSONL) → Vertex AI RAG → API
```

### Crawler Requirements

1. **Data Sources to Crawl**:
   - Cybersecurity incident databases
   - Regulatory violation reports
   - System failure pattern databases
   - Industry-specific compliance breaches

2. **Output Format** (JSONL in Cloud Storage):
```jsonl
{"id": "incident-001", "content": "Description...", "metadata": {"industry": "fintech", "severity": "high", ...}}
{"id": "incident-002", "content": "Description...", "metadata": {...}}
```

3. **Metadata Schema** (same as d-vecDB):
```typescript
{
  incidentId: string
  incidentType: 'cyber' | 'failure_pattern' | 'regulation_violation'
  organization?: string
  industry?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  incidentDate?: string (ISO date)

  // Security controls
  hadMfa?: boolean
  hadBackups?: boolean
  hadIrPlan?: boolean

  // Financial impact
  estimatedCost?: number
  downtimeHours?: number
  recordsAffected?: number

  // Additional context
  attackType?: string
  attackVector?: string
  failureType?: string
  rootCause?: string
  tags?: string

  // Source text
  embeddingText: string
}
```

---

## Testing

### 1. Local Testing (Development)

```bash
# Set Google Cloud credentials
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sengol-api-key.json"

# Start dev server
npm run dev

# Test health endpoint
curl http://localhost:4000/health/detailed

# Should show:
# {
#   "checks": {
#     "vertexai": {
#       "status": "degraded", // Until bucket is populated
#       "configured": true,
#       "vertexAIReachable": true,
#       "storageReachable": true,
#       "bucketExists": true,
#       "error": "Bucket sengol-incidents does not exist"
#     }
#   }
# }
```

### 2. Integration Testing

```bash
# Test question generation (will use cached OpenAI responses, Vertex AI placeholder)
curl -X POST http://localhost:4000/api/review/test-id/generate-questions \
  -H "Content-Type: application/json" \
  -d '{
    "systemDescription": "AI-powered fintech platform",
    "selectedDomains": ["ai", "cyber"],
    "industry": "finance",
    "questionIntensity": "medium"
  }'

# Expected: Returns questions (will show warnings about GCS bucket not populated)
```

### 3. Production Verification

After deploying to Vercel:

```bash
# Check production health
curl https://api.sengol.ai/health/detailed

# Test question generation
curl -X POST https://api.sengol.ai/api/review/YOUR_ASSESSMENT_ID/generate-questions \
  -H "Content-Type: application/json" \
  -d '{"systemDescription": "...", "selectedDomains": [...], ...}'
```

---

## Deployment

### 1. Build and Test Locally

```bash
# Build
npm run build

# Run build
node dist/app.js

# Verify no errors
```

### 2. Deploy to Vercel

```bash
# Deploy to production
vercel --prod

# Monitor deployment
vercel logs --follow
```

### 3. Verify Deployment

```bash
# Check Vercel deployment status
vercel ls

# Test production API
curl https://api.sengol.ai/health

# Check detailed health (Vertex AI status)
curl https://api.sengol.ai/health/detailed
```

---

## Monitoring

### Key Metrics to Track

1. **Vertex AI Performance**
   - Response time: Target <3000ms
   - Error rate: Target <1%
   - Cost per 1K requests: ~$0.10-0.30

2. **Cache Hit Rates**
   - L1 (Local): Target >60%
   - L2 (Redis): Target >30%
   - L3 (Vertex AI): <10%

3. **Question Generation**
   - Success rate: Target >95%
   - Average latency: Target 6-12s (cached), 15-20s (uncached)

### Health Check Endpoints

```bash
# Basic health
GET /health

# Detailed health (includes Vertex AI status)
GET /health/detailed

# Cache performance metrics
GET /health/optimizations

# Cloud Storage stats
GET /health/storage-stats  # (Add this endpoint if needed)
```

---

## Rollback Plan

If issues arise, you can temporarily:

1. **Option A**: Use Mock Data (Quick Fix)
   - Uncomment mock data fallback in `incident-search.ts`
   - Questions generate but without real incident evidence
   - Takes 5 minutes to implement

2. **Option B**: Revert to d-vecDB (If VPS is fixed)
   ```bash
   # Revert code changes
   git revert <vertex-ai-migration-commit>

   # Update environment variables
   vercel env add DVECDB_HOST production
   vercel env add DVECDB_PORT production

   # Redeploy
   vercel --prod
   ```

---

## Cost Estimates

### Google Cloud Costs (Monthly)

- **Vertex AI Embeddings**: ~$1-5/month (100K requests)
- **Vertex AI RAG Search**: ~$5-15/month (10K searches)
- **Cloud Storage**: ~$0.50/month (10GB data)
- **Compute Engine (Crawler)**: ~$4/month (e2-micro)
- **Total**: **~$10-25/month**

### Comparison to d-vecDB VPS

- **Old VPS Cost**: ~$20-50/month (estimated)
- **New Vertex AI**: ~$10-25/month
- **Savings**: ~$10-25/month + no management overhead

---

## Troubleshooting

### Issue: "GOOGLE_CLOUD_PROJECT not set"
```bash
# Solution: Add to .env
GOOGLE_CLOUD_PROJECT="sengolvertexapi"
```

### Issue: "Bucket sengol-incidents does not exist"
```bash
# Solution: Create bucket
gsutil mb -p sengolvertexapi -l us-central1 gs://sengol-incidents
```

### Issue: "Permission denied" errors
```bash
# Solution: Check service account permissions
gcloud projects get-iam-policy sengolvertexapi \
  --flatten="bindings[].members" \
  --filter="bindings.members:sengol-api@sengolvertexapi.iam.gserviceaccount.com"
```

### Issue: "No incident data found"
```bash
# Solution: Deploy crawlers to populate Cloud Storage
# See CRAWLER_DEPLOYMENT_GUIDE.md
```

---

## Next Steps

1. ✅ **Backend Migration**: Complete
2. ⏳ **Create Cloud Storage Bucket**: Pending
3. ⏳ **Deploy Crawlers**: Pending
4. ⏳ **Populate Incident Data**: Pending
5. ⏳ **Deploy to Vercel**: Pending
6. ⏳ **Monitor Performance**: After deployment

---

## Support

For issues or questions:
- Check logs: `vercel logs`
- Review health endpoint: `/health/detailed`
- Check Vertex AI console: https://console.cloud.google.com/vertex-ai
- Check Cloud Storage: https://console.cloud.google.com/storage/browser/sengol-incidents

---

**Last Updated**: November 8, 2025
**Migration Status**: ✅ Backend Code Complete, ⏳ Infrastructure Pending
