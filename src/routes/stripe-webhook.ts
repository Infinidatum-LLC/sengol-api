/**
 * Stripe Webhook Handler for Trial System
 *
 * Processes Stripe events for subscription and payment management.
 * Handles: subscription created/updated/deleted, payment success/failure
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import Stripe from 'stripe'
import { randomUUID } from 'crypto'
import { query } from '../lib/db'
import { logger } from '../lib/logger'
import { invalidateUserCacheById } from '../middleware/cache-invalidation'
import { StripeWebhookError } from '../lib/errors'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-01-27.acme' as any,
})

/**
 * Stripe webhook endpoint
 * POST /api/webhooks/stripe
 *
 * Verifies signature and processes events
 */
export async function handleStripeWebhook(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Get Stripe signature from headers
    const signature = request.headers['stripe-signature'] as string
    if (!signature) {
      logger.warn('Stripe webhook missing signature header')
      reply.code(400).send({
        code: 'INVALID_SIGNATURE',
        message: 'Missing stripe-signature header',
      })
      return
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`Stripe signature verification failed: ${message}`)
      reply.code(400).send({
        code: 'INVALID_SIGNATURE',
        message: 'Signature verification failed',
      })
      return
    }

    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        logger.info(`Unhandled Stripe event: ${event.type}`)
    }

    logger.logStripeWebhook(event.id, event.type, '', 'processed')
    reply.code(200).send({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Stripe webhook processing failed: ${message}`,
      error instanceof Error ? error : undefined,
      { eventType: (request.body as any)?.type }
    )
    reply.code(500).send({
      code: 'WEBHOOK_ERROR',
      message: 'Webhook processing failed',
    })
  }
}

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string
    const subscriptionId = subscription.id
    const planId = subscription.items.data[0]?.price?.id || subscription.items.data[0]?.price?.nickname || 'unknown'
    const status = subscription.status
    // Stripe subscription uses snake_case properties
    const subData = subscription as any
    const currentPeriodStart = new Date(subData.current_period_start * 1000)
    const currentPeriodEnd = new Date(subData.current_period_end * 1000)

    // Find user by Stripe customer ID
    const userResult = await query(
      `SELECT "id" FROM "User" WHERE "stripeCustomerId" = $1 LIMIT 1`,
      [customerId]
    )

    if (userResult.rows.length === 0) {
      logger.warn(`User not found for Stripe customer: ${customerId}`)
      return
    }

    const userId = userResult.rows[0].id

    // Check if subscription already exists
    const existingResult = await query(
      `SELECT "id" FROM "ToolSubscription" WHERE "stripeSubscriptionId" = $1 LIMIT 1`,
      [subscriptionId]
    )

    if (existingResult.rows.length > 0) {
      // Update existing subscription
      await query(
        `UPDATE "ToolSubscription" 
         SET "status" = $1, "currentPeriodStart" = $2, "currentPeriodEnd" = $3, "updatedAt" = NOW()
         WHERE "stripeSubscriptionId" = $4`,
        [status, currentPeriodStart.toISOString(), currentPeriodEnd.toISOString(), subscriptionId]
      )
      logger.info(`Updated existing subscription: ${subscriptionId} for user ${userId}`)
    } else {
      // Create new subscription
      const subscriptionUuid = require('crypto').randomUUID()
      await query(
        `INSERT INTO "ToolSubscription" (
          "id", "userId", "planId", "status", "stripeSubscriptionId", 
          "stripeCustomerId", "currentPeriodStart", "currentPeriodEnd", 
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [subscriptionUuid, userId, planId, status, subscriptionId, customerId, currentPeriodStart.toISOString(), currentPeriodEnd.toISOString()]
      )
      logger.info(`Created new subscription: ${subscriptionId} for user ${userId}`)
    }

    // Invalidate user cache
    await invalidateUserCacheById(userId)

    logger.info(`Stripe subscription created: ${subscriptionId} for customer ${customerId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to handle subscription creation: ${message}`,
      error instanceof Error ? error : undefined,
      { subscriptionId: subscription.id }
    )
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string
    const subscriptionId = subscription.id
    const planId = subscription.items.data[0]?.price?.id || subscription.items.data[0]?.price?.nickname || 'unknown'
    const status = subscription.status
    // Stripe subscription uses snake_case properties
    const subData = subscription as any
    const currentPeriodStart = new Date(subData.current_period_start * 1000)
    const currentPeriodEnd = new Date(subData.current_period_end * 1000)
    const cancelAt = (subscription as any).cancel_at ? new Date((subscription as any).cancel_at * 1000) : null

    // Update subscription
    const result = await query(
      `UPDATE "ToolSubscription" 
       SET "planId" = $1, "status" = $2, "currentPeriodStart" = $3, 
           "currentPeriodEnd" = $4, "cancelAt" = $5, "updatedAt" = NOW()
       WHERE "stripeSubscriptionId" = $6
       RETURNING "userId"`,
      [planId, status, currentPeriodStart.toISOString(), currentPeriodEnd.toISOString(), cancelAt?.toISOString() || null, subscriptionId]
    )

    if (result.rows.length > 0) {
      const userId = result.rows[0].userId
      // Invalidate user cache
      await invalidateUserCacheById(userId)
      logger.info(`Updated subscription: ${subscriptionId} for user ${userId}`)
    } else {
      logger.warn(`Subscription not found for update: ${subscriptionId}`)
    }

    logger.info(`Stripe subscription updated: ${subscriptionId} for customer ${customerId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to handle subscription update: ${message}`,
      error instanceof Error ? error : undefined,
      { subscriptionId: subscription.id }
    )
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const customerId = subscription.customer as string
    const subscriptionId = subscription.id

    // Get userId before deleting
    const result = await query(
      `SELECT "userId" FROM "ToolSubscription" WHERE "stripeSubscriptionId" = $1 LIMIT 1`,
      [subscriptionId]
    )

    if (result.rows.length > 0) {
      const userId = result.rows[0].userId

      // Update subscription status to cancelled instead of deleting
      // This preserves history and allows for reactivation
      await query(
        `UPDATE "ToolSubscription" 
         SET "status" = 'cancelled', "updatedAt" = NOW()
         WHERE "stripeSubscriptionId" = $1`,
        [subscriptionId]
      )

      // Invalidate user cache
      await invalidateUserCacheById(userId)
      logger.info(`Cancelled subscription: ${subscriptionId} for user ${userId}`)
    } else {
      logger.warn(`Subscription not found for deletion: ${subscriptionId}`)
    }

    logger.info(`Stripe subscription deleted: ${subscriptionId} for customer ${customerId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to handle subscription deletion: ${message}`,
      error instanceof Error ? error : undefined,
      { subscriptionId: subscription.id }
    )
  }
}

