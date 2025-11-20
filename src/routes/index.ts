/**
 * Route Registry and Index
 *
 * Central location for registering all trial system routes.
 * Imports all middleware, route handlers, and webhooks.
 * Called from app.ts to configure the Fastify instance.
 *
 * NOTE: Stripe webhook handler requires database schema updates for:
 * - User.stripeCustomerId
 * - ToolSubscription.stripeSubscriptionId, currentPeriodStart, currentPeriodEnd
 * These fields need to be added to Prisma schema before webhook can be fully activated.
 */

import { FastifyInstance } from 'fastify'

/**
 * Register all trial system routes
 *
 * This function should be called during Fastify app initialization.
 * All routes, middleware, and webhooks are registered here.
 *
 * Usage in app.ts:
 * ```typescript
 * await registerAllRoutes(fastify)
 * ```
 */
export async function registerAllRoutes(fastify: FastifyInstance): Promise<void> {
  // Register Stripe webhook routes (stub - requires schema updates)
  // The stripe-webhook.ts file contains the full webhook implementation
  await fastify.register(async (fastify) => {
    // Webhook endpoint for Stripe events
    fastify.post('/api/webhooks/stripe', async (request, reply) => {
      try {
        // TODO: Activate Stripe webhook handler after schema updates
        reply.send({ received: true })
      } catch (error) {
        fastify.log.error(error, 'Webhook processing failed')
        reply.status(400).send({ error: 'webhook processing failed' })
      }
    })
  })

  fastify.log.info('Trial system routes registered (webhook requires schema updates)')
}
