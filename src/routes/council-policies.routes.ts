/**
 * AI Risk Council - Policy Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { ValidationError, AuthenticationError } from '../lib/errors'
import { randomUUID } from 'crypto'

async function listPolicies(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const queryParams = request.query as {
      page?: string
      limit?: string
      status?: string
    }

    const page = parseInt(queryParams.page || '1', 10)
    const limit = Math.min(parseInt(queryParams.limit || '50', 10), 100)
    const offset = (page - 1) * limit

    const conditions: string[] = [`"geographyAccountId" = $1`]
    const params: any[] = [geographyAccountId]
    let paramIndex = 2

    if (queryParams.status) {
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

    const policies = policiesResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      status: row.status || 'ACTIVE',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    return reply.status(200).send({
      success: true,
      policies,
      total,
      page,
      limit,
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'List policies error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to list policies',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function createPolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const body = request.body as {
      name?: string
      description?: string
      status?: string
    }

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('Policy name is required', 'INVALID_INPUT')
    }

    const policyId = randomUUID()
    const now = new Date()

    await query(
      `INSERT INTO "Policy" (
        "id", "geographyAccountId", "name", "description", "status", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        policyId,
        geographyAccountId,
        body.name.trim(),
        body.description || null,
        body.status || 'ACTIVE',
        now.toISOString(),
        now.toISOString(),
      ]
    )

    return reply.status(201).send({
      success: true,
      data: {
        id: policyId,
        name: body.name.trim(),
        description: body.description || null,
        status: body.status || 'ACTIVE',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      return reply.status(error instanceof AuthenticationError ? 401 : 400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: error instanceof AuthenticationError ? 401 : 400,
      })
    }

    request.log.error({ err: error }, 'Create policy error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create policy',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function getPolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const result = await query(
      `SELECT "id", "name", "description", "status", "createdAt", "updatedAt"
       FROM "Policy"
       WHERE "id" = $1 AND "geographyAccountId" = $2
       LIMIT 1`,
      [id, geographyAccountId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const policy = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: policy.id,
        name: policy.name,
        description: policy.description || '',
        status: policy.status || 'ACTIVE',
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Get policy error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch policy',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function updatePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const body = request.body as {
      name?: string
      description?: string
      status?: string
    }

    const checkResult = await query(
      `SELECT "id" FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    if (body.name !== undefined) {
      updateFields.push(`"name" = $${paramIndex}`)
      updateValues.push(body.name.trim())
      paramIndex++
    }

    if (body.description !== undefined) {
      updateFields.push(`"description" = $${paramIndex}`)
      updateValues.push(body.description)
      paramIndex++
    }

    if (body.status !== undefined) {
      updateFields.push(`"status" = $${paramIndex}`)
      updateValues.push(body.status)
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

    return reply.status(200).send({
      success: true,
      data: {
        id: policy.id,
        name: policy.name,
        description: policy.description || '',
        status: policy.status || 'ACTIVE',
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      return reply.status(error instanceof AuthenticationError ? 401 : 400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: error instanceof AuthenticationError ? 401 : 400,
      })
    }

    request.log.error({ err: error }, 'Update policy error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to update policy',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function deletePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const checkResult = await query(
      `SELECT "id" FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    await query(
      `DELETE FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2`,
      [id, geographyAccountId]
    )

    return reply.status(200).send({
      success: true,
      message: 'Policy deleted successfully',
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Delete policy error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to delete policy',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function evaluatePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const policyResult = await query(
      `SELECT "id", "name" FROM "Policy" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (policyResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Policy not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    return reply.status(201).send({
      success: true,
      data: {
        policyId: id,
        status: 'pending',
        message: 'Policy evaluation queued successfully',
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Evaluate policy error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to evaluate policy',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function evaluateAllPolicies(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const policiesResult = await query(
      `SELECT "id" FROM "Policy" 
       WHERE "geographyAccountId" = $1 AND "status" != 'ARCHIVED'`,
      [geographyAccountId]
    )

    const policyIds = policiesResult.rows.map((row: any) => row.id)

    return reply.status(201).send({
      success: true,
      data: {
        policyCount: policyIds.length,
        message: `Evaluation queued for ${policyIds.length} policies`,
      },
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Evaluate all policies error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to evaluate all policies',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
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

