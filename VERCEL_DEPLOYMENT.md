# Vercel Deployment Guide for sengol-api

## Overview

The `sengol-api` middleware is now configured for Vercel serverless deployment using Fastify adapted for serverless functions.

## Architecture

```
Vercel Serverless Function
    ↓
api/index.ts (Entry Point)
    ↓
src/app.ts (Fastify App)
    ↓
Controllers & Services
    ↓
PostgreSQL + d-vecDB
```

## Deployment Steps

### 1. Connect Repository to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New"** → **"Project"**
3. Import **rdmurugan/sengol-api** from GitHub
4. Vercel will auto-detect the configuration from `vercel.json`

### 2. Configure Environment Variables

In Vercel project settings, add these environment variables:

**Database**:
```
DATABASE_URL=postgresql://...
```

**d-vecDB**:
```
DVECDB_HOST=99.213.88.59
DVECDB_PORT=40560
DVECDB_COLLECTION=incidents
```

**OpenAI**:
```
OPENAI_API_KEY=sk-proj-...
```

**API Configuration**:
```
PORT=4000
NODE_ENV=production
ALLOWED_ORIGINS=https://sengol.ai,https://www.sengol.ai
```

### 3. Deploy

Click **"Deploy"** in Vercel dashboard.

Vercel will:
- Install dependencies
- Build TypeScript (`npm run build`)
- Create serverless function from `api/index.ts`
- Deploy to `https://sengol-api-*.vercel.app`

### 4. Get Your API URL

After deployment, Vercel will provide a URL like:
```
https://sengol-api-production.vercel.app
```

Copy this URL for the next step.

### 5. Update Frontend Environment Variable

In your **sengol** (frontend) Vercel project:

1. Go to **Settings** → **Environment Variables**
2. Add/Update:
   ```
   NEXT_PUBLIC_API_URL=https://sengol-api-production.vercel.app
   ```
3. Redeploy frontend to pick up new API URL

## Testing the Deployment

### Health Check

```bash
curl https://your-api-url.vercel.app/health
```

Expected response:
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "dvecdb": "ok"
  }
}
```

### Question Generation

```bash
curl -X POST https://your-api-url.vercel.app/api/review/ASSESSMENT_ID/generate-questions \
  -H "Content-Type: application/json" \
  -d '{
    "systemDescription": "Test system",
    "selectedDomains": ["ai"],
    "jurisdictions": [],
    "industry": "Technology",
    "selectedTech": [],
    "customTech": []
  }'
```

## Serverless Optimization

The `api/index.ts` entry point includes:

1. **Warm Start Optimization**: Reuses Fastify app instance across invocations
2. **Lazy Initialization**: Only initializes on first request
3. **Request Forwarding**: Emits requests to Fastify's internal server

```typescript
let app: Awaited<ReturnType<typeof build>> | null = null

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Reuse app instance (warm starts)
  if (!app) {
    app = await build()
    await app.ready()
  }

  // Inject Fastify request/response
  app.server.emit('request', req, res)
}
```

## Monitoring

### Vercel Dashboard

- **Functions**: Monitor serverless function performance
- **Logs**: Real-time logs for debugging
- **Analytics**: Request metrics and performance

### Health Endpoint

Set up uptime monitoring with services like:
- UptimeRobot
- Pingdom
- Better Stack

Point monitor to: `https://your-api-url.vercel.app/health`

## Troubleshooting

### Cold Starts

- **Issue**: First request after idle period is slow (cold start)
- **Solution**: Vercel Pro plan has lower cold start times
- **Workaround**: Use a ping service to keep function warm

### Database Connection Limits

- **Issue**: Serverless functions can exhaust database connections
- **Solution**: Use Prisma Data Proxy or Neon serverless driver
- **Current**: Neon automatically handles connection pooling

### CORS Errors

- **Issue**: Frontend can't connect to API
- **Solution**: Ensure `ALLOWED_ORIGINS` includes your frontend URL
- **Check**: `src/config/config.ts` for CORS configuration

### Environment Variables

- **Issue**: Variables not loading
- **Solution**:
  1. Verify variables are set in Vercel dashboard
  2. Redeploy after adding variables
  3. Check logs for missing variable errors

## Cost Considerations

**Vercel Free Tier**:
- 100GB bandwidth/month
- 100GB-hours serverless function execution
- 12 serverless functions

**Typical Usage**:
- ~500ms per question generation request
- 1000 requests/month = ~500s = ~$0.05
- Health checks: negligible cost

**Recommendation**: Free tier should be sufficient for development and early production.

## Alternative: VPS Deployment

If you prefer traditional VPS hosting, see `DEPLOY.md` for Railway/VPS instructions.

The Vercel configuration doesn't interfere with VPS deployment options.

## Next Steps

1. Deploy to Vercel
2. Test health endpoint
3. Test question generation endpoint
4. Update frontend `NEXT_PUBLIC_API_URL`
5. Deploy frontend
6. Test end-to-end flow

## Support

For issues:
- Check Vercel deployment logs
- Review `src/app.ts` for Fastify configuration
- Test locally with `npm run dev` before deploying
