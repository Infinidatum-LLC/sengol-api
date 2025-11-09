# Vertex AI Migration Scripts

Complete infrastructure setup scripts for migrating from d-vecDB VPS to Google Vertex AI.

## Quick Start (Complete Setup)

Run these scripts in order to set up the entire infrastructure:

### 1. Setup Infrastructure

```bash
# Run the main setup script (creates bucket, service account, compute instance)
./scripts/setup-vertex-ai-infrastructure.sh
```

**This script will create:**
- Cloud Storage bucket: `gs://sengol-incidents`
- Service account: `sengol-api@sengolvertexapi.iam.gserviceaccount.com`
- Compute Engine instance: `sengol-crawler` (e2-micro)
- Service account key files: `sengol-api-key.json` and `sengol-api-key-base64.txt`

**Time:** ~5-10 minutes

### 2. Deploy Crawler Application

```bash
# Deploy crawler and embedding pipeline to the compute instance
./scripts/deploy-crawler.sh
```

**This script will:**
- Copy crawler scripts to the instance
- Setup systemd services
- Configure cron jobs for daily execution
- Start the services

**Time:** ~2-3 minutes

### 3. Setup Vertex AI Grounding

```bash
# Get instructions for Vertex AI Data Store setup
./scripts/setup-vertex-ai-grounding.sh
```

**Follow the manual steps** to create Vertex AI Search data store in Google Cloud Console.

**Time:** ~5 minutes setup + 30-60 minutes indexing

### 4. Update Vercel Environment Variables

```bash
# Add Google Cloud configuration
vercel env add GOOGLE_CLOUD_PROJECT production
# Enter: sengolvertexapi

vercel env add VERTEX_AI_LOCATION production
# Enter: us-central1

vercel env add GCS_BUCKET_NAME production
# Enter: sengol-incidents

vercel env add GOOGLE_APPLICATION_CREDENTIALS_JSON production
# Paste contents of: sengol-api-key-base64.txt
```

**Remove deprecated variables:**
```bash
vercel env rm DVECDB_HOST production
vercel env rm DVECDB_PORT production
vercel env rm DVECDB_COLLECTION production
```

### 5. Deploy to Vercel

```bash
# Build and deploy
npm run build
vercel --prod
```

---

## Script Details

### `setup-vertex-ai-infrastructure.sh`

Main infrastructure setup script.

**Prerequisites:**
- `gcloud` CLI installed
- Authenticated with: `gcloud auth login`

**What it does:**
1. Enables required Google Cloud APIs
2. Creates Cloud Storage bucket with lifecycle policy
3. Creates service account with permissions
4. Generates service account key
5. Creates Compute Engine instance for crawlers

**Output files:**
- `sengol-api-key.json` - Service account key (keep secure!)
- `sengol-api-key-base64.txt` - Base64 encoded key for Vercel

### `deploy-crawler.sh`

Deploys crawler application to Compute Engine instance.

**Prerequisites:**
- `setup-vertex-ai-infrastructure.sh` completed
- Crawler scripts in `../crawler/` directory

**What it does:**
1. Copies crawler.py and embedding-pipeline.py to instance
2. Creates systemd services
3. Sets up cron jobs
4. Starts services

**Services created:**
- `sengol-crawler.service` - Main crawler service
- `sengol-embedding.service` - Embedding pipeline service

**Cron jobs:**
- Crawler: Daily at 2:00 AM
- Embedding pipeline: Daily at 3:00 AM

### `setup-vertex-ai-grounding.sh`

Instructions for Vertex AI Search setup.

**What it does:**
1. Enables Vertex AI Search API
2. Provides manual setup instructions
3. Guides through data store configuration

---

## Monitoring

### Check Crawler Status

```bash
# SSH into instance
gcloud compute ssh sengol-crawler --zone=us-central1-a

# Check service status
sudo systemctl status sengol-crawler.service
sudo systemctl status sengol-embedding.service

# View logs
sudo journalctl -u sengol-crawler.service -f
sudo journalctl -u sengol-embedding.service -f
tail -f /var/log/sengol-crawler.log
tail -f /var/log/sengol-embedding.log
```

### Check Cloud Storage

