# Vercel Environment Variables Update Guide

## Required Qdrant Configuration Variables

Add these environment variables to your Vercel project to enable the Qdrant integration:

### Via Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project: `sengol-api`
3. Navigate to: **Settings** → **Environment Variables**
4. Add the following variables:

```bash
# Qdrant Vector Database Configuration
QDRANT_HOST=10.128.0.2
QDRANT_PORT=6333
```

**Important Notes:**
- The Qdrant VM (10.128.0.2) is on GCP's internal network
- Vercel deployments need VPC connectivity to reach the internal IP
- If Vercel cannot reach internal GCP IPs, you have two options:
  1. Expose Qdrant via a public IP with authentication (not recommended)
  2. Use GCP Cloud Run/App Engine instead of Vercel for backend

### Via Vercel CLI

Alternatively, use the Vercel CLI to add environment variables:

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Add environment variables
vercel env add QDRANT_HOST production
# When prompted, enter: 10.128.0.2

vercel env add QDRANT_PORT production
# When prompted, enter: 6333
```

### Verify Existing Variables

Ensure these existing variables are also set in Vercel:

```bash
# Database
DATABASE_URL=postgresql://...

# OpenAI (required for embeddings)
OPENAI_API_KEY=sk-...

# Authentication
JWT_SECRET=...
API_AUTH_TOKEN=...

# Server
NODE_ENV=production
PORT=4000
API_VERSION=v1

# CORS
ALLOWED_ORIGINS=https://sengol.ai,https://www.sengol.ai

# GCP Project (if using GCP services)
GOOGLE_CLOUD_PROJECT=elite-striker-477619-p8

# Caching (optional)
CACHE_ENABLED=true
CACHE_TTL=3600
CACHE_MAX_SIZE=1000

# Resilience (optional)
REQUEST_TIMEOUT=120000
SHUTDOWN_TIMEOUT=30000
OPENAI_TIMEOUT=60000
OPENAI_MAX_RETRIES=3
```

## Network Connectivity Considerations

### Option 1: Vercel → GCP Internal Network (Recommended but Complex)

If you want to keep Qdrant on internal IP (10.128.0.2):

1. **GCP Serverless VPC Access Connector**:
   - Not directly compatible with Vercel
   - Vercel runs on AWS/Vercel infrastructure

2. **Hybrid Architecture**:
   - Deploy API on GCP Cloud Run (can access internal IPs)
   - Use Vercel only for frontend (Next.js)
   - Update frontend to point to Cloud Run API URL

### Option 2: Expose Qdrant Publicly (Simpler but Less Secure)

If you want to keep using Vercel for the API:

1. **Assign External IP to sengol-vector-db**:
   ```bash
   gcloud compute instances add-access-config sengol-vector-db \
     --zone=us-central1-a \
     --project=elite-striker-477619-p8
   ```

2. **Configure Firewall**:
   ```bash
   gcloud compute firewall-rules create allow-qdrant-from-vercel \
     --allow=tcp:6333 \
     --source-ranges=76.76.21.0/24,76.223.0.0/16 \
     --target-tags=qdrant-server \
     --project=elite-striker-477619-p8
   ```
   (Adjust source ranges to Vercel's IP ranges)

3. **Add Authentication to Qdrant**:
   - Configure API key in Qdrant
   - Update `src/lib/qdrant-client.ts` to use API key

4. **Update Environment Variables**:
   ```bash
   QDRANT_HOST=<external-ip>
   QDRANT_PORT=6333
   QDRANT_API_KEY=<your-api-key>
   ```

### Option 3: Deploy API to GCP Cloud Run (Recommended)

**Why this is better:**
- API can access Qdrant on internal network (10.128.0.2)
- No need to expose Qdrant publicly
- Better security and lower latency
- Vercel remains for frontend only

**Steps:**

1. **Build and containerize the API**:
   ```bash
   cd /Users/durai/Documents/GitHub/sengol-api

   # Create Dockerfile if not exists
   cat > Dockerfile << 'EOF'
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npm run build
   EXPOSE 4000
   CMD ["npm", "start"]
   EOF
   ```

2. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy sengol-api \
     --source=. \
     --region=us-central1 \
     --platform=managed \
     --allow-unauthenticated \
     --vpc-connector=sengol-connector \
     --set-env-vars="DATABASE_URL=...,OPENAI_API_KEY=...,QDRANT_HOST=10.128.0.2,QDRANT_PORT=6333" \
     --project=elite-striker-477619-p8
   ```

3. **Update frontend to use Cloud Run URL**:
   ```
   NEXT_PUBLIC_API_URL=https://sengol-api-<hash>-uc.a.run.app
   ```

## Recommended Architecture

```
Frontend (Next.js on Vercel)
         ↓
    HTTPS/Public Internet
         ↓
API (Cloud Run on GCP)  ← Can access internal network
         ↓
Internal VPC (10.128.0.0/24)
         ↓
Qdrant (10.128.0.2:6333)
```

**Benefits:**
- Secure: Qdrant not exposed to internet
- Fast: Low latency between API and Qdrant
- Scalable: Cloud Run auto-scales
- Simple: No complex networking setup

## Testing After Environment Variable Update

After adding the variables, redeploy and test:

```bash
# Trigger Vercel deployment
git commit --allow-empty -m "Update environment variables"
git push

# Or manual redeploy via Vercel dashboard
```

Test the integration:
```bash
curl https://your-vercel-app.vercel.app/api/review/<review-id>/generate-questions \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{}'
```

Check logs for Qdrant connectivity:
- Go to Vercel dashboard → Deployments → View Logs
- Look for `[Qdrant]` log entries
- Verify no connection errors

---

**Document Version**: 1.0
**Last Updated**: 2025-11-10
**Recommendation**: Deploy API to GCP Cloud Run instead of Vercel for better Qdrant connectivity
