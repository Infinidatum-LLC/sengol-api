# Vercel/Cloud Run Stripe Setup Guide

**Purpose**: Configure Stripe environment variables for trial system deployment

---

## Environment Variables Required

### Required for Stripe Integration

```bash
STRIPE_SECRET_KEY=sk_live_...          # Production Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...        # Stripe webhook signing secret
```

### Optional (already configured)

```bash
DATABASE_URL=...                       # Already in Vercel/Cloud Run
JWT_SECRET=...                        # Already configured
```

---

## Step 1: Get Stripe Credentials

### From Stripe Dashboard:

1. **Stripe Secret Key**:
   - Go to: https://dashboard.stripe.com/apikeys
   - Copy the **Secret Key** (starts with `sk_test_` or `sk_live_`)
   - This is for the `STRIPE_SECRET_KEY` variable

2. **Webhook Secret**:
   - Go to: https://dashboard.stripe.com/webhooks
   - Create webhook endpoint:
     - URL: `https://<your-domain>/api/webhooks/stripe`
     - Events to listen:
       - `customer.subscription.created`
       - `customer.subscription.updated`
       - `customer.subscription.deleted`
       - `invoice.payment_succeeded`
       - `invoice.payment_failed`
   - Copy the **Signing Secret** (starts with `whsec_`)
   - This is for the `STRIPE_WEBHOOK_SECRET` variable

---

## Step 2: Configure in Vercel (if using Vercel)

### Option A: Vercel Dashboard
1. Go to: https://vercel.com/dashboard
2. Select your project (sengol-api or sengol frontend)
3. Settings → Environment Variables
4. Add each variable:
   - Name: `STRIPE_SECRET_KEY`
   - Value: `sk_live_...`
   - Production checkbox: ✓
   - Click "Save"
5. Repeat for `STRIPE_WEBHOOK_SECRET`

### Option B: Vercel CLI
```bash
vercel env add STRIPE_SECRET_KEY
# Paste: sk_live_...
# Choose environments: Production

vercel env add STRIPE_WEBHOOK_SECRET
# Paste: whsec_...
# Choose environments: Production
```

### Option C: `.env.local` (local only - never commit!)
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

---

## Step 3: Configure in Cloud Run (for sengol-api)

Cloud Run uses Google Secret Manager. The `cloudbuild.yaml` already references these secrets:

```yaml
--update-secrets
'DATABASE_URL=DATABASE_URL:latest,
 OPENAI_API_KEY=OPENAI_API_KEY:latest,
 JWT_SECRET=JWT_SECRET:latest,
 QDRANT_HOST=QDRANT_HOST:latest,
 QDRANT_PORT=QDRANT_PORT:latest,
 ALLOWED_ORIGINS=ALLOWED_ORIGINS:latest'
```

### Add Stripe to Cloud Run Secrets:

1. **Go to Google Cloud Console:**
   - https://console.cloud.google.com/security/secret-manager

2. **Create `STRIPE_SECRET_KEY` secret:**
   - Name: `STRIPE_SECRET_KEY`
   - Secret value: `sk_live_...` (from Stripe Dashboard)
   - Click "Create Secret"

3. **Create `STRIPE_WEBHOOK_SECRET` secret:**
   - Name: `STRIPE_WEBHOOK_SECRET`
   - Secret value: `whsec_...` (from Stripe Dashboard)
   - Click "Create Secret"

4. **Update `cloudbuild.yaml`** to include Stripe secrets:
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

5. **Give Cloud Run service account permission:**
   ```bash
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
     --role=roles/secretmanager.secretAccessor
   ```

---

## Step 4: Test Stripe Integration

### Test Webhook Endpoint:
```bash
# Using Stripe CLI (recommended)
stripe listen --forward-to https://your-domain/api/webhooks/stripe

# Using curl
curl -X POST https://your-domain/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=<timestamp>,v1=<signature>" \
  -d '{"type": "customer.subscription.created"}'
```

