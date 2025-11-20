# Stripe Integration - Cloud Run Deployment Checklist

**Date**: November 20, 2025  
**Status**: ✅ Configuration Complete - Awaiting Secret Creation  
**Platform**: Google Cloud Run (via Cloud Build auto-deployment)

---

## Current Configuration Status

### ✅ Environment Variables Template
**File**: `.env.example` (Lines 21-24)
```
# STRIPE - Payment Processing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

**Status**: ✅ Defined and committed

---

### ✅ Cloud Build Configuration
**File**: `cloudbuild.yaml` (Line 58)

**Current Configuration**:
```yaml
--update-secrets
'DATABASE_URL=DATABASE_URL:latest,
 OPENAI_API_KEY=OPENAI_API_KEY:latest,
 JWT_SECRET=JWT_SECRET:latest,
 QDRANT_HOST=QDRANT_HOST:latest,
 QDRANT_PORT=QDRANT_PORT:latest,
 ALLOWED_ORIGINS=ALLOWED_ORIGINS:latest,
 STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,
 STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest'
```

**Status**: ✅ Updated and committed (commit ab1c95f)

**What This Does**:
- Cloud Build reads secrets from Google Secret Manager
- Injects them into Cloud Run service during deployment
- Secrets are referenced as `STRIPE_SECRET_KEY:latest` (latest version)
- No need to hardcode secrets in code or configuration files

---

## Required Google Cloud Console Actions

### Step 1: Create STRIPE_SECRET_KEY Secret

**Action**:
1. Go to: https://console.cloud.google.com/security/secret-manager
2. Click "Create Secret"
3. **Name**: `STRIPE_SECRET_KEY`
4. **Secret value**: Copy from https://dashboard.stripe.com/apikeys
   - Look for **Secret Key** (starts with `sk_live_`)
5. Click "Create Secret"

**Verification**:
```bash
gcloud secrets describe STRIPE_SECRET_KEY
# Output should show: name: STRIPE_SECRET_KEY
```

---

### Step 2: Create STRIPE_WEBHOOK_SECRET Secret

**Action**:
1. Go to: https://console.cloud.google.com/security/secret-manager
2. Click "Create Secret"
3. **Name**: `STRIPE_WEBHOOK_SECRET`
4. **Secret value**: Copy from https://dashboard.stripe.com/webhooks
   - Create webhook endpoint for URL: `https://api.sengol.ai/api/webhooks/stripe`
   - Copy the **Signing Secret** (starts with `whsec_`)
5. Click "Create Secret"

**Verification**:
```bash
gcloud secrets describe STRIPE_WEBHOOK_SECRET
# Output should show: name: STRIPE_WEBHOOK_SECRET
```

---

### Step 3: Register Webhook in Stripe Dashboard

**Action**:
1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. **Endpoint URL**: `https://api.sengol.ai/api/webhooks/stripe`
4. **Events to listen**: Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the **Signing Secret** (starts with `whsec_`)
7. Use this value for `STRIPE_WEBHOOK_SECRET` from Step 2 above

---

### Step 4: Grant Cloud Run Service Account Access (Optional)

**Note**: Usually auto-configured by Cloud Build, but verify if needed.

```bash
# Get your GCP project ID
PROJECT_ID=$(gcloud config get-value project)

# Get Cloud Run service account
SERVICE_ACCOUNT=$(gcloud iam service-accounts list \
  --filter="email:*cloud-run-sa*" \
  --format="value(email)")

# Grant secretAccessor role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Deployment Flow

### How Cloud Run Gets the Secrets

```
1. You push code to GitHub
   ↓
2. Cloud Build trigger activates automatically
   ↓
3. Cloud Build builds Docker image
   ↓
4. Cloud Build deploys to Cloud Run
   - Reads STRIPE_SECRET_KEY from Secret Manager
   - Reads STRIPE_WEBHOOK_SECRET from Secret Manager
   - Injects as environment variables into Cloud Run service
   ↓
5. Cloud Run service starts with secrets available
   ↓
6. Stripe webhooks can now be processed
```

---

## Code That Uses These Secrets

### Trial System Code (Currently Disabled)
**Location**: `docs/trial-system-reference/stripe-webhook.ts`

The Stripe webhook handler uses:
- `process.env.STRIPE_SECRET_KEY` - Initialize Stripe client
- `process.env.STRIPE_WEBHOOK_SECRET` - Verify webhook signatures

### When Re-enabled
Once you follow "Step 5" in `docs/READY_FOR_STRIPE_INTEGRATION.md`:
1. Restore trial system code from archive
2. Uncomment imports in `src/app.ts`
3. Push to GitHub
4. Cloud Build auto-deploys with secrets injected
5. Trial system becomes active

---

## Verification Steps

### After Creating Secrets

**Verify secrets exist**:
```bash
gcloud secrets list
# Should show: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
```

**View secret metadata** (NOT the secret value):
```bash
gcloud secrets describe STRIPE_SECRET_KEY
gcloud secrets describe STRIPE_WEBHOOK_SECRET
```

---

### After Deploying Code

**Check Cloud Run environment variables** (via Console):
1. Go to: https://console.cloud.google.com/run
2. Click on "sengol-api" service
3. Check "Environment variables" section
4. Should show `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (values masked)

