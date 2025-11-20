/**
 * Route Registry and Index
 *
 * Central location for registering all trial system routes.
 * Imports all middleware, route handlers, and webhooks.
 * Called from app.ts to configure the Fastify instance.
 */

import { FastifyInstance } from 'fastify'
import { logger } from '../lib/logger'

// Import middleware
import { authenticateUser } from './auth'
import { checkTrialExpiration } from '../middleware/trial-expiration'
import { createTrialLimitGuard } from '../middleware/trial-limit-guard'
import { createUsageTracker } from '../middleware/feature-usage-tracker'
import { invalidateCacheOnSuccess } from '../middleware/cache-invalidation'

// Import route handlers
import { handleStripeWebhook, registerStripeWebhookRoutes } from './stripe-webhook'
import { registerTrialProtectedRoutes } from './trial-protected-routes.example'

/**
 * Register all trial system routes
 *
 * This function should be called during Fastify app initialization.
 * All routes, middleware, and webhooks are registered here.
 *
 * Usage in app.ts:
 * ```typescript
 * await registerAllRoutes(fastifyApp)
 * ```
 */
export async function registerAllRoutes(fastifyApp: FastifyInstance) {
  logger.info('Registering trial system routes...')

  try {
    // Register Stripe webhook routes (no auth required)
    await registerStripeWebhookRoutes(fastifyApp)

    // Register trial-protected example routes (with auth + trial checks)
    await registerTrialProtectedRoutes(fastifyApp)

    // TODO: Register actual production routes here
    // Replace trial-protected-routes.example.ts with actual implementations:
    // - registerRiskAssessmentRoutes()
    // - registerComplianceCheckRoutes()
    // - registerIncidentSearchRoutes()
    // - registerReportExportRoutes()
    // etc.

    logger.info('All trial system routes registered successfully')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to register routes: ${message}`,
      error instanceof Error ? error : undefined,
      { context: 'route-registration' }
    )
    throw error
  }
}

/**
 * Export commonly used middleware for route handlers
 *
 * These are re-exported for convenience in route files.
 * Usage:
 * ```typescript
 * import { authenticateUser, createTrialLimitGuard } from './index'
 *
 * fastifyApp.post('/api/endpoint', {
 *   preHandler: [
 *     authenticateUser,
 *     createTrialLimitGuard('featureName')
 *   ]
 * }, handler)
 * ```
 */
export {
  authenticateUser,
  checkTrialExpiration,
  createTrialLimitGuard,
  createUsageTracker,
  invalidateCacheOnSuccess
}

/**
 * Route Registration Patterns
 *
 * Use these patterns when creating new trial-protected routes:
 *
 * Pattern 1: Limited Feature (e.g., 5/month for trial)
 * ========================================================
 * fastifyApp.post('/api/feature-name', {
 *   preHandler: [
 *     authenticateUser,
 *     checkTrialExpiration,
 *     createTrialLimitGuard('featureName')
 *   ],
 *   onResponse: [createUsageTracker('featureName')]
 * }, handler)
 *
 * Pattern 2: Unlimited Feature (but still tracked)
 * ================================================
 * fastifyApp.post('/api/feature-name', {
 *   preHandler: [
 *     authenticateUser,
 *     checkTrialExpiration,
 *     createTrialLimitGuard('featureName') // Limit is -1
 *   ],
 *   onResponse: [createUsageTracker('featureName')]
 * }, handler)
 *
 * Pattern 3: Disabled for Trial (0 limit)
 * =======================================
 * fastifyApp.post('/api/feature-name', {
 *   preHandler: [
 *     authenticateUser,
 *     checkTrialExpiration,
 *     createTrialLimitGuard('featureName') // Limit is 0
 *   ]
 * }, handler)
 * // Returns 429 before handler runs
 *
 * Pattern 4: Public Endpoint (no auth)
 * ===================================
 * fastifyApp.post('/api/feature-name', handler)
 * // No middleware, public access
 */

/**
 * Middleware Execution Order for Protected Routes
 *
 * 1. authenticateUser - Verify JWT token, extract user ID
 *    Sets: (request).user = { id, email }
 *    Returns 401 if missing/invalid token
 *
 * 2. checkTrialExpiration - Check if trial period ended
 *    Sets: (request).trialStatus = { isActive, daysRemaining, ... }
 *    Returns 403 if trial expired
 *
 * 3. createTrialLimitGuard(feature) - Check feature limit
 *    Sets: (request).tier, (request).feature
 *    Returns 429 if limit exceeded
 *
 * 4. Handler - Your route logic runs here
 *    Access user via: (request).user.id
 *    Access tier via: (request).tier
 *    Access feature via: (request).feature
 *
 * 5. createUsageTracker(feature) - Track usage on success
 *    Only increments on 2xx responses
 *    Auto-invalidates cache
 *
 * 6. invalidateCacheOnSuccess - Cache invalidation
 *    Only on 2xx responses
 *    Non-blocking (errors don't fail request)
 */

/**
 * Error Response Formats
 *
 * Authentication Error (401):
 * {
 *   "code": "UNAUTHORIZED",
 *   "message": "Authentication required. Please provide a valid JWT token.",
 *   "statusCode": 401
 * }
 *
 * Trial Expired Error (403):
 * {
 *   "code": "TRIAL_EXPIRED",
 *   "message": "Your trial has expired. Please upgrade to continue.",
 *   "expiredAt": "2024-11-26T00:00:00.000Z",
 *   "statusCode": 403
 * }
 *
 * Trial Limit Exceeded Error (429):
 * {
 *   "code": "TRIAL_LIMIT_EXCEEDED",
 *   "message": "Feature not available for your tier",
 *   "tier": "free",
 *   "statusCode": 429
 * }
 *
 * Stripe Webhook Errors (400):
 * {
 *   "code": "INVALID_SIGNATURE",
 *   "message": "Signature verification failed",
 *   "statusCode": 400
 * }
 */
