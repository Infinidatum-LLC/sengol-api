# Fixing Degraded Services

This guide fixes the two degraded services shown in the health check:
1. ⚠️ **Database**: Authentication error
2. ⚠️ **Vertex AI Storage**: Credential issues

---

## Issue 1: Database Authentication Error

### Problem:
```
"database": {
  "status": "degraded",
  "healthy": false,
  "error": "password authentication failed for user 'neondb_owner'"
}
```

### Root Cause:
The `DATABASE_URL` in your `.env` file either:
1. Has expired/incorrect credentials
2. Points to a database that no longer exists
3. Has the wrong password

### Solution:

#### Step 1: Get New Database Credentials from Neon

1. Go to [Neon Console](https://console.neon.tech/)
2. Select your project: `sengolvertexapi`
3. Go to **Dashboard** → **Connection Details**
4. Copy the **Connection string** (it should look like this):
   ```
   postgresql://neondb_owner:AbCd1234XyZ...@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

#### Step 2: Update `.env` File

```bash
# Open .env file
nano .env

# Update the DATABASE_URL line:
DATABASE_URL="postgresql://neondb_owner:YOUR_NEW_PASSWORD@ep-....neon.tech/neondb?sslmode=require"

# Save and exit (Ctrl+X, then Y, then Enter)
```

#### Step 3: Verify Connection

```bash
# Test database connection
npx prisma db pull

# If successful, you should see:
# "Prisma schema loaded from prisma/schema.prisma
#  Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-....neon.tech:5432"
#  Introspecting based on datasource defined in prisma/schema.prisma
#  ✔ Introspected X models and wrote them into prisma/schema.prisma in Xms"
```

#### Step 4: Restart Dev Server

```bash
# Kill current server
pkill -9 -f "tsx watch"

# Restart
npm run dev

# Verify database is now healthy
curl http://localhost:4000/health/detailed | grep -A 10 "database"
```

**Expected output after fix**:
```json
"database": {
  "status": "ok",
  "healthy": true,
  "responseTime": 50
}
```

---

## Issue 2: Vertex AI Storage Credential Issues

### Problem:
```
"vertexai": {
  "status": "degraded",
  "storageReachable": false,
  "bucketExists": false,
  "error": "Could not load the default credentials."
}
```

### Root Cause:
The Google Cloud credentials are not available locally. This is **NORMAL** for local development and will be **AUTOMATICALLY FIXED** when deployed to Vercel.

### Local Development Solution (Optional):

If you want to test Vertex AI locally, follow these steps:

#### Step 1: Download Service Account Key

```bash
# Set your project ID
export PROJECT_ID="sengolvertexapi"

# Download the service account key
gcloud iam service-accounts keys create ~/sengol-sa-key.json \
  --iam-account=sengol-api@sengolvertexapi.iam.gserviceaccount.com

# Set the environment variable
export GOOGLE_APPLICATION_CREDENTIALS=~/sengol-sa-key.json
```

#### Step 2: Update `.env` File

```bash
# Open .env file
nano .env

# Add this line (update path to your actual home directory):
GOOGLE_APPLICATION_CREDENTIALS=/Users/YOUR_USERNAME/sengol-sa-key.json

# Save and exit
```

#### Step 3: Restart Dev Server

```bash
# Kill current server
pkill -9 -f "tsx watch"

# Restart
npm run dev

# Verify Vertex AI is now healthy
curl http://localhost:4000/health/detailed | grep -A 10 "vertexai"
```

**Expected output after fix**:
```json
"vertexai": {
  "status": "ok",
  "configured": true,
  "vertexAIReachable": true,
  "storageReachable": true,
  "bucketExists": true
}
```

### Production Solution (Recommended):

**Do NOT fix this locally if you're just deploying to production.**

On Vercel, the credentials are already configured via the `GOOGLE_CLOUD_CREDENTIALS_BASE64` environment variable, and this issue will be automatically resolved.

**To verify Vercel has credentials**:
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `sengol-api`
3. Go to **Settings** → **Environment Variables**
4. Verify these variables exist:
   - `GOOGLE_CLOUD_PROJECT` = `sengolvertexapi`
   - `GOOGLE_CLOUD_CREDENTIALS_BASE64` = `<long base64 string>`
   - `VERTEX_AI_LOCATION` = `us-central1`
   - `GCS_BUCKET_NAME` = `sengol-incidents`

If these exist, **Vertex AI will work automatically in production** without any local fixes.

---

## Quick Fix Summary

### For Local Development:

```bash
# Fix 1: Update database credentials
nano .env
# Update DATABASE_URL with new Neon credentials

# Fix 2: Download Google Cloud credentials (optional)
gcloud iam service-accounts keys create ~/sengol-sa-key.json \
  --iam-account=sengol-api@sengolvertexapi.iam.gserviceaccount.com
export GOOGLE_APPLICATION_CREDENTIALS=~/sengol-sa-key.json

# Restart server
pkill -9 -f "tsx watch"
npm run dev

# Verify both services are healthy
curl http://localhost:4000/health/detailed | jq .checks
```

### For Production Deployment:

```bash
# Only fix the database credentials in .env
nano .env
# Update DATABASE_URL with new Neon credentials

# Vertex AI credentials are already configured in Vercel
# Just deploy:
git add -A
git commit -m "fix: Update database credentials"
git push
vercel --prod

# Verify production health
curl https://api.sengol.ai/health/detailed | jq .checks
```

---

## Verification Checklist

After applying the fixes, verify everything is working:

### ✅ Database Health:
```bash
curl http://localhost:4000/health/detailed | jq .checks.database
```
**Expected**: `"status": "ok", "healthy": true`

### ✅ Vertex AI Health:
```bash
curl http://localhost:4000/health/detailed | jq .checks.vertexai
```
**Expected**: `"status": "ok", "storageReachable": true, "bucketExists": true`

### ✅ Gemini Health:
```bash
curl http://localhost:4000/health/detailed | jq .checks.gemini
```
**Expected**: `"status": "ok"`

### ✅ Overall Health:
```bash
curl http://localhost:4000/health/detailed | jq .status
```
**Expected**: `"ok"` (not "degraded")

---

## Troubleshooting

### Database Still Failing?

**Error**: `ECONNREFUSED` or `Connection timeout`
- **Fix**: Check Neon dashboard to ensure database is not paused
- **Action**: Go to Neon Console → Select project → Click "Resume" if paused

**Error**: `database "neondb" does not exist`
- **Fix**: Database was deleted, create a new one
- **Action**:
  1. Create new Neon database
  2. Update `DATABASE_URL` in `.env`
  3. Run `npx prisma db push` to create tables

**Error**: `relation "User" does not exist`
- **Fix**: Database schema needs to be created
- **Action**: Run `npx prisma db push` to create all tables

### Vertex AI Still Failing?

**Error**: `Could not load the default credentials`
- **Fix**: Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable
- **Action**: Follow "Issue 2: Step 1-3" above

**Error**: `Bucket 'sengol-incidents' does not exist`
- **Fix**: Bucket was deleted or wrong project
- **Action**:
  ```bash
  # Verify bucket exists
  gsutil ls gs://sengol-incidents

  # If not, create it
  gsutil mb -p sengolvertexapi -l us-central1 gs://sengol-incidents
  ```

**Error**: `Permission denied` or `Forbidden`
- **Fix**: Service account doesn't have required permissions
- **Action**:
  ```bash
  # Grant required roles
  gcloud projects add-iam-policy-binding sengolvertexapi \
    --member="serviceAccount:sengol-api@sengolvertexapi.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

  gcloud projects add-iam-policy-binding sengolvertexapi \
    --member="serviceAccount:sengol-api@sengolvertexapi.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer"
  ```

---

## Production Deployment After Fixes

Once you've fixed the database credentials and optionally tested Vertex AI locally:

```bash
# 1. Update .env with new DATABASE_URL
nano .env

# 2. Test locally
npm run dev
curl http://localhost:4000/health/detailed | jq .status
# Should show "ok" instead of "degraded"

# 3. Commit and deploy
git add .env
git commit -m "fix: Update database credentials for production"
git push origin main

# 4. Update Vercel environment variables
vercel env pull .env.production
# Update DATABASE_URL in Vercel dashboard if needed

# 5. Deploy to production
vercel --prod

# 6. Verify production health
curl https://api.sengol.ai/health/detailed | jq .checks
```

---

## Important Notes

### Security:
- ⚠️ **Never commit** `.env` file to GitHub (it's in `.gitignore`)
- ⚠️ **Never commit** service account keys (`*.json`) to GitHub
- ✅ **Always use** environment variables for credentials
- ✅ **Always use** Vercel's encrypted environment variable storage

### Database:
- The database connection is **required** for user authentication, subscriptions, and application data
- The database is **NOT required** for incident search (that uses Vertex AI + Cloud Storage)
- If database is degraded, users won't be able to:
  - Login/signup
  - Purchase plans
  - Save projects/assessments

### Vertex AI:
- Vertex AI is **required** for:
  - Incident search (embedding generation + vector search)
  - LLM analysis (Gemini question generation)
- Vertex AI will work **automatically** on Vercel (credentials are pre-configured)
- Local testing of Vertex AI is **optional** (only needed for development)

---

**Quick Summary**:

| Service | Local Fix | Production Fix |
|---------|-----------|----------------|
| **Database** | Update `.env` with new `DATABASE_URL` | Update Vercel env vars with new `DATABASE_URL` |
| **Vertex AI** | Optional: Set `GOOGLE_APPLICATION_CREDENTIALS` | Already configured in Vercel (no action needed) |
| **Gemini** | ✅ Already working | ✅ Already working |

**Most Important**: Fix the database credentials in `.env` and deploy to production. Vertex AI will work automatically on Vercel.
