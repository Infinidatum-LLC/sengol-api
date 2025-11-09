# Vercel Environment Variables Setup

## Method 1: Via Vercel Dashboard (Recommended - Easiest)

1. Go to https://vercel.com/dashboard
2. Select your project: `sengol-api`
3. Go to **Settings** → **Environment Variables**
4. Add these variables one by one:

### Required Environment Variables:

#### 1. GOOGLE_CLOUD_PROJECT
- **Key**: `GOOGLE_CLOUD_PROJECT`
- **Value**: `sengolvertexapi`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

#### 2. VERTEX_AI_LOCATION
- **Key**: `VERTEX_AI_LOCATION`
- **Value**: `us-central1`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

#### 3. GCS_BUCKET_NAME
- **Key**: `GCS_BUCKET_NAME`
- **Value**: `sengol-incidents`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

#### 4. GOOGLE_CLOUD_CREDENTIALS_BASE64
- **Key**: `GOOGLE_CLOUD_CREDENTIALS_BASE64`
- **Value**: See `/tmp/credentials-base64.txt` (copy entire contents)
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

To get the value:
```bash
cat /tmp/credentials-base64.txt
```

Then copy the entire output (it's a very long base64 string).

#### 5. DATABASE_URL
- **Key**: `DATABASE_URL`
- **Value**: `postgresql://neondb_owner:npg_zXVLKR3q6e9Z@ep-nameless-tree-a8idbdk7-pooler.eastus2.azure.neon.tech/sengol?sslmode=require`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

---

## Method 2: Via Vercel CLI (Interactive)

Run these commands one by one:

```bash
# 1. Set GOOGLE_CLOUD_PROJECT
echo "sengolvertexapi" | vercel env add GOOGLE_CLOUD_PROJECT production
echo "sengolvertexapi" | vercel env add GOOGLE_CLOUD_PROJECT preview
echo "sengolvertexapi" | vercel env add GOOGLE_CLOUD_PROJECT development

# 2. Set VERTEX_AI_LOCATION
echo "us-central1" | vercel env add VERTEX_AI_LOCATION production
echo "us-central1" | vercel env add VERTEX_AI_LOCATION preview
echo "us-central1" | vercel env add VERTEX_AI_LOCATION development

# 3. Set GCS_BUCKET_NAME
echo "sengol-incidents" | vercel env add GCS_BUCKET_NAME production
echo "sengol-incidents" | vercel env add GCS_BUCKET_NAME preview
echo "sengol-incidents" | vercel env add GCS_BUCKET_NAME development

# 4. Set GOOGLE_CLOUD_CREDENTIALS_BASE64
cat /tmp/credentials-base64.txt | vercel env add GOOGLE_CLOUD_CREDENTIALS_BASE64 production
cat /tmp/credentials-base64.txt | vercel env add GOOGLE_CLOUD_CREDENTIALS_BASE64 preview
cat /tmp/credentials-base64.txt | vercel env add GOOGLE_CLOUD_CREDENTIALS_BASE64 development

# 5. Set DATABASE_URL
echo "postgresql://neondb_owner:npg_zXVLKR3q6e9Z@ep-nameless-tree-a8idbdk7-pooler.eastus2.azure.neon.tech/sengol?sslmode=require" | vercel env add DATABASE_URL production
echo "postgresql://neondb_owner:npg_zXVLKR3q6e9Z@ep-nameless-tree-a8idbdk7-pooler.eastus2.azure.neon.tech/sengol?sslmode=require" | vercel env add DATABASE_URL preview
echo "postgresql://neondb_owner:npg_zXVLKR3q6e9Z@ep-nameless-tree-a8idbdk7-pooler.eastus2.azure.neon.tech/sengol?sslmode=require" | vercel env add DATABASE_URL development
```

---

## Verification

After setting all environment variables, verify they exist:

```bash
vercel env ls
```

You should see:
- `GOOGLE_CLOUD_PROJECT` (Production, Preview, Development)
- `VERTEX_AI_LOCATION` (Production, Preview, Development)
- `GCS_BUCKET_NAME` (Production, Preview, Development)
- `GOOGLE_CLOUD_CREDENTIALS_BASE64` (Production, Preview, Development)
- `DATABASE_URL` (Production, Preview, Development)

---

## What Each Variable Does:

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `GOOGLE_CLOUD_PROJECT` | Google Cloud project ID | `sengolvertexapi` |
| `VERTEX_AI_LOCATION` | Region for Vertex AI | `us-central1` |
| `GCS_BUCKET_NAME` | Cloud Storage bucket name | `sengol-incidents` |
| `GOOGLE_CLOUD_CREDENTIALS_BASE64` | Service account credentials (base64 encoded) | Long base64 string |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |

---

## After Setting Environment Variables

Deploy to production:

```bash
git add -A
git commit -m "feat: Complete migration to Google Cloud (Gemini + Vertex AI)"
git push origin main
vercel --prod
```

Verify deployment:

```bash
curl https://api.sengol.ai/health/detailed | jq '.checks | {database, vertexai, gemini}'
```

Expected output:
```json
{
  "database": "ok",
  "vertexai": "ok",
  "gemini": "ok"
}
```

---

## Troubleshooting

### If DATABASE_URL still fails in production:

The database URL in your `.env` might be incorrect or expired. Get a fresh one from Neon:

1. Go to https://console.neon.tech/
2. Select project: `sengolvertexapi`
3. Dashboard → Connection Details
4. Copy the connection string
5. Update in Vercel: Settings → Environment Variables → DATABASE_URL

### If Vertex AI fails in production:

Check the credentials are valid:

```bash
# Test locally first
export GOOGLE_APPLICATION_CREDENTIALS=/Users/durai/sengol-sa-key.json
curl http://localhost:4000/health/detailed | jq .checks.vertexai
```

If it works locally, the issue is with the base64 encoding. Recreate it:

```bash
base64 -i /Users/durai/sengol-sa-key.json | tr -d '\n' > /tmp/credentials-base64.txt
cat /tmp/credentials-base64.txt
# Copy this output to Vercel dashboard
```

---

## Quick Copy-Paste Values

For the Vercel dashboard, here are the values ready to copy:

**GOOGLE_CLOUD_PROJECT:**
```
sengolvertexapi
```

**VERTEX_AI_LOCATION:**
```
us-central1
```

**GCS_BUCKET_NAME:**
```
sengol-incidents
```

**GOOGLE_CLOUD_CREDENTIALS_BASE64:**
```bash
# Run this command to get the value:
cat /tmp/credentials-base64.txt
```

**DATABASE_URL:**
```
postgresql://neondb_owner:npg_zXVLKR3q6e9Z@ep-nameless-tree-a8idbdk7-pooler.eastus2.azure.neon.tech/sengol?sslmode=require
```

⚠️ **Important**: If the DATABASE_URL doesn't work, get a fresh one from Neon console.
