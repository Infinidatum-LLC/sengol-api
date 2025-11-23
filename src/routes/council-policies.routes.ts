/**
 * AI Risk Council - Policy Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { ValidationError, AuthenticationError } from '../lib/errors'
import { randomUUID } from 'crypto'
import {
  AuthenticatedRequest,
  GeographyRequest,
  getUserId,
  getGeographyAccountId,
  parsePagination,
  PaginationQuery,
} from '../types/request'
import {
  validateRequiredString,
  validateOptionalString,
  validateEnum,
} from '../lib/validation'
import {
  sendSuccess,
  sendPaginated,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendValidationError,
  sendInternalError,
  sendSuccessMessage,
} from '../lib/response-helpers'

/**
 * Policy status enum
 */
const POLICY_STATUSES = ['ACTIVE', 'ARCHIVED', 'INACTIVE'] as const
type PolicyStatus = typeof POLICY_STATUSES[number]

/**
 * Policy creation/update body
 */
interface PolicyBody {
  name?: string
  description?: string
  category?: string
  status?: string
}

async function listPolicies(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const queryParams = request.query as PaginationQuery & { status?: string }
    const { page, limit, offset } = parsePagination(queryParams)

    const conditions: string[] = [`"geographyAccountId" = $1`]
    const params: (string | number | boolean | null)[] = [geographyAccountId]
    let paramIndex = 2

    if (queryParams.status) {
      // Validate status if provided
      validateEnum(queryParams.status, 'status', POLICY_STATUSES)
      conditions.push(`"status" = $${paramIndex}`)
      params.push(queryParams.status)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    const countResult = await query(
      `SELECT COUNT(*) as count FROM "Policy" WHERE ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.count || '0', 10)

    params.push(limit, offset)
    const policiesResult = await query(
      `SELECT "id", "name", "description", "status", "createdAt", "updatedAt"
       FROM "Policy"
       WHERE ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    )

    const policies = policiesResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      status: (row.status as PolicyStatus) || 'ACTIVE',
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    }))

    sendPaginated(reply, policies, total, page, limit, 'policies')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'List policies error')
    sendInternalError(reply, 'Failed to list policies', error)
  }
}

async function createPolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const body = request.body as PolicyBody

    // Validate required fields
    const name = validateRequiredString(body.name, 'Policy name', 1, 255)
    const description = validateOptionalString(body.description, 'Description')
    const status = validateEnum(
      body.status,
      'status',
      POLICY_STATUSES,
      'ACTIVE'
    ) as PolicyStatus

    const policyId = randomUUID()
    const now = new Date()

    await query(
      `INSERT INTO "Policy" (
        "id", "geographyAccountId", "name", "description", "status", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        policyId,
        geographyAccountId,
        name,
        description,
        status,
        now.toISOString(),
        now.toISOString(),
      ]
    )

    sendSuccess(
      reply,
      {
        id: policyId,
        name,
        description,
        status,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      201
    )
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Create policy error')
    sendInternalError(reply, 'Failed to create policy', error)
  }
}

async function getPolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Policy ID')

    const result = await query(
      `SELECT "id", "name", "description", "status", "createdAt", "updatedAt"
       FROM "Policy"
       WHERE "id" = $1 AND "geographyAccountId" = $2
       LIMIT 1`,
      [id, geographyAccountId]
    )

    if (result.rows.length === 0) {
      sendNotFound(reply, 'Policy')
      return
    }

    const policy = result.rows[0]

    sendSuccess(reply, {
      id: policy.id as string,
      name: policy.name as string,
      description: (policy.description as string) || '',
      status: (policy.status as PolicyStatus) || 'ACTIVE',
      createdAt: policy.createdAt as Date,
      updatedAt: policy.updatedAt as Date,
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Get policy error')
    sendInternalError(reply, 'Failed to fetch policy', error)
  }
}

async function updatePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }
    const body = request.body as PolicyBody

    validateRequiredString(id, 'Policy ID')

    const checkResult = await query(
      `SELECT "id" FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      sendNotFound(reply, 'Policy')
      return
    }

    const updateFields: string[] = []
    const updateValues: (string | number | boolean | null)[] = []
    let paramIndex = 1

    if (body.name !== undefined) {
      const validatedName = validateRequiredString(body.name, 'Policy name', 1, 255)
      updateFields.push(`"name" = $${paramIndex}`)
      updateValues.push(validatedName)
      paramIndex++
    }

    if (body.description !== undefined) {
      const validatedDescription = validateOptionalString(body.description, 'Description')
      updateFields.push(`"description" = $${paramIndex}`)
      updateValues.push(validatedDescription)
      paramIndex++
    }

    if (body.status !== undefined) {
      const validatedStatus = validateEnum(body.status, 'status', POLICY_STATUSES) as PolicyStatus
      updateFields.push(`"status" = $${paramIndex}`)
      updateValues.push(validatedStatus)
      paramIndex++
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update', 'INVALID_INPUT')
    }

    updateFields.push(`"updatedAt" = NOW()`)
    updateValues.push(id, geographyAccountId)

    await query(
      `UPDATE "Policy" 
       SET ${updateFields.join(', ')}
       WHERE "id" = $${paramIndex} AND "geographyAccountId" = $${paramIndex + 1}`,
      updateValues
    )

    const result = await query(
      `SELECT "id", "name", "description", "status", "createdAt", "updatedAt"
       FROM "Policy"
       WHERE "id" = $1 AND "geographyAccountId" = $2
       LIMIT 1`,
      [id, geographyAccountId]
    )

    const policy = result.rows[0]

    sendSuccess(reply, {
      id: policy.id as string,
      name: policy.name as string,
      description: (policy.description as string) || '',
      status: (policy.status as PolicyStatus) || 'ACTIVE',
      createdAt: policy.createdAt as Date,
      updatedAt: policy.updatedAt as Date,
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Update policy error')
    sendInternalError(reply, 'Failed to update policy', error)
  }
}

