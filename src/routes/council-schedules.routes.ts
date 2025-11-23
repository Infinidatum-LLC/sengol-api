/**
 * AI Risk Council - Schedule Routes
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
  sendNotFound,
  sendUnauthorized,
  sendValidationError,
  sendInternalError,
  sendSuccessMessage,
} from '../lib/response-helpers'

/**
 * Schedule status enum
 */
const SCHEDULE_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const
type ScheduleStatus = typeof SCHEDULE_STATUSES[number]

/**
 * Schedule frequency enum
 */
const SCHEDULE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'] as const
type ScheduleFrequency = typeof SCHEDULE_FREQUENCIES[number]

/**
 * Schedule creation/update body
 */
interface ScheduleBody {
  name?: string
  description?: string
  frequency?: string
  status?: string
}

async function listSchedules(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const queryParams = request.query as PaginationQuery & { status?: string }
    const { page, limit, offset } = parsePagination(queryParams)

    const conditions: string[] = [`"geographyAccountId" = $1`]
    const params: (string | number | boolean | null)[] = [geographyAccountId]
    let paramIndex = 2

    if (queryParams.status) {
      validateEnum(queryParams.status, 'status', SCHEDULE_STATUSES)
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

    const schedules = schedulesResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) || '',
      frequency: (row.frequency as ScheduleFrequency) || null,
      status: (row.status as ScheduleStatus) || 'ACTIVE',
      nextRunAt: (row.nextRunAt as Date) || null,
      lastRunAt: (row.lastRunAt as Date) || null,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    }))

    sendPaginated(reply, schedules, total, page, limit, 'schedules')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'List schedules error')
    sendInternalError(reply, 'Failed to list schedules', error)
  }
}

async function createSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const body = request.body as ScheduleBody

    const name = validateRequiredString(body.name, 'Schedule name', 1, 255)
    const description = validateOptionalString(body.description, 'Description')
    const frequency = body.frequency
      ? (validateEnum(body.frequency, 'frequency', SCHEDULE_FREQUENCIES) as ScheduleFrequency)
      : null
    const status = validateEnum(
      body.status,
      'status',
      SCHEDULE_STATUSES,
      'ACTIVE'
    ) as ScheduleStatus

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
        name,
        description,
        frequency,
        status,
        now.toISOString(),
        now.toISOString(),
      ]
    )

    sendSuccess(
      reply,
      {
        id: scheduleId,
        name,
        description,
        frequency,
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

    request.log.error({ err: error }, 'Create schedule error')
    sendInternalError(reply, 'Failed to create schedule', error)
  }
}

async function getSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Schedule ID')

    const result = await query(
      `SELECT "id", "name", "description", "frequency", "status", 
              "nextRunAt", "lastRunAt", "createdAt", "updatedAt"
       FROM "AssessmentSchedule"
       WHERE "id" = $1 AND "geographyAccountId" = $2
       LIMIT 1`,
      [id, geographyAccountId]
    )

    if (result.rows.length === 0) {
      sendNotFound(reply, 'Schedule')
      return
    }

    const schedule = result.rows[0]

    sendSuccess(reply, {
      id: schedule.id as string,
      name: schedule.name as string,
      description: (schedule.description as string) || '',
      frequency: (schedule.frequency as ScheduleFrequency) || null,
      status: (schedule.status as ScheduleStatus) || 'ACTIVE',
      nextRunAt: (schedule.nextRunAt as Date) || null,
      lastRunAt: (schedule.lastRunAt as Date) || null,
      createdAt: schedule.createdAt as Date,
      updatedAt: schedule.updatedAt as Date,
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

    request.log.error({ err: error }, 'Get schedule error')
    sendInternalError(reply, 'Failed to fetch schedule', error)
  }
}

async function updateSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }
    const body = request.body as ScheduleBody

    validateRequiredString(id, 'Schedule ID')

    const checkResult = await query(
      `SELECT "id" FROM "AssessmentSchedule" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      sendNotFound(reply, 'Schedule')
      return
    }

    const updateFields: string[] = []
    const updateValues: (string | number | boolean | null)[] = []
    let paramIndex = 1

    if (body.name !== undefined) {
      const validatedName = validateRequiredString(body.name, 'Schedule name', 1, 255)
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

    if (body.frequency !== undefined) {
      const validatedFrequency = validateEnum(
        body.frequency,
        'frequency',
        SCHEDULE_FREQUENCIES
      ) as ScheduleFrequency
      updateFields.push(`"frequency" = $${paramIndex}`)
      updateValues.push(validatedFrequency)
      paramIndex++
    }

    if (body.status !== undefined) {
      const validatedStatus = validateEnum(body.status, 'status', SCHEDULE_STATUSES) as ScheduleStatus
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

    sendSuccess(reply, {
      id: schedule.id as string,
      name: schedule.name as string,
      description: (schedule.description as string) || '',
      frequency: (schedule.frequency as ScheduleFrequency) || null,
      status: (schedule.status as ScheduleStatus) || 'ACTIVE',
      nextRunAt: (schedule.nextRunAt as Date) || null,
      lastRunAt: (schedule.lastRunAt as Date) || null,
      createdAt: schedule.createdAt as Date,
      updatedAt: schedule.updatedAt as Date,
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

    request.log.error({ err: error }, 'Update schedule error')
    sendInternalError(reply, 'Failed to update schedule', error)
  }
}

async function deleteSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Schedule ID')

    const checkResult = await query(
      `SELECT "id" FROM "AssessmentSchedule" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      sendNotFound(reply, 'Schedule')
      return
    }

    await query(
      `DELETE FROM "AssessmentSchedule" WHERE "id" = $1 AND "geographyAccountId" = $2`,
      [id, geographyAccountId]
    )

    sendSuccessMessage(reply, 'Schedule deleted successfully')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Delete schedule error')
    sendInternalError(reply, 'Failed to delete schedule', error)
  }
}

async function runScheduleNow(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Schedule ID')

    const scheduleResult = await query(
      `SELECT "id", "name", "status" FROM "AssessmentSchedule" 
       WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (scheduleResult.rows.length === 0) {
      sendNotFound(reply, 'Schedule')
      return
    }

    const schedule = scheduleResult.rows[0]
    const status = schedule.status as ScheduleStatus

    if (status === 'COMPLETED') {
      sendValidationError(reply, 'Cannot run a completed schedule', 'INVALID_STATUS')
      return
    }

    const now = new Date()
    await query(
      `UPDATE "AssessmentSchedule" 
       SET "lastRunAt" = $1, "nextRunAt" = $2, "updatedAt" = NOW()
       WHERE "id" = $3 AND "geographyAccountId" = $4`,
      [now.toISOString(), now.toISOString(), id, geographyAccountId]
    )

    sendSuccess(reply, {
      scheduleId: id,
      status: 'running',
      lastRunAt: now.toISOString(),
      message: 'Schedule execution started',
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

    request.log.error({ err: error }, 'Run schedule now error')
    sendInternalError(reply, 'Failed to run schedule', error)
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
