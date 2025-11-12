# GCP Cloud Run Deployment Guide

Complete guide for deploying sengol-api to GCP Cloud Run with automatic git-based deployments (similar to Vercel).

## Overview

**What You're Getting:**
- Serverless API on GCP Cloud Run (like Vercel, but on GCP)
- Git-based auto-deploy (push to git → automatic deployment)
- Access to internal Qdrant VM (10.128.0.2) via VPC Connector
- $1000 free credits (Year 1)
- SOC 2 compliance when you migrate to Qdrant Cloud

**Architecture:**
```
Frontend (Next.js) → Cloud Run API → Qdrant VM (10.128.0.2)
                                  ↓
                            PostgreSQL (Neon)
```

**Cost:**
- **With free credits**: $0/month (Year 1)
- **After credits**: $45-141/month (depending on traffic)
- **VPC Connector**: $35-40/month (required for internal IP access)

---

## Prerequisites

1. GCP account with $1000 free credits
2. Project ID: `elite-striker-477619-p8`
3. Repository: `https://github.com/[your-username]/sengol-api`
4. gcloud CLI installed and authenticated

---

## Part 1: Initial Deployment (Manual)

This creates the Cloud Run service for the first time.

### Step 1: Enable GCP APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  vpcaccess.googleapis.com \
  secretmanager.googleapis.com \
  --project=elite-striker-477619-p8
```

**Time**: 2 minutes

---

### Step 2: Create VPC Connector

This allows Cloud Run to access your Qdrant VM at 10.128.0.2.

```bash
gcloud compute networks vpc-access connectors create sengol-connector \
  --network=default \
  --region=us-central1 \
  --range=10.8.0.0/28 \
  --project=elite-striker-477619-p8
```

**Time**: 5-10 minutes
**Cost**: $35-40/month (required for internal IP access)

**Expected Output:**
```
Created connector [sengol-connector].
```

---

### Step 3: Store Secrets in Secret Manager

For security, store sensitive env vars in Secret Manager instead of plain text.

```bash
# Get env vars from your .env file
cd /Users/durai/Documents/GitHub/sengol-api

# Create secrets (one-time setup)
echo -n "$(grep DATABASE_URL .env | cut -d'=' -f2 | tr -d '"')" | \
  gcloud secrets create DATABASE_URL \
  --data-file=- \
  --project=elite-striker-477619-p8

echo -n "$(grep OPENAI_API_KEY .env | cut -d'=' -f2 | tr -d '"')" | \
  gcloud secrets create OPENAI_API_KEY \
  --data-file=- \
  --project=elite-striker-477619-p8

echo -n "$(grep JWT_SECRET .env | cut -d'=' -f2 | tr -d '"')" | \
  gcloud secrets create JWT_SECRET \
  --data-file=- \
  --project=elite-striker-477619-p8

echo -n "10.128.0.2" | \
  gcloud secrets create QDRANT_HOST \
  --data-file=- \
  --project=elite-striker-477619-p8

echo -n "6333" | \
  gcloud secrets create QDRANT_PORT \
  --data-file=- \
  --project=elite-striker-477619-p8

echo -n "https://sengol.ai,https://www.sengol.ai" | \
  gcloud secrets create ALLOWED_ORIGINS \
  --data-file=- \
  --project=elite-striker-477619-p8
```

**Time**: 3 minutes

---

### Step 4: Deploy to Cloud Run (First Time)

This builds the Docker image and deploys it to Cloud Run.

```bash
cd /Users/durai/Documents/GitHub/sengol-api

gcloud run deploy sengol-api \
  --source=. \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --vpc-connector=sengol-connector \
  --vpc-egress=all-traffic \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=0 \
  --set-env-vars="NODE_ENV=production,CACHE_ENABLED=true,CACHE_TTL=3600,REQUEST_TIMEOUT=120000,OPENAI_TIMEOUT=60000" \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,JWT_SECRET=JWT_SECRET:latest,QDRANT_HOST=QDRANT_HOST:latest,QDRANT_PORT=QDRANT_PORT:latest,ALLOWED_ORIGINS=ALLOWED_ORIGINS:latest" \
  --project=elite-striker-477619-p8