/**
 * Handle payment succeeded event
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    const customerId = invoice.customer as string
    const subscriptionId = (invoice as any).subscription as string | null

    if (subscriptionId) {
      // Update subscription period dates if payment succeeded
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const subData = subscription as any
      const currentPeriodStart = new Date(subData.current_period_start * 1000)
      const currentPeriodEnd = new Date(subData.current_period_end * 1000)

      const result = await query(
        `UPDATE "ToolSubscription" 
         SET "status" = 'active', "currentPeriodStart" = $1, 
             "currentPeriodEnd" = $2, "updatedAt" = NOW()
         WHERE "stripeSubscriptionId" = $3
         RETURNING "userId"`,
        [currentPeriodStart.toISOString(), currentPeriodEnd.toISOString(), subscriptionId]
      )

      if (result.rows.length > 0) {
        const userId = result.rows[0].userId
        await invalidateUserCacheById(userId)
        logger.info(`Payment succeeded, subscription renewed: ${subscriptionId} for user ${userId}`)
      }
    }

    logger.info(`Stripe payment succeeded: ${invoice.id} for customer ${customerId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to handle payment success: ${message}`,
      error instanceof Error ? error : undefined,
      { invoiceId: invoice.id }
    )
  }
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  try {
    const customerId = invoice.customer as string
    const subscriptionId = (invoice as any).subscription as string | null

    if (subscriptionId) {
      // Update subscription status to past_due or unpaid
      const result = await query(
        `UPDATE "ToolSubscription" 
         SET "status" = 'past_due', "updatedAt" = NOW()
         WHERE "stripeSubscriptionId" = $1
         RETURNING "userId"`,
        [subscriptionId]
      )

      if (result.rows.length > 0) {
        const userId = result.rows[0].userId
        await invalidateUserCacheById(userId)
        logger.info(`Payment failed, subscription marked past_due: ${subscriptionId} for user ${userId}`)
      }
    }

    logger.info(`Stripe payment failed: ${invoice.id} for customer ${customerId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to handle payment failure: ${message}`,
      error instanceof Error ? error : undefined,
      { invoiceId: invoice.id }
    )
  }
}

/**
 * Register Stripe webhook routes
 */
export async function registerStripeWebhookRoutes(fastifyApp: FastifyInstance) {
  fastifyApp.post(
    '/api/webhooks/stripe',
    handleStripeWebhook
  )

  logger.info('Stripe webhook routes registered', { routes: ['/api/webhooks/stripe'] })
}
