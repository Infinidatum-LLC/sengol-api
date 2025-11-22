/**
 * Admin Pricing Management Routes
 *
 * These routes allow administrators to manage pricing plans dynamically.
 * All routes require admin authentication.
 *
 * Routes:
 * - GET /api/admin/pricing - Get all pricing plans
 * - GET /api/admin/pricing/changelog - Get pricing change history
 * - POST /api/admin/pricing/update-price - Update plan price
 * - POST /api/admin/pricing/update-limit - Update plan limit
 * - POST /api/admin/pricing/toggle-feature - Toggle plan feature
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { AuthenticationError, AuthorizationError } from '../lib/errors'

interface UpdatePriceBody {
  planId: string
  price: number
  reason?: string
}

interface UpdateLimitBody {
  planId: string
  limitKey: string
  value: number
  reason?: string
}

interface ToggleFeatureBody {
  planId: string
  featureKey: string
  enabled: boolean
  reason?: string
}

/**
 * Check if user is admin
 */
async function checkAdminAccess(request: FastifyRequest): Promise<void> {
  const userId = (request as any).userId
  if (!userId) {
    throw new AuthenticationError('User ID not found in token')
  }

  const result = await query(
    `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
    [userId]
  )

  if (result.rows.length === 0) {
    throw new AuthenticationError('User not found')
  }

  const user = result.rows[0]
  if (user.role !== 'admin') {
    throw new AuthorizationError('Admin access required')
  }
}

/**
 * Get all pricing plans
 * GET /api/admin/pricing
 */
async function getPricingPlans(request: FastifyRequest, reply: FastifyReply) {
  try {
    await checkAdminAccess(request)

    // Get all active pricing plans
    const plansResult = await query(
      `SELECT 
        "id",
        "planId",
        "name",
        "description",
        "price",
        "interval",
        "popular",
        "active",
        "sortOrder"
      FROM "PricingPlan"
      WHERE "active" = true
      ORDER BY "sortOrder" ASC`
    )

    // Get features for each plan
    const plans = await Promise.all(
      plansResult.rows.map(async (plan) => {
        const featuresResult = await query(
          `SELECT "name" FROM "PricingFeature" WHERE "pricingPlanId" = $1 ORDER BY "sortOrder" ASC`,
          [plan.id]
        )

        const limitsResult = await query(
          `SELECT "limitKey", "limitValue", "featureKey", "enabled", "metadata"
           FROM "PricingLimit" WHERE "pricingPlanId" = $1`,
          [plan.id]
        )

        const limits: Record<string, any> = {}
        for (const limit of limitsResult.rows) {
          if (limit.featureKey) {
            limits[limit.featureKey] = limit.enabled
          } else if (limit.limitKey) {
            limits[limit.limitKey] = limit.limitValue
          }
          if (limit.metadata) {
            Object.assign(limits, limit.metadata)
          }
        }

        return {
          id: plan.id,
          planId: plan.planId,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          interval: plan.interval,
          popular: plan.popular,
          active: plan.active,
          sortOrder: plan.sortOrder,
          features: featuresResult.rows.map((f) => f.name),
          limits,
        }
      })
    )

    reply.send({ success: true, plans })
  } catch (error) {
    request.log.error(error, 'Error fetching pricing plans')
    reply.status(500).send({ error: 'Failed to fetch pricing plans' })
  }
}

/**
 * Get pricing change history
 * GET /api/admin/pricing/changelog
 */
async function getPricingChangelog(request: FastifyRequest, reply: FastifyReply) {
  try {
    await checkAdminAccess(request)

    const { limit = 100 } = request.query as { limit?: number }

    const result = await query(
      `SELECT 
        "id",
        "planId",
        "changeType",
        "field",
        "oldValue",
        "newValue",
        "changedBy",
        "reason",
        "createdAt"
      FROM "PricingChangeLog"
      ORDER BY "createdAt" DESC
      LIMIT $1`,
      [limit]
    )

    reply.send({ success: true, changelog: result.rows })
  } catch (error) {
    request.log.error(error, 'Error fetching pricing changelog')
    reply.status(500).send({ error: 'Failed to fetch pricing changelog' })
  }
}

/**
 * Update plan price
 * POST /api/admin/pricing/update-price
 */
async function updatePlanPrice(request: FastifyRequest<{ Body: UpdatePriceBody }>, reply: FastifyReply) {
  try {
    await checkAdminAccess(request)

    const { planId, price, reason } = request.body
    const userId = (request as any).userId

    if (!planId || typeof price !== 'number') {
      reply.status(400).send({ error: 'Missing planId or price' })
      return
    }

    // Get current plan
    const planResult = await query(
      `SELECT "id", "price" FROM "PricingPlan" WHERE "planId" = $1 LIMIT 1`,
      [planId]
    )

    if (planResult.rows.length === 0) {
      reply.status(404).send({ error: `Plan ${planId} not found` })
      return
    }

    const plan = planResult.rows[0]
    const oldPrice = plan.price

    // Get user email for changelog
    const userResult = await query(
      `SELECT "email" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )
    const changedBy = userResult.rows[0]?.email || 'admin'

    // Update price
    await query(
      `UPDATE "PricingPlan" SET "price" = $1 WHERE "planId" = $2`,
      [price, planId]
    )

    // Log change
    await query(
      `INSERT INTO "PricingChangeLog" 
       ("planId", "changeType", "field", "oldValue", "newValue", "changedBy", "reason")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        planId,
        'price_change',
        'price',
        oldPrice?.toString() || 'null',
        price.toString(),
        changedBy,
        reason || null,
      ]
    )

    reply.send({
      success: true,
      message: `Updated ${planId} price to $${price / 100}`,
    })
  } catch (error) {
    request.log.error(error, 'Error updating plan price')
    reply.status(500).send({ error: 'Failed to update plan price' })
  }
}

/**
 * Update plan limit
 * POST /api/admin/pricing/update-limit
 */
async function updatePlanLimit(request: FastifyRequest<{ Body: UpdateLimitBody }>, reply: FastifyReply) {
  try {
    await checkAdminAccess(request)

    const { planId, limitKey, value, reason } = request.body
    const userId = (request as any).userId

    if (!planId || !limitKey || typeof value !== 'number') {
      reply.status(400).send({ error: 'Missing planId, limitKey, or value' })
      return
    }

    // Get plan
    const planResult = await query(
      `SELECT "id" FROM "PricingPlan" WHERE "planId" = $1 LIMIT 1`,
      [planId]
    )

    if (planResult.rows.length === 0) {
      reply.status(404).send({ error: `Plan ${planId} not found` })
      return
    }

    const plan = planResult.rows[0]

    // Get user email for changelog
    const userResult = await query(
      `SELECT "email" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )
    const changedBy = userResult.rows[0]?.email || 'admin'

    // Get existing limit
    const existingResult = await query(
      `SELECT "limitValue" FROM "PricingLimit" 
       WHERE "pricingPlanId" = $1 AND "limitKey" = $2 LIMIT 1`,
      [plan.id, limitKey]
    )

    const oldValue = existingResult.rows[0]?.limitValue || 0

    // Update or create limit
    await query(
      `INSERT INTO "PricingLimit" ("pricingPlanId", "limitKey", "limitValue")
       VALUES ($1, $2, $3)
       ON CONFLICT ("pricingPlanId", "limitKey") 
       DO UPDATE SET "limitValue" = $3`,
      [plan.id, limitKey, value]
    )

    // Log change
    await query(
      `INSERT INTO "PricingChangeLog" 
       ("planId", "changeType", "field", "oldValue", "newValue", "changedBy", "reason")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        planId,
        'limit_change',
        limitKey,
        oldValue.toString(),
        value.toString(),
        changedBy,
        reason || null,
      ]
    )

    reply.send({
      success: true,
      message: `Updated ${planId} ${limitKey} to ${value}`,
    })
  } catch (error) {
    request.log.error(error, 'Error updating plan limit')
    reply.status(500).send({ error: 'Failed to update plan limit' })
  }
}

/**
 * Toggle plan feature
 * POST /api/admin/pricing/toggle-feature
 */
async function togglePlanFeature(request: FastifyRequest<{ Body: ToggleFeatureBody }>, reply: FastifyReply) {
  try {
    await checkAdminAccess(request)

    const { planId, featureKey, enabled, reason } = request.body
    const userId = (request as any).userId

    if (!planId || !featureKey || typeof enabled !== 'boolean') {
      reply.status(400).send({ error: 'Missing planId, featureKey, or enabled' })
      return
    }

    // Get plan
    const planResult = await query(
      `SELECT "id" FROM "PricingPlan" WHERE "planId" = $1 LIMIT 1`,
      [planId]
    )

    if (planResult.rows.length === 0) {
      reply.status(404).send({ error: `Plan ${planId} not found` })
      return
    }

    const plan = planResult.rows[0]

    // Get user email for changelog
    const userResult = await query(
      `SELECT "email" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )
    const changedBy = userResult.rows[0]?.email || 'admin'

    // Get existing feature
    const existingResult = await query(
      `SELECT "enabled" FROM "PricingLimit" 
       WHERE "pricingPlanId" = $1 AND "featureKey" = $2 LIMIT 1`,
      [plan.id, featureKey]
    )

    const oldValue = existingResult.rows[0]?.enabled || false

    // Update or create feature flag
    await query(
      `INSERT INTO "PricingLimit" ("pricingPlanId", "featureKey", "enabled", "limitKey", "limitValue")
       VALUES ($1, $2, $3, '', 0)
       ON CONFLICT ("pricingPlanId", "featureKey") 
       DO UPDATE SET "enabled" = $3`,
      [plan.id, featureKey, enabled]
    )

    // Log change
    await query(
      `INSERT INTO "PricingChangeLog" 
       ("planId", "changeType", "field", "oldValue", "newValue", "changedBy", "reason")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        planId,
        'feature_change',
        featureKey,
        oldValue.toString(),
        enabled.toString(),
        changedBy,
        reason || null,
      ]
    )

    reply.send({
      success: true,
      message: `${enabled ? 'Enabled' : 'Disabled'} ${featureKey} for ${planId}`,
    })
  } catch (error) {
    request.log.error(error, 'Error toggling plan feature')
    reply.status(500).send({ error: 'Failed to toggle plan feature' })
  }
}

export async function pricingRoutes(fastify: FastifyInstance) {
  // All pricing routes require JWT authentication
  await fastify.register(async (fastify) => {
    await fastify.addHook('onRequest', jwtAuthMiddleware)

    fastify.get('/api/admin/pricing', getPricingPlans)
    fastify.get('/api/admin/pricing/changelog', getPricingChangelog)
    fastify.post('/api/admin/pricing/update-price', updatePlanPrice)
    fastify.post('/api/admin/pricing/update-limit', updatePlanLimit)
    fastify.post('/api/admin/pricing/toggle-feature', togglePlanFeature)
  })
}

