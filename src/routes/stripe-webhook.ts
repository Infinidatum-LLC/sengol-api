/**
 * Stripe Webhook Handler for Trial System
 *
 * Processes Stripe events for subscription and payment management.
 * Handles: subscription created/updated/deleted, payment success/failure
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import Stripe from 'stripe'
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
    // TODO: Implement Prisma-to-raw-SQL migration for subscription creation
    // This stub prevents compilation errors while Prisma migration is in progress
    const customerId = subscription.customer as string
    logger.info(`Stripe subscription created: ${subscription.id} for customer ${customerId}`)
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
    // TODO: Implement Prisma-to-raw-SQL migration for subscription updates
    const customerId = subscription.customer as string
    logger.info(`Stripe subscription updated: ${subscription.id} for customer ${customerId}`)
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
    // TODO: Implement Prisma-to-raw-SQL migration for subscription deletion
    const customerId = subscription.customer as string
    logger.info(`Stripe subscription deleted: ${subscription.id} for customer ${customerId}`)
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
    // TODO: Implement Prisma-to-raw-SQL migration for payment success handling
    const customerId = invoice.customer as string
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
    // TODO: Implement Prisma-to-raw-SQL migration for payment failure handling
    const customerId = invoice.customer as string
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
