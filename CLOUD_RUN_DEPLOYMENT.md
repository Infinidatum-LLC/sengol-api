# Cloud Run Deployment - Sengol API with Qdrant Integration

**Date**: 2025-11-10
**Status**: 🚀 Deploying to Cloud Run

---

## Deployment Architecture

```
Internet (HTTPS)
      ↓
Cloud Run: sengol-api
(10.8.0.0/28 via VPC Connector)
      ↓
Internal VPC (10.128.0.0/24)
      ↓
├── Qdrant VM (10.128.0.2:6333)
├── Orchestrator VM (10.128.0.3:3000)
└── Worker VM (10.128.0.4)
```

## Deployment Steps Completed

### 1. ✅ VPC Connector Created
```bash
sengol-connector
- Network: default
- Region: us-central1
- Range: 10.8.0.0/28
- Status: READY
```

### 2. ✅ Dockerfile Created
- Base: node:20-alpine
- Build process: npm ci → prisma generate → npm run build
- Exposes: 4000 (Cloud Run overrides with PORT env var)
- Optimized: Multi-stage build with production dependencies only

### 3. 🚀 Cloud Run Service Deploying
- Service name: `sengol-api`
- Region: `us-central1`
- Memory: 2Gi
- CPU: 2
- Timeout: 300s
- VPC Egress: all-traffic
- Min instances: 0 (scales to zero)
- Max instances: 10

### 4. ✅ Environment Variables Set

**Production Environment**:
```bash
NODE_ENV=production
DATABASE_URL=postgresql://neondb_owner:...@ep-old-pine-adf68y6m-pooler.c-2.us-east-1.aws.neon.tech/neondb
OPENAI_API_KEY=sk-proj-w498bteuauEwaR31-...
QDRANT_HOST=10.128.0.2
QDRANT_PORT=6333
JWT_SECRET=ae5f8b9c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0
ALLOWED_ORIGINS=https://sengol.ai
CACHE_ENABLED=true
CACHE_TTL=3600
REQUEST_TIMEOUT=120000
OPENAI_TIMEOUT=60000
```

**Note**: PORT is automatically set by Cloud Run (removed from env vars to avoid conflict)

---

## Why Cloud Run Instead of Vercel?

**Network Connectivity**: Vercel runs on AWS/Vercel infrastructure and cannot access GCP internal IPs (10.128.0.2) where Qdrant is hosted.

**Cloud Run Benefits**:
1. ✅ Native VPC access - Can reach Qdrant on internal network
2. ✅ Secure - No need to expose Qdrant publicly
3. ✅ Auto-scaling - Scales to zero when not in use
4. ✅ Cost-effective - Pay only for requests
5. ✅ Low latency - Same region as Qdrant (us-central1)

---

## Post-Deployment Steps

### 1. Get Cloud Run URL

After deployment completes:
```bash
gcloud run services describe sengol-api \
  --region=us-central1 \
  --project=elite-striker-477619-p8 \
  --format="value(status.url)"
```

Expected URL format: `https://sengol-api-<hash>-uc.a.run.app`

### 2. Test Health Endpoint

```bash
curl https://sengol-api-<hash>-uc.a.run.app/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-11-10T...",
  "uptime": 123.456
}
```

### 3. Test Detailed Health (includes Qdrant)

```bash
curl https://sengol-api-<hash>-uc.a.run.app/health/detailed

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-11-10T...",
  "uptime": 123.456,
  "database": "connected",
  "qdrant": "connected",
  "openai": "configured"
}
```

### 4. Test Qdrant Integration

```bash
# Get a JWT token first (login endpoint)
curl -X POST https://sengol-api-<hash>-uc.a.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Test questionnaire generation (uses Qdrant)
curl -X POST https://sengol-api-<hash>-uc.a.run.app/api/review/123/generate-questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{}'
```

### 5. Check Logs

```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND \
  resource.labels.service_name=sengol-api" \
  --limit=50 \
  --project=elite-striker-477619-p8 \
  --format="table(timestamp,textPayload)"

# Filter for Qdrant logs
gcloud logging read "resource.type=cloud_run_revision AND \
  resource.labels.service_name=sengol-api AND \
  textPayload=~'Qdrant'" \
  --limit=20 \
  --project=elite-striker-477619-p8
```

