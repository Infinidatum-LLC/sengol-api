# Login and API Route Fixes Summary

## Issues Identified and Fixed

### 1. ✅ Route Path Mismatch (CRITICAL)

**Problem**: Backend routes were registered without the `/api` prefix, but frontend was calling endpoints with `/api` prefix.

**Example**:
- Backend had: `/auth/login`
- Frontend called: `/api/auth/login`
- Result: 404 Not Found errors

**Fixed Routes**:
- ✅ `/auth/login` → `/api/auth/login`
- ✅ `/auth/register` → `/api/auth/register`
- ✅ `/auth/refresh` → `/api/auth/refresh`
- ✅ `/auth/logout` → `/api/auth/logout`
- ✅ `/auth/user/:userId` → `/api/auth/user/:userId`
- ✅ `/auth/subscription/:userId` → `/api/auth/subscription/:userId`
- ✅ `/auth/check-email` → `/api/auth/check-email`
- ✅ `/auth/verify-email` → `/api/auth/verify-email`
- ✅ `/auth/forgot-password` → `/api/auth/forgot-password`
- ✅ `/auth/reset-password` → `/api/auth/reset-password`
- ✅ `/user/profile` → `/api/user/profile`
- ✅ `/user/sessions` → `/api/user/sessions`
- ✅ `/projects` → `/api/projects`
- ✅ `/assessments/:id` → `/api/assessments/:id`
- ✅ `/calculations` → `/api/calculations`
- ✅ `/compliance/alerts` → `/api/compliance/alerts`
- ✅ `/auth/totp/*` → `/api/auth/totp/*`

**Files Modified**:
- `src/routes/auth.routes.ts`
- `src/routes/user.routes.ts`
- `src/routes/projects.routes.ts`
- `src/routes/assessments.routes.ts`
- `src/routes/calculations.routes.ts`
- `src/routes/alerts.routes.ts`
- `src/routes/totp.routes.ts`

### 2. ✅ Missing Database Fields in Login Query

**Problem**: Login query only selected `id`, `email`, and `password`, but the response tried to use `name`, `emailVerified`, and `role` which weren't in the query result.

**Fix**: Updated the login query to include all required fields:
```sql
-- Before
SELECT "id", "email", "password" FROM "User" WHERE "email" = $1

-- After
SELECT "id", "email", "password", "name", "emailVerified", "role" FROM "User" WHERE "email" = $1
```

**File Modified**: `src/routes/auth.routes.ts` (line 83)

## Environment Variables Required

### Frontend (sengol)
1. **NEXT_PUBLIC_API_URL** - Backend API URL (default: `http://localhost:4000` for local dev)
2. **API_AUTH_TOKEN** - Backend API authentication token (server-side only)
3. **NEXTAUTH_SECRET** - NextAuth secret for session encryption
4. **NEXTAUTH_URL** - NextAuth callback URL (production only)

### Backend (sengol-api)
1. **DATABASE_URL** - PostgreSQL connection string
2. **JWT_SECRET** - JWT token signing secret
3. **ALLOWED_ORIGINS** - CORS allowed origins (comma-separated)

## Testing Checklist

### 1. Verify Backend Routes
```bash
# Test login endpoint
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Should return 200 with user data and tokens
```

### 2. Verify Frontend Connection
1. Ensure `NEXT_PUBLIC_API_URL` is set correctly
2. Check browser console for network errors
3. Verify API calls are going to correct endpoint

### 3. Test Login Flow
1. Navigate to `/auth/login`
2. Enter valid credentials
3. Should redirect to `/dashboard` on success
4. Check browser console for any errors

## Next Steps

1. **Restart Backend Server**: After route changes, restart the backend API server
2. **Verify Environment Variables**: Ensure all required env vars are set
3. **Test End-to-End**: Test login, registration, and other auth flows
4. **Check Other Endpoints**: Verify other API endpoints work correctly

## Notes

- Health check routes remain at root level (`/health`, `/health/detailed`) - these don't need `/api` prefix
- All other API routes now consistently use `/api` prefix
- Frontend auth-client.ts already configured to use `/api/auth/*` endpoints

