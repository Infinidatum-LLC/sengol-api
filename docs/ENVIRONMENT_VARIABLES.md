# Environment Variables Configuration

**Last Updated**: December 2024  
**Status**: ✅ Required for API Proxy Migration

---

## Required Environment Variables

### Backend API Configuration

These variables are **required** for the API proxy endpoints to function correctly.

#### 1. `NEXT_PUBLIC_API_URL`

**Purpose**: Backend API base URL for proxying requests

**Value**: 
```
https://api.sengol.ai
```

**Environments**: Production, Preview, Development

**Note**: 
- This is a **public** variable (starts with `NEXT_PUBLIC_`)
- It will be accessible in client-side code
- Defaults to `https://api.sengol.ai` if not set

**Example**:
```bash
NEXT_PUBLIC_API_URL=https://api.sengol.ai
```

#### 2. `API_AUTH_TOKEN`

**Purpose**: Authentication token for backend API requests

**Value**: 
```
[Your backend API authentication token]
```

**Environments**: Production, Preview, Development (Server-side only)

**Note**: 
- This is a **private** variable (server-side only)
- Used in `Authorization: Bearer` header for all backend requests
- Should be kept secret and not exposed to client-side code

**Example**:
```bash
API_AUTH_TOKEN=your-secret-api-token-here
```

---

## Setting Up Environment Variables

### Local Development (.env.local)

Create a `.env.local` file in the project root:

```bash
# Backend API Configuration
NEXT_PUBLIC_API_URL=https://api.sengol.ai
API_AUTH_TOKEN=your-development-api-token
```

### Vercel Production

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

#### Production Environment
```
NEXT_PUBLIC_API_URL = https://api.sengol.ai
API_AUTH_TOKEN = [Your production API token]
```

#### Preview Environment
```
NEXT_PUBLIC_API_URL = https://api.sengol.ai
API_AUTH_TOKEN = [Your preview/staging API token]
```

#### Development Environment
```
NEXT_PUBLIC_API_URL = https://api.sengol.ai
API_AUTH_TOKEN = [Your development API token]
```

---

## Verification

### Check Environment Variables are Set

1. **Local Development**:
   ```bash
   # Check if variables are loaded
   node -e "console.log(process.env.NEXT_PUBLIC_API_URL)"
   node -e "console.log(process.env.API_AUTH_TOKEN ? 'Set' : 'Not set')"
   ```

2. **Vercel**:
   - Check in Vercel dashboard under Settings → Environment Variables
   - Variables should be visible for each environment (Production, Preview, Development)

### Test API Proxy

Once variables are set, test a proxy endpoint:

```bash
# Test assessment creation (requires authentication)
curl -X POST http://localhost:3000/api/review/start \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Assessment", "projectId": "test-id"}'
```

Check server logs for:
- `[PROXY] Forwarding request to backend` - Confirms proxy is working
- `[PROXY] Successfully processed request from backend` - Confirms backend responded

---

## Troubleshooting

### Issue: "Backend API URL not configured"

**Solution**: Ensure `NEXT_PUBLIC_API_URL` is set in your environment variables

### Issue: "Unauthorized" or 401 errors from backend

**Solution**: 
1. Verify `API_AUTH_TOKEN` is set correctly
2. Check that the token is valid and has proper permissions
3. Verify the backend API is expecting the token in `Authorization: Bearer` header

### Issue: "Failed to fetch" or CORS errors

**Solution**: 
1. Ensure `NEXT_PUBLIC_API_URL` points to the correct backend URL
2. Check that backend API allows requests from your frontend domain
3. Verify backend CORS configuration

### Issue: Environment variables not loading

**Solution**:
1. Restart your development server after adding `.env.local`
2. Ensure variable names match exactly (case-sensitive)
3. Check that `.env.local` is in the project root (not in a subdirectory)
4. For Vercel: Redeploy after adding environment variables

---

## Security Notes

1. **Never commit `.env.local`** to version control
2. **Never expose `API_AUTH_TOKEN`** in client-side code
3. **Use different tokens** for development, preview, and production
4. **Rotate tokens regularly** for security
5. **Monitor API usage** to detect unauthorized access

---

## Related Documentation

- [API Proxy Migration Complete](./API_PROXY_MIGRATION_COMPLETE.md)
- [Backend API Specification](./BACKEND_API_SPECIFICATION.md)

