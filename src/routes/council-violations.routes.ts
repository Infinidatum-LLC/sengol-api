/**
 * AI Risk Council - Violation Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { ValidationError, AuthenticationError } from '../lib/errors'

async function listViolations(request: FastifyRequest, reply: FastifyReply) {
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
      severity?: string
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

    if (queryParams.severity) {
      conditions.push(`"severity" = $${paramIndex}`)
      params.push(queryParams.severity)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    const countResult = await query(
      `SELECT COUNT(*) as count FROM "PolicyViolation" WHERE ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.count || '0', 10)

    params.push(limit, offset)
    const violationsResult = await query(
      `SELECT "id", "policyId", "assessmentId", "severity", "status", 
              "description", "createdAt", "updatedAt"
       FROM "PolicyViolation"
       WHERE ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    )

    const violations = violationsResult.rows.map((row: any) => ({
      id: row.id,
      policyId: row.policyId,
      assessmentId: row.assessmentId || null,
      severity: row.severity || 'medium',
      status: row.status || 'open',
      description: row.description || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    return reply.status(200).send({
      success: true,
      violations,
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

    request.log.error({ err: error }, 'List violations error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to list violations',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function updateViolation(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const body = request.body as {
      status?: string
      resolution?: string
    }

    const checkResult = await query(
      `SELECT "id" FROM "PolicyViolation" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Violation not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    if (body.status !== undefined) {
      const validStatuses = ['open', 'acknowledged', 'resolved', 'dismissed']
      if (!validStatuses.includes(body.status)) {
        throw new ValidationError(
          `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          'INVALID_STATUS'
        )
      }
      updateFields.push(`"status" = $${paramIndex}`)
      updateValues.push(body.status)
      paramIndex++
    }

    if (body.resolution !== undefined) {
      updateFields.push(`"resolution" = $${paramIndex}`)
      updateValues.push(body.resolution)
      paramIndex++
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update', 'INVALID_INPUT')
    }

    updateFields.push(`"updatedAt" = NOW()`)
    updateValues.push(id)

    await query(
      `UPDATE "PolicyViolation" 
       SET ${updateFields.join(', ')}
       WHERE "id" = $${paramIndex}`,
      updateValues
    )

    const result = await query(
      `SELECT "id", "policyId", "assessmentId", "severity", "status", 
              "description", "resolution", "createdAt", "updatedAt"
       FROM "PolicyViolation"
       WHERE "id" = $1
       LIMIT 1`,
      [id]
    )

    const violation = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: violation.id,
        policyId: violation.policyId,
        assessmentId: violation.assessmentId || null,
        severity: violation.severity || 'medium',
        status: violation.status || 'open',
        description: violation.description || '',
        resolution: violation.resolution || null,
        createdAt: violation.createdAt,
        updatedAt: violation.updatedAt,
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

    request.log.error({ err: error }, 'Update violation error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to update violation',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

export async function councilViolationsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/council/violations', { onRequest: jwtAuthMiddleware }, listViolations)
  fastify.patch('/api/council/violations/:id', { onRequest: jwtAuthMiddleware }, updateViolation)

  fastify.log.info('Council violation routes registered')
}

