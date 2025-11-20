/**
 * Stripe Webhook Handler for Trial System
 *
 * Processes Stripe events for subscription and payment management.
 * Handles: subscription created/updated/deleted, payment success/failure
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import Stripe from 'stripe'
import { prisma } from '../services/database'
import { logger } from '../lib/logger'
import { invalidateUserCacheById } from '../middleware/cache-invalidation'
import { StripeWebhookError } from '../lib/errors'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
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
      event = stripe.webhooks.constructEvent(
        request.rawBody || request.body as any,
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
    const planId = (subscription.items.data[0]?.price?.metadata?.planId ||
      subscription.items.data[0]?.price?.nickname ||
      'unknown') as string

    // Find user by Stripe customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, email: true },
    })

    if (!user) {
      logger.warn(`Subscription created for unknown customer: ${customerId}`)
      return
    }

    // Create or update subscription record
    await prisma.toolSubscription.upsert({
      where: {
        userId_stripeSubscriptionId: {
          userId: user.id,
          stripeSubscriptionId: subscription.id,
        },
      },
      create: {
        userId: user.id,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        planId: planId.toLowerCase(),
        status: subscription.status === 'active' ? 'active' : 'pending',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
      update: {
        planId: planId.toLowerCase(),
        status: subscription.status === 'active' ? 'active' : 'pending',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    })

    // Invalidate cache
    await invalidateUserCacheById(user.id)

    logger.logStripeWebhook(
      subscription.id,
      'subscription.created',
      user.id,
      'created'
    )
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

    // Find user by Stripe customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    })

    if (!user) {
      logger.warn(`Subscription updated for unknown customer: ${customerId}`)
      return
    }

    // Update subscription status
    await prisma.toolSubscription.updateMany({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      data: {
        status: subscription.status === 'active' ? 'active' : 'pending',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    })

    // Invalidate cache
    await invalidateUserCacheById(user.id)

    logger.logStripeWebhook(
      subscription.id,
      'subscription.updated',
      user.id,
      subscription.status
    )
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

    // Find user by Stripe customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    })

    if (!user) {
      logger.warn(`Subscription deleted for unknown customer: ${customerId}`)
      return
    }

    // Mark subscription as cancelled
    await prisma.toolSubscription.updateMany({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      data: {
        status: 'cancelled',
      },
    })

    // Invalidate cache
    await invalidateUserCacheById(user.id)

    logger.logStripeWebhook(
      subscription.id,
      'subscription.deleted',
      user.id,
      'cancelled'
    )
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

    // Find user by Stripe customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    })

    if (user) {
      // Invalidate cache to reflect payment status
      await invalidateUserCacheById(user.id)
    }

    logger.logStripeWebhook(
      invoice.id,
      'invoice.payment_succeeded',
      user?.id || customerId,
      'paid'
    )
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

    // Find user by Stripe customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, email: true },
    })

    if (user) {
      // Log payment failure for monitoring
      logger.logStripeWebhook(
        invoice.id,
        'invoice.payment_failed',
        user.id,
        'failed'
      )

      // Invalidate cache to reflect payment status
      await invalidateUserCacheById(user.id)
    }
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
    {
      schema: {
        description: 'Stripe webhook endpoint',
        tags: ['webhooks'],
      },
    },
    handleStripeWebhook
  )

  logger.info('Stripe webhook routes registered', { routes: ['/api/webhooks/stripe'] })
}
