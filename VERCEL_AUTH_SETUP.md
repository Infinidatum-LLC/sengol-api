# Vercel Authentication Setup

The API is publicly accessible at `https://api.sengol.ai` but Vertex AI integration needs credentials.

## Option 1: Service Account Key (Recommended - Quickest)

If your organization policy allows creating keys via the Console:

### Step 1: Create Service Account Key via Console

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=sengolvertexapi
2. Click on `sengol-api@sengolvertexapi.iam.gserviceaccount.com`
3. Go to the "KEYS" tab
4. Click "ADD KEY" → "Create new key"
5. Choose "JSON" format
6. Click "CREATE"
7. Save the downloaded JSON file

### Step 2: Encode the Key

```bash
# On macOS/Linux
base64 -i /path/to/sengol-api-key.json | tr -d '\n' > sengol-api-key-base64.txt

# Or in one command
cat /path/to/sengol-api-key.json | base64 | tr -d '\n'
```

### Step 3: Add to Vercel

```bash
# Copy the base64 string from the file
cat sengol-api-key-base64.txt

# Add to Vercel (paste the base64 string when prompted)
vercel env add GOOGLE_APPLICATION_CREDENTIALS_JSON production
```

### Step 4: Redeploy

```bash
vercel --prod
```

### Step 5: Verify

```bash
curl https://api.sengol.ai/health/detailed | jq '.checks.vertexai'

# Should show:
# {
#   "status": "ok",
#   "configured": true,
#   "vertexAIReachable": true,
#   "storageReachable": true,
#   "bucketExists": true
# }
```

---

## Option 2: Fix Workload Identity Federation (Advanced)

Workload Identity Federation requires additional setup with Vercel's OIDC provider.

### Requirements:

1. Vercel Pro/Enterprise plan (OIDC tokens)
2. Additional configuration in Vercel deployment settings
3. Custom credential provider in backend code

This is already partially configured but needs Vercel-specific OIDC token handling.

---

## Current Status

✅ **API is publicly accessible**: https://api.sengol.ai/health
✅ **Deployment protection removed**: Custom domain bypasses auth
✅ **Crawler working**: 151 incidents in Cloud Storage
✅ **Embeddings generated**: 151 embeddings (768-dim)
⚠️ **Production credentials**: Needs service account key (Option 1)

Once you complete Option 1, the full migration will be complete!