```bash
# List raw incident files
gsutil ls -lh gs://sengol-incidents/incidents/raw/

# List processed files
gsutil ls -lh gs://sengol-incidents/incidents/processed/

# List embeddings for Vertex AI
gsutil ls -lh gs://sengol-incidents/incidents/embeddings/

# Count total incidents
gsutil cat gs://sengol-incidents/incidents/raw/**/*.jsonl | wc -l
```

### Check API Health

```bash
# Local
curl http://localhost:4000/health/detailed

# Production
curl https://api.sengol.ai/health/detailed
```

---

## Troubleshooting

### Issue: "gcloud: command not found"

**Solution:** Install Google Cloud SDK
```bash
# macOS
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### Issue: "Permission denied" errors

**Solution:** Check authentication
```bash
gcloud auth list
gcloud auth login
gcloud config set project sengolvertexapi
```

### Issue: Crawler not running

**Solution:** Check service logs
```bash
gcloud compute ssh sengol-crawler --zone=us-central1-a
sudo journalctl -u sengol-crawler.service -n 50
```

### Issue: No embeddings generated

**Solution:** Check embedding pipeline
```bash
gcloud compute ssh sengol-crawler --zone=us-central1-a
sudo journalctl -u sengol-embedding.service -n 50

# Manually run pipeline
cd /opt/sengol-crawler
source venv/bin/activate
python3 embedding-pipeline.py
```

### Issue: Vertex AI not returning results

**Solution:**
1. Check data store indexing status in Console
2. Verify embeddings uploaded to gs://sengol-incidents/incidents/embeddings/
3. Check API logs: `vercel logs`

---

## Data Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   Data Pipeline Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CRAWLER (runs daily at 2 AM)                           │
│     └─→ Scrapes: CISA KEV, NVD, Breach DBs                │
│     └─→ Saves to: gs://.../incidents/raw/                  │
│                                                             │
│  2. EMBEDDING PIPELINE (runs daily at 3 AM)                │
│     └─→ Reads: gs://.../incidents/raw/                     │
│     └─→ Generates: 768-dim embeddings (text-embedding-004) │
│     └─→ Saves to: gs://.../incidents/processed/            │
│     └─→ Saves to: gs://.../incidents/embeddings/           │
│                                                             │
│  3. VERTEX AI (automatic indexing)                         │
│     └─→ Monitors: gs://.../incidents/embeddings/           │
│     └─→ Indexes: New JSONL files automatically             │
│     └─→ Ready for: RAG search queries                      │
│                                                             │
│  4. SENGOL API (query time)                                │
│     └─→ Calls: Vertex AI searchByText()                    │
│     └─→ Returns: Top-K similar incidents                   │
│     └─→ Caches: L1 (local) → L2 (Redis) → L3 (Vertex)    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Cost Breakdown

### Monthly Costs (Estimated)

| Service | Usage | Cost |
|---------|-------|------|
| Compute Engine (e2-micro) | 730 hours | **$0** (free tier) |
| Cloud Storage | 10GB | $0.20 |
| Vertex AI Embeddings | 100K texts | $1-2 |
| Vertex AI Search | 10K queries | $5-10 |
| Network Egress | 1GB | $0.12 |
| **Total** | | **~$6-12/month** |

**Comparison to d-vecDB VPS:** ~$20-50/month → ~$6-12/month = **50-80% cost savings**

---

## Security

### Service Account Key Security

**Important:** The `sengol-api-key.json` file contains sensitive credentials.

```bash
# Keep secure
chmod 600 sengol-api-key.json

# Never commit to git
echo "sengol-api-key.json" >> .gitignore
echo "sengol-api-key-base64.txt" >> .gitignore

# Store in Vercel (encrypted)
vercel env add GOOGLE_APPLICATION_CREDENTIALS_JSON production
# Paste base64 encoded key
```

### Rotate Keys Regularly

```bash
# List existing keys
gcloud iam service-accounts keys list \
  --iam-account=sengol-api@sengolvertexapi.iam.gserviceaccount.com

# Delete old key
gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=sengol-api@sengolvertexapi.iam.gserviceaccount.com

# Create new key
gcloud iam service-accounts keys create sengol-api-key-new.json \
  --iam-account=sengol-api@sengolvertexapi.iam.gserviceaccount.com
```

---

## Support

For issues:
- Check logs: `vercel logs`
- Review guides: `docs/VERTEX_AI_MIGRATION_GUIDE.md`
- Check crawler: `docs/CRAWLER_DEPLOYMENT_GUIDE.md`

---

**Last Updated:** November 8, 2025
