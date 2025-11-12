# Vercel Environment Variables Setup Guide

## Quick Fix for "Missing required environment variable" Error

If you're seeing this error in Vercel logs:
```
Missing required environment variable: JWT_SECRET
```

Follow these steps to fix it:

## 📋 Step-by-Step Setup

### 1. Access Vercel Dashboard

Go to: `https://vercel.com/[your-team]/sengol-api/settings/environment-variables`

### 2. Add Required Variables

Click "Add New" and enter each of these:

#### Database
```
Name: DATABASE_URL
Value: postgresql://user:password@host:5432/sengol
Environments: ☑ Production ☑ Preview ☑ Development
```

#### Authentication
```
Name: JWT_SECRET
Value: [Generate a strong random string - at least 32 characters]
Environments: ☑ Production ☑ Preview ☑ Development

# Generate a secure JWT secret with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### OpenAI
```
Name: OPENAI_API_KEY
Value: sk-your-openai-api-key-here
Environments: ☑ Production ☑ Preview ☑ Development
```

#### d-vecDB
```
Name: DVECDB_HOST
Value: 99.213.88.59
Environments: ☑ Production ☑ Preview ☑ Development
```

#### Python Backend
```
Name: PYTHON_BACKEND_URL
Value: https://your-python-backend-url.com
Environments: ☑ Production ☑ Preview ☑ Development
```

#### CORS
```
Name: ALLOWED_ORIGINS
Value: https://your-frontend-domain.com,https://www.your-frontend-domain.com
Environments: ☑ Production ☑ Preview ☑ Development
```

### 3. Add Optional Performance Variables

These improve performance but aren't required:

```
# d-vecDB Configuration
DVECDB_PORT=40560
DVECDB_COLLECTION=incidents
DVECDB_TIMEOUT=30000
DVECDB_MAX_RETRIES=3

# OpenAI Configuration
OPENAI_TIMEOUT=60000
OPENAI_MAX_RETRIES=3

# Caching (40-60% cost reduction)
CACHE_ENABLED=true
CACHE_TTL=3600
CACHE_MAX_SIZE=1000

# Resilience
REQUEST_TIMEOUT=120000
SHUTDOWN_TIMEOUT=30000

# Logging
LOG_LEVEL=info
```

### 4. Redeploy

After adding variables:
1. Go to Deployments tab
2. Click "..." on the latest deployment
3. Click "Redeploy"

Or trigger a new deployment:
```bash
git commit --allow-empty -m "trigger: redeploy with env vars"
git push origin master
```

## 🔐 Generating Secure Secrets

### JWT_SECRET
```bash
# Generate a secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use OpenSSL
openssl rand -hex 32
```

### Best Practices
- Use different secrets for production, preview, and development
- Never commit secrets to git
- Rotate secrets regularly
- Use Vercel's secret management for sensitive values

## ✅ Verify Setup

After deploying, check if everything works:

### 1. Basic Health Check
```bash
curl https://your-app.vercel.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 123,
  "version": "v1"
}
```

### 2. Detailed Health Check
```bash
curl https://your-app.vercel.app/health/detailed
```

Should show all services healthy:
```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok" },
    "dvecdb": { "status": "ok" },
    "openai": { "status": "ok" }
  }
}
```

### 3. Check Logs
```bash
vercel logs --follow
```

Look for:
- ✅ "Sengol API running at..."
- ✅ No error messages about missing environment variables
- ❌ Any errors or warnings

## 🚨 Troubleshooting

### Error: "Missing required environment variable"
**Solution:** Add the missing variable in Vercel dashboard and redeploy

### Error: "Database connection failed"
**Solutions:**
- Check `DATABASE_URL` is correct
- Verify database is accessible from Vercel's IP addresses
- Check database firewall rules

### Error: "d-vecDB is not reachable"
**Solutions:**
- Verify `DVECDB_HOST` is correct (99.213.88.59)
- Check `DVECDB_PORT` if set (default: 40560)
- Ensure d-vecDB server is running
- Check firewall allows Vercel's IP ranges

### Error: "OpenAI API failed"
**Solutions:**
- Verify `OPENAI_API_KEY` is valid (starts with `sk-`)
- Check OpenAI account has available credits
- Verify API key hasn't been revoked

### Error: "CORS error" from frontend
**Solutions:**
- Add your frontend domain to `ALLOWED_ORIGINS`
- Format: `https://app.domain.com,https://www.domain.com`
- No trailing slashes
- Include both www and non-www versions

## 📱 Using Vercel CLI

### Install CLI
```bash
npm i -g vercel
```

### Login
```bash
vercel login
```

### Link Project
```bash
vercel link
```

### Set Variables via CLI
```bash
# Add a variable
vercel env add JWT_SECRET production

# List all variables
vercel env ls

# Pull variables to local .env
vercel env pull .env.local

# Deploy with specific env
vercel --prod
```

## 🔄 Environment-Specific Variables

### Production
- Use production database
- Use production OpenAI API key with higher rate limits
- Enable caching
- Set LOG_LEVEL=info or warn

### Preview (PR deployments)
- Can use same as production or separate preview database
- Use same API keys (with lower quotas)
- Enable caching
- Set LOG_LEVEL=debug for troubleshooting

### Development
- Use development database
- Can use same API keys
- Disable caching for development
- Set LOG_LEVEL=debug

## 📊 Environment Variable Checklist

Before deploying, verify you have:

- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET` - Random 32+ character string
- [ ] `OPENAI_API_KEY` - OpenAI API key (sk-...)
- [ ] `DVECDB_HOST` - d-vecDB server host
- [ ] `PYTHON_BACKEND_URL` - Python backend URL
- [ ] `ALLOWED_ORIGINS` - Frontend domains (comma-separated)
- [ ] `DVECDB_PORT` (optional) - Default: 40560
- [ ] `CACHE_ENABLED` (optional) - Default: true
- [ ] All variables set for correct environments

## 🎯 Quick Commands

```bash
# Check current deployment
vercel inspect

# View logs
vercel logs

# Redeploy latest
vercel --prod

# Check environment variables
vercel env ls

# Remove a variable
vercel env rm JWT_SECRET production
```

## 📞 Support

If you're still having issues:

1. Check Vercel deployment logs: `vercel logs`
2. Verify all required variables are set: `vercel env ls`
3. Test health endpoint: `curl https://your-app.vercel.app/health/detailed`
4. Check this guide: [Vercel Environment Variables Docs](https://vercel.com/docs/concepts/projects/environment-variables)

## 🔒 Security Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use different secrets per environment**
3. **Rotate secrets regularly** - Especially JWT_SECRET
4. **Use Vercel Secrets** for extra sensitive values:
   ```bash
   vercel secrets add my-secret-name secret-value
   # Then reference in env vars as @my-secret-name
   ```
5. **Limit ALLOWED_ORIGINS** to only your domains
6. **Review access logs** regularly
7. **Enable Vercel's security features** (CSRF protection, rate limiting)

---

**Last Updated:** 2025-01-15
**Vercel Project:** sengol-api
**Repository:** https://github.com/Infinidatum-LLC/sengol-api