---

### Test Webhook Endpoint

**Using Stripe CLI**:
```bash
# Install if needed
brew install stripe/stripe-cli/stripe

# Listen for events
stripe listen --forward-to https://api.sengol.ai/api/webhooks/stripe

# In another terminal, trigger test event
stripe trigger customer.subscription.created

# Watch Cloud Run logs
gcloud run logs read sengol-api --limit 50
```

**Check Stripe Dashboard**:
1. Go to: https://dashboard.stripe.com/webhooks
2. Click your webhook endpoint
3. Check "Events" tab for delivery status
4. Should see 200 OK responses

---

## Deployment Checklist

| Task | Status | Next Action |
|------|--------|-------------|
| `.env.example` configured | ✅ Done | N/A |
| `cloudbuild.yaml` updated | ✅ Done | N/A |
| Trial system code archived | ✅ Done | N/A |
| Create `STRIPE_SECRET_KEY` in Secret Manager | ⏳ **TODO** | Go to Google Cloud Console |
| Create `STRIPE_WEBHOOK_SECRET` in Secret Manager | ⏳ **TODO** | Go to Google Cloud Console |
| Register webhook in Stripe Dashboard | ⏳ **TODO** | Go to Stripe Dashboard |
| Restore trial system code from archive | ⏳ **Pending** | Follow READY_FOR_STRIPE_INTEGRATION.md |
| Uncomment trial system in `src/app.ts` | ⏳ **Pending** | Follow READY_FOR_STRIPE_INTEGRATION.md |
| Push to GitHub (auto-deploys) | ⏳ **Pending** | Follow READY_FOR_STRIPE_INTEGRATION.md |
| Test webhook delivery | ⏳ **Pending** | Use Stripe CLI |
| Monitor Cloud Run logs | ⏳ **Pending** | Check for webhook events |

---

## Important Security Notes

⚠️ **Never commit secrets to Git**:
- `.env.local` is in `.gitignore`
- Secrets are in Google Secret Manager, not in code
- Cloud Run receives secrets as environment variables at runtime
- Logs are sanitized (secrets never printed)

⚠️ **Stripe Webhook Verification**:
- Cloud Run verifies `stripe-signature` header using `STRIPE_WEBHOOK_SECRET`
- Only valid webhooks from Stripe are processed
- Invalid signatures are rejected with 401

---

## Files Reference

### Configuration Files
- **`.env.example`**: Template with Stripe variables
- **`cloudbuild.yaml`**: Cloud Build config with secret injection
- **`Dockerfile`**: Container configuration (working)

### Documentation
- **`docs/READY_FOR_STRIPE_INTEGRATION.md`**: Quick-start 5-step guide
- **`docs/VERCEL_STRIPE_SETUP_GUIDE.md`**: Detailed setup guide
- **`docs/TRIAL_SYSTEM_STATUS_AND_NEXT_STEPS.md`**: Implementation guide
- **`docs/STRIPE_DEPLOYMENT_CHECKLIST.md`**: This file

### Archived Code
- **`docs/trial-system-reference/`**: Trial system code (currently disabled)

---

## Next Steps

1. **Create secrets in Google Cloud Console** (Steps 1-2 above)
2. **Register webhook in Stripe Dashboard** (Step 3 above)
3. **Follow `docs/READY_FOR_STRIPE_INTEGRATION.md`** to restore and deploy code
4. **Test with Stripe CLI** to verify webhook delivery
5. **Monitor logs** for any issues

**Estimated Time**: 15-20 minutes

---

## Support & Troubleshooting

### Secret Creation Issues
- **Error: "Permission denied"**
  - Ensure you have Editor role in Google Cloud Console
  - Run: `gcloud auth login` to re-authenticate

- **Secret appears empty**
  - Never view secret value in console (for security)
  - Use `gcloud secrets versions access latest --secret=STRIPE_SECRET_KEY` to verify locally only

### Webhook Not Receiving Events
- ✓ Verify URL is correct: `https://api.sengol.ai/api/webhooks/stripe`
- ✓ Check Stripe Dashboard → Webhooks → Events tab for 200 OK status
- ✓ Check Cloud Run logs: `gcloud run logs read sengol-api --limit 50`
- ✓ Verify `STRIPE_WEBHOOK_SECRET` environment variable is set

### Cloud Run Deployment Failed
- ✓ Check Cloud Build logs: `gcloud builds log --stream [BUILD_ID]`
- ✓ Verify secrets exist: `gcloud secrets list`
- ✓ Verify service account has secretAccessor role

---

**Status**: ✅ Configuration Ready  
**Last Updated**: November 20, 2025
