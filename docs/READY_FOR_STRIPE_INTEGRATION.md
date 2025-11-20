# ✅ Ready for Stripe Integration - Action Plan

**Status**: Code is ready, awaiting environment variable configuration
**Last Updated**: November 2025

---

## Current State

✅ **Code**: Trial system implementation archived in `docs/trial-system-reference/`
✅ **Configuration**: `cloudbuild.yaml` updated to load Stripe secrets from Google Secret Manager
✅ **Documentation**: Complete setup guide provided
⏳ **Blocking**: Stripe environment variables not yet configured in Google Secret Manager

---

## Quick Start - What You Need to Do

### 1. Create Stripe Secrets in Google Cloud Console

Go to: https://console.cloud.google.com/security/secret-manager

**Create Secret #1: `STRIPE_SECRET_KEY`**
```
Name: STRIPE_SECRET_KEY
Value: sk_live_... (copy from https://dashboard.stripe.com/apikeys)
```

**Create Secret #2: `STRIPE_WEBHOOK_SECRET`**
```
Name: STRIPE_WEBHOOK_SECRET
Value: whsec_... (copy from https://dashboard.stripe.com/webhooks)
```

### 2. Register Webhook in Stripe Dashboard

Go to: https://dashboard.stripe.com/webhooks

**Add Webhook Endpoint:**
- URL: `https://api.sengol.ai/api/webhooks/stripe`
- Events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy the signing secret → Use as `STRIPE_WEBHOOK_SECRET`

### 3. Restore Trial System Code

From `docs/trial-system-reference/`:
```bash
cp docs/trial-system-reference/stripe-webhook.ts src/routes/
cp docs/trial-system-reference/trial-protected-routes.example.ts src/routes/
cp docs/trial-system-reference/index.ts src/routes/
```

### 4. Enable Trial System in src/app.ts

Uncomment two lines:
```typescript
// Line 20: Uncomment this
import { registerAllRoutes } from './routes/index'

// Line 93: Uncomment this
await registerAllRoutes(fastify)
```

### 5. Deploy

```bash
git add .
git commit -m "feat: Re-enable trial system with Stripe integration configured"
git push origin master
# Cloud Build will automatically deploy
```

---

## What Happens After You Deploy

1. **Cloud Build** automatically triggers on `git push`
2. **Dockerfile** builds the application
3. **cloudbuild.yaml** deploys to Cloud Run with:
   - Stripe secrets from Google Secret Manager
   - Database URL and other existing secrets
4. **Cloud Run service** starts with Stripe webhooks enabled
5. **Stripe webhooks** can now deliver events to `/api/webhooks/stripe`

---

## Verification Steps

### Test Stripe Connection
```bash
# Using Stripe CLI (recommended)
stripe listen --forward-to https://api.sengol.ai/api/webhooks/stripe

# Will show: Ready! You are now listening to Stripe events...
```

### Test Webhook Reception
```bash
# Stripe CLI will forward test events
stripe trigger customer.subscription.created

# Check Cloud Run logs
gcloud run logs read sengol-api --limit 50
```

### Verify from Dashboard
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click your webhook endpoint
3. Check "Events" tab - should show received webhook events

---

## Documentation Available

📖 **docs/VERCEL_STRIPE_SETUP_GUIDE.md** (263 lines)
- Detailed step-by-step Stripe setup
- Cloud Run configuration
- Troubleshooting guide

📖 **docs/TRIAL_SYSTEM_STATUS_AND_NEXT_STEPS.md** (243 lines)
- Current system status
- Integration issues identified
- How to properly implement

📖 **docs/PHASE_3B_IMPLEMENTATION_SUMMARY.md** (474 lines)
- Complete technical overview
- Architecture integration
- Code patterns and examples

📖 **docs/TRIAL_SYSTEM_FINAL_STATUS.md** (600+ lines)
- Final status from previous session
- Complete feature list
- Production deployment guide

---

## Files Already Updated for Production

✅ **cloudbuild.yaml**
- Added `STRIPE_SECRET_KEY` to secrets
- Added `STRIPE_WEBHOOK_SECRET` to secrets
- Ready to pass secrets to Cloud Run

✅ **.env.example**
- Already contains Stripe variables:
  - `STRIPE_SECRET_KEY=sk_test_...`
  - `STRIPE_WEBHOOK_SECRET=whsec_test_...`

✅ **Dockerfile**
- Ready to build with Stripe support
- Multi-stage build for optimization

---

## Timeline

| Step | Time | Status |
|------|------|--------|
| Code Implementation | ✅ Complete | From previous session |
| Code Disabled | ✅ Complete | Due to missing env vars |
| Documentation | ✅ Complete | All guides written |
| cloudbuild.yaml Updated | ✅ Complete | Stripe secrets configured |
| Create Stripe Secrets | ⏳ Awaiting | You need to do this |
| Restore Code | ⏳ Awaiting | You need to do this |
| Deploy | ⏳ Awaiting | After above steps |

---

## Cost Estimate

**Google Secret Manager**: ~$6 per secret/year
**Stripe Fees**: 2.9% + $0.30 per transaction (standard)
**Cloud Run**: Included in current compute budget

---

## Success Criteria

✅ Stripe secrets created in Google Secret Manager
✅ Trial system code restored from archive
✅ Code deployed to Cloud Run successfully
✅ Webhook endpoint receives Stripe events
✅ Subscriptions created/updated in database
✅ Users can access trial-protected endpoints

---

## Next Phase

Once Stripe integration is live, monitor:

1. **Webhook Delivery** - Check Stripe Dashboard event log
2. **Database Updates** - Verify subscriptions saved correctly
3. **Feature Limits** - Test trial limit enforcement
4. **Usage Tracking** - Verify usage incremented correctly
5. **Analytics** - Monitor trial→paid conversion

---

## Support

For issues during setup, refer to:
- **Setup Guide**: `docs/VERCEL_STRIPE_SETUP_GUIDE.md`
- **Troubleshooting**: Bottom of setup guide
- **Stripe Docs**: https://stripe.com/docs/webhooks
- **Cloud Run Docs**: https://cloud.google.com/run/docs

---

## TL;DR

1. Create 2 secrets in Google Cloud Console
2. Register webhook in Stripe Dashboard
3. Restore 3 files from `docs/trial-system-reference/`
4. Uncomment 2 lines in `src/app.ts`
5. Deploy with `git push`
6. Done! ✨

**Estimated Time**: 15-20 minutes

---

**Ready to proceed?** Follow the "Quick Start" section above!