```

**Time**: 5-10 minutes (first build is slow)

**Expected Output:**
```
Building using Dockerfile and deploying container to Cloud Run service [sengol-api]
✓ Creating Container Repository...
✓ Building and pushing container...
✓ Deploying to Cloud Run...
Service URL: https://sengol-api-xxxxxxxxx-uc.a.run.app
```

---

### Step 5: Test the Deployment

```bash
# Get the Cloud Run URL
CLOUD_RUN_URL=$(gcloud run services describe sengol-api \
  --region=us-central1 \
  --project=elite-striker-477619-p8 \
  --format='value(status.url)')

echo "Cloud Run URL: $CLOUD_RUN_URL"

# Test health endpoint
curl $CLOUD_RUN_URL/health

# Test API with real data
curl -X POST "$CLOUD_RUN_URL/api/review/test123/generate-questions" \
  -H "Content-Type: application/json" \
  -d '{
    "systemDescription": "AI chatbot with customer data access",
    "industry": "technology",
    "complianceFrameworks": ["gdpr"]
  }'
```

**Expected**: Should return questions with `incidentCount > 0` (API now reaches Qdrant!)

---

## Part 2: Setup Git Auto-Deploy

This configures automatic deployments on git push (like Vercel).

### Step 1: Connect GitHub Repository

```bash
# Create Cloud Build trigger
gcloud builds triggers create github \
  --name="sengol-api-auto-deploy" \
  --repo-name="sengol-api" \
  --repo-owner="[your-github-username]" \
  --branch-pattern="^master$" \
  --build-config="cloudbuild.yaml" \
  --project=elite-striker-477619-p8
```

**Note**: Replace `[your-github-username]` with your actual GitHub username.

**First Time**: You'll be prompted to authenticate with GitHub and grant Cloud Build access to your repository.

---

### Step 2: Grant Cloud Build Permissions

Cloud Build needs permission to deploy to Cloud Run.

```bash
# Get Cloud Build service account
PROJECT_NUMBER=$(gcloud projects describe elite-striker-477619-p8 --format='value(projectNumber)')
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Grant permissions
gcloud projects add-iam-policy-binding elite-striker-477619-p8 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding elite-striker-477619-p8 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding elite-striker-477619-p8 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

---

### Step 3: Test Auto-Deploy

```bash
# Make a small change and push to trigger auto-deploy
cd /Users/durai/Documents/GitHub/sengol-api

# Add a comment to test deployment
echo "# Cloud Run deployment - $(date)" >> README.md

git add README.md
git commit -m "test: Verify Cloud Run auto-deploy works"
git push origin master
```

**Time**: 5-10 minutes for build + deploy

**Monitor Progress**:
```bash
# Watch build progress
gcloud builds list --limit=1 --project=elite-striker-477619-p8

# Or view in browser
open "https://console.cloud.google.com/cloud-build/builds?project=elite-striker-477619-p8"
```

---

## Part 3: Setup Custom Domain (Optional)

Map `api.sengol.ai` to your Cloud Run service.

### Step 1: Verify Domain Ownership

```bash
gcloud domains verify api.sengol.ai --project=elite-striker-477619-p8
```

Follow the instructions to add a TXT record to your DNS.

---

### Step 2: Map Domain to Cloud Run

```bash
gcloud run domain-mappings create \
  --service=sengol-api \
  --domain=api.sengol.ai \
  --region=us-central1 \
  --project=elite-striker-477619-p8
```

---

### Step 3: Update DNS

Add the DNS records shown by the command above to your domain registrar (usually an A record and CNAME record).

---

## Comparison: Vercel vs GCP Cloud Run

| Feature | Vercel | GCP Cloud Run |
|---------|--------|---------------|
| **Deploy on git push** | ✅ Yes | ✅ Yes (via Cloud Build) |
| **Serverless** | ✅ Yes | ✅ Yes |
| **Cost (Year 1)** | $100-150/month | $0 (with $1000 credits) |
| **Access internal IPs** | ❌ No | ✅ Yes (via VPC Connector) |
| **Custom domains** | ✅ Easy | ✅ Easy |
| **Build logs** | ✅ Yes | ✅ Yes |
| **Environment variables** | ✅ Yes | ✅ Yes (Secret Manager) |
| **Preview deployments** | ✅ Auto | ⚠️ Manual (need separate trigger) |
| **Rollback** | ✅ One-click | ✅ One-click |
| **Compliance (SOC 2)** | ✅ Yes | ✅ Yes |

---

## Managing Deployments

### View Deployed Services

```bash
gcloud run services list \
  --region=us-central1 \
  --project=elite-striker-477619-p8
```

### View Service Details

