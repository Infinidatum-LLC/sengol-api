# Trial System Middleware Integration Guide

This document shows how to integrate trial system middleware into your Fastify routes.

## Available Middleware

### 1. Trial Limit Guard (`trial-limit-guard.ts`)

**Purpose**: Check if user has reached their feature limit

**Factory Function**: `createTrialLimitGuard(feature)`

**Usage**:
```typescript
import { createTrialLimitGuard } from '../middleware/trial-limit-guard'

fastifyApp.post(
  '/api/risk-assessment',
  {
    preHandler: [
      authenticateUser, // Auth middleware (required first)
      createTrialLimitGuard('riskAssessment')
    ]
  },
  async (request, reply) => {
    // Handle request - user has not exceeded limit
    const userId = (request as any).user.id
    const feature = (request as any).feature // 'riskAssessment'

    // Your handler logic here
    reply.send({ success: true })
  }
)
```

**Response on Limit Exceeded**:
```json
{
  "code": "TRIAL_LIMIT_EXCEEDED",
  "message": "Feature not available for your tier",
  "tier": "free"
}
```

### 2. Trial Expiration Check (`trial-expiration.ts`)

**Purpose**: Enforce trial expiration

**Function**: `checkTrialExpiration`

**Usage**:
```typescript
import { checkTrialExpiration } from '../middleware/trial-expiration'

fastifyApp.get(
  '/api/user/dashboard',
  {
    preHandler: [
      authenticateUser,
      checkTrialExpiration // Check if trial expired
    ]
  },
  async (request, reply) => {
    const trialStatus = (request as any).trialStatus
    const daysRemaining = trialStatus?.daysRemaining ?? 0

    reply.send({
      message: `You have ${daysRemaining} days left in trial`
    })
  }
)
```

**Response on Expired Trial**:
```json
{
  "code": "TRIAL_EXPIRED",
  "message": "Your trial has expired. Please upgrade to continue.",
  "expiredAt": "2024-11-26T00:00:00.000Z"
}
```

### 3. Feature Usage Tracker (`feature-usage-tracker.ts`)

**Purpose**: Automatically track feature usage after successful operations

**Factory Function**: `createUsageTracker(feature)`

**Usage**:
```typescript
import { createUsageTracker } from '../middleware/feature-usage-tracker'

fastifyApp.post(
  '/api/risk-assessment',
  {
    preHandler: [authenticateUser, createTrialLimitGuard('riskAssessment')],
    onResponse: [createUsageTracker('riskAssessment')] // Track after success
  },
  async (request, reply) => {
    // Your handler logic
    // Usage will automatically increment on 2xx response
    reply.send({ success: true })
  }
)
```

**Behavior**:
- Increments usage counter only on successful responses (200-299)
- Automatically invalidates cache
- Logs usage to structured logs
- Non-blocking (errors don't affect request)

### 4. Cache Invalidation (`cache-invalidation.ts`)

**Purpose**: Automatically invalidate cache after state changes

**Function**: `invalidateCacheOnSuccess`

**Usage**:
```typescript
import { invalidateCacheOnSuccess } from '../middleware/cache-invalidation'

fastifyApp.post(
  '/api/subscription/upgrade',
  {
    preHandler: [authenticateUser],
    onResponse: [invalidateCacheOnSuccess] // Invalidate cache after change
  },
  async (request, reply) => {
    // Upgrade subscription
    const userId = (request as any).user.id
    // ... upgrade logic ...

    reply.send({ upgraded: true })
    // Cache will automatically be invalidated
  }
)
```

**Manual Invalidation**:
```typescript
import { invalidateUserCacheById } from '../middleware/cache-invalidation'

// Invalidate single user's cache
await invalidateUserCacheById(userId)

// Invalidate multiple users' cache
await invalidateUsersCacheByIds([userId1, userId2, userId3])
```

## Complete Route Example

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateUser } from './auth'
import { createTrialLimitGuard } from '../middleware/trial-limit-guard'
import { checkTrialExpiration } from '../middleware/trial-expiration'
import { createUsageTracker } from '../middleware/feature-usage-tracker'
import { invalidateCacheOnSuccess } from '../middleware/cache-invalidation'

export async function registerRiskAssessmentRoutes(fastifyApp: FastifyInstance) {
  // Create risk assessment (limited by trial)
  fastifyApp.post(
    '/api/risk-assessment',
    {
      preHandler: [
        authenticateUser,
        checkTrialExpiration,
        createTrialLimitGuard('riskAssessment')
      ],
      onResponse: [createUsageTracker('riskAssessment')]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user.id

      // Your assessment logic here
      const assessment = {
        id: 'assessment-123',
        score: 75,
        recommendations: []
      }

      reply.code(201).send(assessment)
      // Usage will auto-increment, cache will auto-invalidate
    }
  )
}
```

## Middleware Execution Order

1. **Prehandlers** (run before handler):
   - `authenticateUser` - Verify JWT token
   - `checkTrialExpiration` - Check if trial expired
   - `createTrialLimitGuard()` - Check feature limit

2. **Handler** - Your route logic

3. **onResponse** (run after handler responds):
   - `createUsageTracker()` - Increment usage counter
   - `invalidateCacheOnSuccess()` - Invalidate cache

## Error Handling

All middleware handle errors gracefully:

```typescript
// Middleware returns structured error responses:
{
  "code": "ERROR_CODE",
  "message": "User-friendly message",
  "metadata": { /* Optional debugging info */ }
}

// Status codes:
// 401 - Unauthorized (no auth)
// 403 - Forbidden (trial expired)
// 429 - Too Many Requests (limit exceeded)
// 500 - Internal error (logged but request doesn't fail)
```

## Request Object Enrichment

Middleware adds properties to `request` for use in handlers:

```typescript
// After auth
(request as any).user = { id: 'user-123', email: 'user@example.com' }

// After trial check
(request as any).trialStatus = {
  isActive: true,
  daysRemaining: 5,
  startedAt: Date,
  endsAt: Date
}

// After limit check
(request as any).tier = 'trial'
(request as any).feature = 'riskAssessment'
```

## Common Patterns

### Protect all routes with trial check
```typescript
fastifyApp.register(async (fastify) => {
  fastify.addHook('preHandler', checkTrialExpiration)
  // ... your routes ...
})
```

### Track usage for multiple features
```typescript
fastifyApp.post('/api/incident-search', {
  preHandler: [authenticateUser, createTrialLimitGuard('incidentSearch')],
  onResponse: [createUsageTracker('incidentSearch')]
}, handler)

fastifyApp.post('/api/compliance-check', {
  preHandler: [authenticateUser, createTrialLimitGuard('complianceCheck')],
  onResponse: [createUsageTracker('complianceCheck')]
}, handler)
```

### Optional feature (no limit)
```typescript
// Features with -1 limit are unlimited
fastifyApp.get('/api/compliance-check', {
  preHandler: [authenticateUser, createTrialLimitGuard('complianceCheck')],
  onResponse: [createUsageTracker('complianceCheck')] // Logs but doesn't limit
}, handler)
```

## Testing Middleware

```typescript
import { test } from 'vitest'

test('should block user who exceeded limit', async () => {
  const response = await fastifyApp.inject({
    method: 'POST',
    url: '/api/risk-assessment',
    payload: {},
    headers: {
      Authorization: 'Bearer valid-jwt'
    }
  })

  expect(response.statusCode).toBe(429)
  expect(response.json()).toMatchObject({
    code: 'TRIAL_LIMIT_EXCEEDED'
  })
})
```