---

## Frontend Integration

### Update Frontend Environment Variables

**For Next.js Frontend** (deployed on Vercel):

1. Go to Vercel Dashboard → sengol-frontend → Settings → Environment Variables

2. Update `NEXT_PUBLIC_API_URL`:
   ```bash
   NEXT_PUBLIC_API_URL=https://sengol-api-<hash>-uc.a.run.app
   ```

3. Redeploy frontend:
   ```bash
   cd /path/to/sengol-frontend
   git commit --allow-empty -m "Update API URL to Cloud Run"
   git push
   ```

### Verify Frontend → API Connection

1. Open frontend in browser: https://sengol.ai
2. Check browser console for API calls
3. Verify no CORS errors
4. Test questionnaire generation flow

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Request Latency** (target: < 500ms P95)
   - Navigate to Cloud Run → sengol-api → Metrics → Request latency

2. **Error Rate** (target: < 0.1%)
   - Navigate to Cloud Run → sengol-api → Metrics → Error rate

3. **Instance Count**
   - Verify auto-scaling is working
   - Should scale to 0 when idle

4. **VPC Connectivity**
   - Monitor logs for Qdrant connection errors
   - Check `[Qdrant]` prefix in logs

### Set Up Alerts

```bash
# Create alert policy for high error rate
gcloud alpha monitoring policies create \
  --notification-channels=<channel-id> \
  --display-name="Sengol API - High Error Rate" \
  --condition-display-name="Error rate > 1%" \
  --condition-expression='
    resource.type="cloud_run_revision" AND
    resource.labels.service_name="sengol-api" AND
    metric.type="run.googleapis.com/request_count" AND
    metric.label.response_code_class="5xx"
  ' \
  --condition-threshold-value=0.01 \
  --condition-threshold-duration=300s \
  --project=elite-striker-477619-p8
```

---

## Cost Estimation

### Cloud Run Pricing

**Request Pricing**:
- First 2 million requests/month: FREE
- Additional requests: $0.40 per million

**CPU Pricing** (2 vCPU):
- $0.00002400 per vCPU-second
- Example: 100 requests/min × 2s avg = 200 vCPU-sec/min = $0.69/day

**Memory Pricing** (2 GiB):
- $0.00000250 per GiB-second
- Example: 100 requests/min × 2s avg × 2 GiB = $0.14/day

**Estimated Monthly Cost**:
- Low traffic (10k requests/day): ~$25/month
- Medium traffic (100k requests/day): ~$75/month
- High traffic (1M requests/day): ~$250/month

### Total Infrastructure Cost

| Component | Monthly Cost |
|-----------|--------------|
| Qdrant VM (n2d-standard-2) | $45 |
| Orchestrator VM (e2-medium) | $15 |
| Worker VM (n2-standard-2, preemptible) | $25 |
| Cloud Run (sengol-api) | $25-250 |
| Cloud Functions (2 functions) | $5 |
| VPC Connector | $10 |
| Cloud Storage | $2 |
| Pub/Sub | $2 |
| **Total** | **$129-379** |

---

## Rollback Plan

### If Deployment Fails