```bash
gcloud run services describe sengol-api \
  --region=us-central1 \
  --project=elite-striker-477619-p8
```

### View Logs

```bash
# Real-time logs
gcloud run services logs read sengol-api \
  --region=us-central1 \
  --project=elite-striker-477619-p8 \
  --follow

# Recent logs
gcloud run services logs read sengol-api \
  --region=us-central1 \
  --project=elite-striker-477619-p8 \
  --limit=100
```

### Rollback to Previous Version

```bash
# List revisions
gcloud run revisions list \
  --service=sengol-api \
  --region=us-central1 \
  --project=elite-striker-477619-p8

# Rollback to specific revision
gcloud run services update-traffic sengol-api \
  --to-revisions=sengol-api-00003-xyz=100 \
  --region=us-central1 \
  --project=elite-striker-477619-p8
```

### Update Environment Variables

```bash
# Update a secret
echo -n "new-value" | gcloud secrets versions add OPENAI_API_KEY \
  --data-file=- \
  --project=elite-striker-477619-p8

# Force new deployment to pick up the change
gcloud run services update sengol-api \
  --region=us-central1 \
  --project=elite-striker-477619-p8
```

---

## Monitoring & Debugging

### View Metrics (CPU, Memory, Requests)

```bash
open "https://console.cloud.google.com/run/detail/us-central1/sengol-api/metrics?project=elite-striker-477619-p8"
```

### Check Build History

```bash
gcloud builds list --limit=10 --project=elite-striker-477619-p8
```

### View Build Logs

```bash
# Get latest build ID
BUILD_ID=$(gcloud builds list --limit=1 --format='value(id)' --project=elite-striker-477619-p8)

# View logs
gcloud builds log $BUILD_ID --project=elite-striker-477619-p8
```

---

## Troubleshooting

### Issue: "VPC Connector not found"

**Solution**: VPC connector takes 5-10 minutes to provision. Wait and retry.

```bash
# Check connector status
gcloud compute networks vpc-access connectors describe sengol-connector \
  --region=us-central1 \
  --project=elite-striker-477619-p8
```

### Issue: "Permission denied" during auto-deploy

**Solution**: Cloud Build service account needs permissions (see Part 2, Step 2).

### Issue: "Build failed: Dockerfile errors"

**Solution**: The Dockerfile is now a multi-stage build. Make sure you pushed the latest changes:

```bash
git pull origin master
cat Dockerfile | head -5
# Should say "# Stage 1: Builder"
```

### Issue: "API can't reach Qdrant"

**Solution**:
1. Verify VPC connector is attached: `gcloud run services describe sengol-api --region=us-central1 --format='value(spec.template.spec.containers[0].resources.limits.vpc-access-connector)'`
2. Check QDRANT_HOST secret: `gcloud secrets versions access latest --secret=QDRANT_HOST`
3. Test from Cloud Shell (inside GCP network):
   ```bash
   curl http://10.128.0.2:6333/collections
   ```

---

## Next Steps

1. ✅ **Deploy API to Cloud Run** (you just did this!)
2. ⬜ **Migrate Qdrant to Qdrant Cloud** (see `/tmp/crawler-migration-guide.md`)
3. ⬜ **Setup monitoring alerts** (optional)
4. ⬜ **Decommission Vercel** (save $100/month)
5. ⬜ **Decommission Qdrant VM after migration** (save $40/month)

**Total Savings**: $140/month ($1680/year) after migration complete

---

## Cost Breakdown (After Free Credits)

| Component | Monthly Cost |
|-----------|--------------|
| Cloud Run (100K requests) | $10-15 |
| VPC Connector | $35-40 |
| Container Registry Storage | $1-2 |
| **Total** | **$46-57/month** |

**At 1M requests/month**: $106-141/month

**Compare to Vercel**: $100 static IP + $20-50 data transfer = $120-150/month

**Savings**: $63-94/month even after free credits!

---

## Summary

You now have:
- ✅ Serverless API on Cloud Run
- ✅ Git-based auto-deploy (like Vercel)
- ✅ Access to internal Qdrant VM (10.128.0.2)
- ✅ Secure secret management
- ✅ $0 cost (Year 1 with free credits)
- ✅ SOC 2 compliant infrastructure

**API is now live at**: https://sengol-api-xxxxxxxxx-uc.a.run.app

**Next**: Map custom domain api.sengol.ai (Part 3) and migrate to Qdrant Cloud to complete the migration.
