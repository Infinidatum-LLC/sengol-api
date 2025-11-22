/**
 * User Management Routes
 * 
 * Provides endpoints for user lookup and management
 * Used by frontend for email notifications, trial management, etc.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { AuthenticationError } from '../lib/errors'

/**
 * Get user by ID
 * GET /api/v1/users/:id
 * 
 * Returns user information including email, name, and trial status
 */
async function getUserById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const requestingUserId = (request as any).userId

    if (!id) {
      return reply.status(400).send({
        success: false,
        error: 'User ID is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    // Allow users to view their own profile, or require admin for others
    if (requestingUserId !== id) {
      // Check if requester is admin
      const adminCheck = await query(
        `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
        [requestingUserId]
      )
      
      if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden: Cannot view other users',
          code: 'FORBIDDEN',
          statusCode: 403,
        })
      }
    }

    const result = await query(
      `SELECT 
        "id", 
        "email", 
        "name", 
        "trialEndsAt",
        "trialStartedAt",
        "trialStatus",
        "trialEmailsSent",
        "role",
        "createdAt",
        "updatedAt"
      FROM "User" 
      WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        statusCode: 404,
      })
    }

    const user = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        trialEndsAt: user.trialEndsAt ? new Date(user.trialEndsAt) : null,
        trialStartedAt: user.trialStartedAt ? new Date(user.trialStartedAt) : null,
        trialStatus: user.trialStatus,
        trialEmailsSent: user.trialEmailsSent,
        role: user.role,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get user by ID error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve user',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get users with active trials for email notifications
 * GET /api/v1/users/trials/active
 * 
 * Returns users with active trials that need milestone emails
 */
async function getActiveTrialUsers(request: FastifyRequest, reply: FastifyReply) {
  try {
    const requestingUserId = (request as any).userId

    // Check if requester is admin
    const adminCheck = await query(
      `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [requestingUserId]
    )
    
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      return reply.status(403).send({
        success: false,
        error: 'Forbidden: Admin access required',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    const result = await query(
      `SELECT 
        "id",
        "email",
        "name",
        "trialStartedAt",
        "trialEndsAt",
        "trialEmailsSent"
      FROM "User"
      WHERE "trialStatus" = 'active'
        AND "trialEndsAt" IS NOT NULL
      ORDER BY "trialStartedAt" ASC`
    )

    const users = result.rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      trialStartedAt: row.trialStartedAt ? new Date(row.trialStartedAt) : null,
      trialEndsAt: row.trialEndsAt ? new Date(row.trialEndsAt) : null,
      trialEmailsSent: row.trialEmailsSent || {},
    }))

    return reply.status(200).send({
      success: true,
      data: {
        users,
        total: users.length,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get active trial users error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve active trial users',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Check user subscription status
 * GET /api/v1/users/:id/subscription
 * 
 * Returns user's subscription and product access information
 */
async function getUserSubscription(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const requestingUserId = (request as any).userId

    if (!id) {
      return reply.status(400).send({
        success: false,
        error: 'User ID is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    // Allow users to view their own subscription, or require admin for others
    if (requestingUserId !== id) {
      const adminCheck = await query(
        `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
        [requestingUserId]
      )
      
      if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden: Cannot view other users',
          code: 'FORBIDDEN',
          statusCode: 403,
        })
      }
    }

    // Get tool subscriptions
    const toolSubscriptions = await query(
      `SELECT 
        "id",
        "planId",
        "status",
        "currentPeriodStart",
        "currentPeriodEnd"
      FROM "ToolSubscription"
      WHERE "userId" = $1 AND "status" = 'active'
      ORDER BY "createdAt" DESC`,
      [id]
    )

    // Get product access
    const productAccess = await query(
      `SELECT 
        "id",
        "productSlug",
        "status",
        "expiresAt",
        "grantedAt"
      FROM "ProductAccess"
      WHERE "userId" = $1 AND "status" = 'active'
        AND ("expiresAt" IS NULL OR "expiresAt" >= NOW())
      ORDER BY "grantedAt" DESC`,
      [id]
    )

    // Get user role
    const userResult = await query(
      `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    const isAdmin = userResult.rows.length > 0 && userResult.rows[0].role === 'admin'

    return reply.status(200).send({
      success: true,
      data: {
        toolSubscriptions: toolSubscriptions.rows.map((sub: any) => ({
          id: sub.id,
          planId: sub.planId,
          status: sub.status,
          currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : null,
          currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
        })),
        productAccess: productAccess.rows.map((access: any) => ({
          id: access.id,
          productSlug: access.productSlug,
          status: access.status,
          expiresAt: access.expiresAt ? new Date(access.expiresAt) : null,
          grantedAt: access.grantedAt ? new Date(access.grantedAt) : null,
        })),
        isAdmin,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get user subscription error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve subscription',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all user management routes
 */
export async function usersRoutes(fastify: FastifyInstance) {
  // All routes require JWT authentication
  fastify.get('/api/v1/users/:id', { onRequest: jwtAuthMiddleware }, getUserById)
  fastify.get('/api/v1/users/trials/active', { onRequest: jwtAuthMiddleware }, getActiveTrialUsers)
  fastify.get('/api/v1/users/:id/subscription', { onRequest: jwtAuthMiddleware }, getUserSubscription)

  fastify.log.info('User management routes registered')
}

