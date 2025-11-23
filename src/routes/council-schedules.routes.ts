/**
 * AI Risk Council - Schedule Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { ValidationError, AuthenticationError } from '../lib/errors'
import { randomUUID } from 'crypto'

async function listSchedules(request: FastifyRequest, reply: FastifyReply) {
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
      `SELECT COUNT(*) as count FROM "AssessmentSchedule" WHERE ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.count || '0', 10)

    params.push(limit, offset)
    const schedulesResult = await query(
      `SELECT "id", "name", "description", "frequency", "status", 
              "nextRunAt", "lastRunAt", "createdAt", "updatedAt"
       FROM "AssessmentSchedule"
       WHERE ${whereClause}
       ORDER BY "createdAt" DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    )

    const schedules = schedulesResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      frequency: row.frequency || null,
      status: row.status || 'ACTIVE',
      nextRunAt: row.nextRunAt || null,
      lastRunAt: row.lastRunAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    return reply.status(200).send({
      success: true,
      schedules,
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

    request.log.error({ err: error }, 'List schedules error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to list schedules',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function createSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const body = request.body as {
      name?: string
      description?: string
      frequency?: string
      status?: string
    }

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('Schedule name is required', 'INVALID_INPUT')
    }

    const scheduleId = randomUUID()
    const now = new Date()

    await query(
      `INSERT INTO "AssessmentSchedule" (
        "id", "geographyAccountId", "name", "description", 
        "frequency", "status", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        scheduleId,
        geographyAccountId,
        body.name.trim(),
        body.description || null,
        body.frequency || null,
        body.status || 'ACTIVE',
        now.toISOString(),
        now.toISOString(),
      ]
    )

    return reply.status(201).send({
      success: true,
      data: {
        id: scheduleId,
        name: body.name.trim(),
        description: body.description || null,
        frequency: body.frequency || null,
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

    request.log.error({ err: error }, 'Create schedule error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create schedule',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function getSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const result = await query(
      `SELECT "id", "name", "description", "frequency", "status", 
              "nextRunAt", "lastRunAt", "createdAt", "updatedAt"
       FROM "AssessmentSchedule"
       WHERE "id" = $1 AND "geographyAccountId" = $2
       LIMIT 1`,
      [id, geographyAccountId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Schedule not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const schedule = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: schedule.id,
        name: schedule.name,
        description: schedule.description || '',
        frequency: schedule.frequency || null,
        status: schedule.status || 'ACTIVE',
        nextRunAt: schedule.nextRunAt || null,
        lastRunAt: schedule.lastRunAt || null,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
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

    request.log.error({ err: error }, 'Get schedule error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch schedule',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function updateSchedule(request: FastifyRequest, reply: FastifyReply) {
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
      frequency?: string
      status?: string
    }

    const checkResult = await query(
      `SELECT "id" FROM "AssessmentSchedule" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Schedule not found',
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

    if (body.frequency !== undefined) {
      updateFields.push(`"frequency" = $${paramIndex}`)
      updateValues.push(body.frequency)
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
      `UPDATE "AssessmentSchedule" 
       SET ${updateFields.join(', ')}
       WHERE "id" = $${paramIndex} AND "geographyAccountId" = $${paramIndex + 1}`,
      updateValues
    )

    const result = await query(
      `SELECT "id", "name", "description", "frequency", "status", 
              "nextRunAt", "lastRunAt", "createdAt", "updatedAt"
       FROM "AssessmentSchedule"
       WHERE "id" = $1 AND "geographyAccountId" = $2
       LIMIT 1`,
      [id, geographyAccountId]
    )

    const schedule = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: schedule.id,
        name: schedule.name,
        description: schedule.description || '',
        frequency: schedule.frequency || null,
        status: schedule.status || 'ACTIVE',
        nextRunAt: schedule.nextRunAt || null,
        lastRunAt: schedule.lastRunAt || null,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
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

    request.log.error({ err: error }, 'Update schedule error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to update schedule',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function deleteSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const checkResult = await query(
      `SELECT "id" FROM "AssessmentSchedule" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Schedule not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    await query(
      `DELETE FROM "AssessmentSchedule" WHERE "id" = $1 AND "geographyAccountId" = $2`,
      [id, geographyAccountId]
    )

    return reply.status(200).send({
      success: true,
      message: 'Schedule deleted successfully',
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

    request.log.error({ err: error }, 'Delete schedule error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to delete schedule',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

async function runScheduleNow(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const scheduleResult = await query(
      `SELECT "id", "name", "status" FROM "AssessmentSchedule" 
       WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (scheduleResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Schedule not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const schedule = scheduleResult.rows[0]

    if (schedule.status === 'COMPLETED' || schedule.status === 'ARCHIVED') {
      return reply.status(400).send({
        success: false,
        error: 'Cannot run a completed or archived schedule',
        code: 'INVALID_STATUS',
        statusCode: 400,
      })
    }

    const now = new Date()
    await query(
      `UPDATE "AssessmentSchedule" 
       SET "lastRunAt" = $1, "nextRunAt" = $2, "updatedAt" = NOW()
       WHERE "id" = $3 AND "geographyAccountId" = $4`,
      [now.toISOString(), now.toISOString(), id, geographyAccountId]
    )

    return reply.status(200).send({
      success: true,
      data: {
        scheduleId: id,
        status: 'running',
        lastRunAt: now.toISOString(),
        message: 'Schedule execution started',
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

    request.log.error({ err: error }, 'Run schedule now error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to run schedule',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

export async function councilSchedulesRoutes(fastify: FastifyInstance) {
  fastify.get('/api/council/schedules', { onRequest: jwtAuthMiddleware }, listSchedules)
  fastify.post('/api/council/schedules', { onRequest: jwtAuthMiddleware }, createSchedule)
  fastify.get('/api/council/schedules/:id', { onRequest: jwtAuthMiddleware }, getSchedule)
  fastify.put('/api/council/schedules/:id', { onRequest: jwtAuthMiddleware }, updateSchedule)
  fastify.delete('/api/council/schedules/:id', { onRequest: jwtAuthMiddleware }, deleteSchedule)
  fastify.post('/api/council/schedules/:id/run-now', { onRequest: jwtAuthMiddleware }, runScheduleNow)

  fastify.log.info('Council schedule routes registered')
}