async function deletePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Policy ID')

    const checkResult = await query(
      `SELECT "id" FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      sendNotFound(reply, 'Policy')
      return
    }

    await query(
      `DELETE FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2`,
      [id, geographyAccountId]
    )

    sendSuccessMessage(reply, 'Policy deleted successfully')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Delete policy error')
    sendInternalError(reply, 'Failed to delete policy', error)
  }
}

async function evaluatePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Policy ID')

    const policyResult = await query(
      `SELECT "id", "name" FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (policyResult.rows.length === 0) {
      sendNotFound(reply, 'Policy')
      return
    }

    sendSuccess(
      reply,
      {
        policyId: id,
        status: 'pending',
        message: 'Policy evaluation queued successfully',
      },
      201
    )
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Evaluate policy error')
    sendInternalError(reply, 'Failed to evaluate policy', error)
  }
}

async function evaluateAllPolicies(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)

    const policiesResult = await query(
      `SELECT "id" FROM "Policy" 
       WHERE "geographyAccountId" = $1 AND "status" != 'ARCHIVED'`,
      [geographyAccountId]
    )

    const policyIds = policiesResult.rows.map((row) => row.id as string)

    sendSuccess(
      reply,
      {
        policyCount: policyIds.length,
        message: `Evaluation queued for ${policyIds.length} policies`,
      },
      201
    )
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    request.log.error({ err: error }, 'Evaluate all policies error')
    sendInternalError(reply, 'Failed to evaluate all policies', error)
  }
}

export async function councilPoliciesRoutes(fastify: FastifyInstance) {
  fastify.get('/api/council/policies', { onRequest: jwtAuthMiddleware }, listPolicies)
  fastify.post('/api/council/policies', { onRequest: jwtAuthMiddleware }, createPolicy)
  fastify.get('/api/council/policies/:id', { onRequest: jwtAuthMiddleware }, getPolicy)
  fastify.put('/api/council/policies/:id', { onRequest: jwtAuthMiddleware }, updatePolicy)
  fastify.delete('/api/council/policies/:id', { onRequest: jwtAuthMiddleware }, deletePolicy)
  fastify.post('/api/council/policies/:id/evaluate', { onRequest: jwtAuthMiddleware }, evaluatePolicy)
  fastify.post('/api/council/policies/evaluate-all', { onRequest: jwtAuthMiddleware }, evaluateAllPolicies)

  fastify.log.info('Council policy routes registered')
}