### Test Stripe Keys:
```javascript
// In your code, test that keys load correctly
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
stripe.customers.list().then(customers => {
  console.log('Stripe connected successfully');
});
```

---

## Step 5: Re-enable Trial System

Once Stripe secrets are configured:

1. **Restore trial system routes** from `docs/trial-system-reference/`:
   ```bash
   cp docs/trial-system-reference/stripe-webhook.ts src/routes/
   cp docs/trial-system-reference/trial-protected-routes.example.ts src/routes/
   cp docs/trial-system-reference/index.ts src/routes/
   ```

2. **Re-enable in `src/app.ts`**:
   ```typescript
   // Uncomment this line:
   import { registerAllRoutes } from './routes/index'

   // Uncomment this line in build():
   await registerAllRoutes(fastify)
   ```

3. **Deploy**:
   ```bash
   git add .
   git commit -m "feat: Re-enable trial system with Stripe integration"
   git push origin master
   ```

---

## Stripe Webhook Events

### Handled Events:
- **`customer.subscription.created`**: New trial subscription
- **`customer.subscription.updated`**: Subscription changed (trial ended, upgraded, etc.)
- **`customer.subscription.deleted`**: Subscription cancelled
- **`invoice.payment_succeeded`**: Payment successful
- **`invoice.payment_failed`**: Payment failed

### Handler Location:
- `src/routes/stripe-webhook.ts` (currently in `docs/trial-system-reference/`)

---

## Troubleshooting

### "Missing STRIPE_SECRET_KEY"
- ✓ Check Vercel/Cloud Run environment variables are set
- ✓ Verify key format starts with `sk_`
- ✓ Restart deployment after setting variables

### "Invalid stripe-signature header"
- ✓ Ensure `STRIPE_WEBHOOK_SECRET` is set correctly
- ✓ Check webhook is registered in Stripe Dashboard
- ✓ Verify URL matches: `https://your-domain/api/webhooks/stripe`

### "Webhook not received"
- ✓ Test with Stripe CLI: `stripe listen --forward-to <your-url>`
- ✓ Check Stripe Dashboard → Developers → Webhooks for event log
- ✓ Ensure firewall allows traffic on port 443

### Database not updating after webhook
- ✓ Check `DATABASE_URL` is set and accessible
- ✓ Verify Prisma schema includes `ToolSubscription` model
- ✓ Check Cloud Run logs: `gcloud run logs read sengol-api --limit 50`

---

## Environment Variable Checklist

- [ ] Stripe account created (stripe.com)
- [ ] Stripe Secret Key copied (starts with `sk_`)
- [ ] Stripe Webhook Secret created (starts with `whsec_`)
- [ ] `STRIPE_SECRET_KEY` set in Vercel/Cloud Run
- [ ] `STRIPE_WEBHOOK_SECRET` set in Vercel/Cloud Run
- [ ] Webhook endpoint registered in Stripe Dashboard
- [ ] Domain verified in Stripe webhook settings
- [ ] Trial system code restored from archive
- [ ] `src/app.ts` updated to enable trial routes
- [ ] Code deployed and reachable at `<domain>/api/webhooks/stripe`
- [ ] Test webhook received successfully

---

## Next Steps

1. **Get Stripe credentials** from Dashboard
2. **Configure environment variables** in Vercel/Cloud Run
3. **Register webhook endpoint** in Stripe
4. **Restore trial system code** from `docs/trial-system-reference/`
5. **Deploy** to production
6. **Test webhook** with Stripe CLI or Dashboard
7. **Monitor logs** for any errors

---

## Support Resources

- **Stripe API Docs**: https://stripe.com/docs/api
- **Stripe Webhooks**: https://stripe.com/docs/webhooks
- **Vercel Secrets**: https://vercel.com/docs/projects/environment-variables
- **Cloud Run Secrets**: https://cloud.google.com/run/docs/configuring/secrets
- **Stripe CLI**: https://stripe.com/docs/stripe-cli

---

**Last Updated**: November 2025
**Status**: Ready for Stripe integration