1. **Check Logs**:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND \
     resource.labels.service_name=sengol-api" \
     --limit=100 \
     --project=elite-striker-477619-p8
   ```

2. **Redeploy Previous Version**:
   ```bash
   # List revisions
   gcloud run revisions list --service=sengol-api \
     --region=us-central1 \
     --project=elite-striker-477619-p8

   # Rollback to previous revision
   gcloud run services update-traffic sengol-api \
     --to-revisions=<previous-revision>=100 \
     --region=us-central1 \
     --project=elite-striker-477619-p8
   ```

### If Qdrant Integration Fails

1. **Restore Vertex AI Implementation**:
   ```bash
   cd /Users/durai/Documents/GitHub/sengol-api/src/services
   cp incident-search.ts.backup incident-search.ts
   git commit -am "Rollback to Vertex AI"
   git push
   ```

2. **Redeploy**:
   ```bash
   gcloud run deploy sengol-api --source=. \
     --region=us-central1 \
     --project=elite-striker-477619-p8
   ```

---

## Troubleshooting

### Issue: Container fails to start

**Symptoms**: Cloud Run shows "Container failed to start"

**Solutions**:
1. Check Dockerfile syntax
2. Verify all dependencies in package.json
3. Ensure Prisma schema is valid
4. Check build logs in Cloud Build

### Issue: Cannot connect to Qdrant

**Symptoms**: Logs show "Connection refused to 10.128.0.2:6333"

**Solutions**:
1. Verify VPC connector is attached:
   ```bash
   gcloud run services describe sengol-api \
     --region=us-central1 \
     --format="value(spec.template.spec.vpcAccess.connector)"
   ```

2. Check Qdrant VM is running:
   ```bash
   gcloud compute instances describe sengol-vector-db \
     --zone=us-central1-a \
     --format="value(status)"
   ```

3. Test Qdrant from Cloud Run:
   ```bash
   gcloud run services proxy sengol-api \
     --region=us-central1
   # Then curl http://localhost:8080/health/detailed
   ```

### Issue: High latency

**Symptoms**: Response times > 1s

**Solutions**:
1. Check Qdrant performance
2. Verify cache is enabled (CACHE_ENABLED=true)
3. Increase Cloud Run CPU/memory
4. Review database connection pool settings

---

## Security Considerations

### Network Security

1. ✅ **Qdrant Not Exposed**: Remains on internal IP (10.128.0.2)
2. ✅ **VPC Isolation**: Cloud Run → VPC Connector → Internal Network
3. ✅ **HTTPS Only**: Cloud Run enforces HTTPS
4. ✅ **No Public SSH**: VMs accessible only via gcloud ssh

### Application Security

1. ✅ **JWT Authentication**: All protected endpoints require JWT
2. ✅ **CORS Configured**: Only https://sengol.ai allowed
3. ✅ **Environment Variables**: Secrets not in code
4. ✅ **Rate Limiting**: Fastify rate limit middleware

### Recommendations

1. **Enable Cloud Armor** (DDoS protection):
   ```bash
   gcloud compute security-policies create sengol-api-policy \
     --project=elite-striker-477619-p8
   ```

2. **Set up Secret Manager** (for sensitive env vars):
   ```bash
   echo -n "sk-proj-..." | gcloud secrets create openai-api-key \
     --data-file=- \
     --project=elite-striker-477619-p8
   ```

3. **Enable Binary Authorization** (container security):
   ```bash
   gcloud container binauthz policy import policy.yaml \
     --project=elite-striker-477619-p8
   ```

---

## Success Criteria

### Deployment Success

- [ ] Cloud Run service status: READY
- [ ] Health endpoint returns 200 OK
- [ ] Detailed health shows Qdrant connected
- [ ] No errors in Cloud Run logs
- [ ] VPC connector properly attached

### Integration Success

- [ ] Qdrant client connects successfully
- [ ] Vector search returns results
- [ ] Embeddings generate correctly
- [ ] API responses match `IncidentMatch` interface
- [ ] Response times < 500ms (P95)
- [ ] Error rate < 0.1%

### Frontend Integration Success

- [ ] Frontend can call Cloud Run API
- [ ] No CORS errors
- [ ] Questionnaire generation works
- [ ] No breaking changes to UI
- [ ] User experience unchanged

---

## Next Steps After Deployment

1. **Test API Thoroughly**:
   - Run integration tests
   - Test all endpoints
   - Verify Qdrant connectivity
   - Check performance metrics

2. **Update Frontend**:
   - Change API_URL to Cloud Run
   - Redeploy frontend
   - Test end-to-end flow

3. **Monitor for 48 Hours**:
   - Watch error rates
   - Check latency metrics
   - Review logs for issues
   - Verify cost stays within budget

4. **Document Deployment**:
   - Update README with new architecture
   - Document Cloud Run URL
   - Create runbook for operations

---

**Document Version**: 1.0
**Last Updated**: 2025-11-10
**Status**: Deployment In Progress
**Owner**: Sengol AI Engineering Team
