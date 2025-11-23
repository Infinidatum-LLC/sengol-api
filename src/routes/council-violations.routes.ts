/**
 * AI Risk Council - Violation Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { ValidationError, AuthenticationError } from '../lib/errors'
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
} from '../lib/response-helpers'

/**
 * Violation status enum
 */
const VIOLATION_STATUSES = ['OPEN', 'RESOLVED', 'MITIGATED', 'DISMISSED'] as const
type ViolationStatus = typeof VIOLATION_STATUSES[number]

/**
 * Violation severity enum
 */
const VIOLATION_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
type ViolationSeverity = typeof VIOLATION_SEVERITIES[number]

/**
 * Violation update body
 */
interface ViolationUpdateBody {
  status?: string
  resolution?: string
}

async function listViolations(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const queryParams = request.query as PaginationQuery & {
      status?: string
      severity?: string
    }
    const { page, limit, offset } = parsePagination(queryParams)

    const conditions: string[] = [`"geographyAccountId" = $1`]
    const params: (string | number | boolean | null)[] = [geographyAccountId]
    let paramIndex = 2

    if (queryParams.status) {
      validateEnum(queryParams.status, 'status', VIOLATION_STATUSES)
      conditions.push(`"status" = $${paramIndex}`)
      params.push(queryParams.status)
      paramIndex++
    }

    if (queryParams.severity) {
      validateEnum(queryParams.severity, 'severity', VIOLATION_SEVERITIES)
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

    const violations = violationsResult.rows.map((row) => ({
      id: row.id as string,
      policyId: row.policyId as string,
      assessmentId: (row.assessmentId as string) || null,
      severity: (row.severity as ViolationSeverity) || 'MEDIUM',
      status: (row.status as ViolationStatus) || 'OPEN',
      description: (row.description as string) || '',
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    }))

    sendPaginated(reply, violations, total, page, limit, 'violations')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'List violations error')
    sendInternalError(reply, 'Failed to list violations', error)
  }
}

async function updateViolation(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }
    const body = request.body as ViolationUpdateBody

    validateRequiredString(id, 'Violation ID')

    const checkResult = await query(
      `SELECT "id" FROM "PolicyViolation" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (checkResult.rows.length === 0) {
      sendNotFound(reply, 'Violation')
      return
    }

    const updateFields: string[] = []
    const updateValues: (string | number | boolean | null)[] = []
    let paramIndex = 1

    if (body.status !== undefined) {
      const validatedStatus = validateEnum(
        body.status,
        'status',
        VIOLATION_STATUSES
      ) as ViolationStatus
      updateFields.push(`"status" = $${paramIndex}`)
      updateValues.push(validatedStatus)
      paramIndex++
    }

    if (body.resolution !== undefined) {
      const validatedResolution = validateOptionalString(body.resolution, 'Resolution')
      updateFields.push(`"resolution" = $${paramIndex}`)
      updateValues.push(validatedResolution)
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

    sendSuccess(reply, {
      id: violation.id as string,
      policyId: violation.policyId as string,
      assessmentId: (violation.assessmentId as string) || null,
      severity: (violation.severity as ViolationSeverity) || 'MEDIUM',
      status: (violation.status as ViolationStatus) || 'OPEN',
      description: (violation.description as string) || '',
      resolution: (violation.resolution as string) || null,
      createdAt: violation.createdAt as Date,
      updatedAt: violation.updatedAt as Date,
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

    request.log.error({ err: error }, 'Update violation error')
    sendInternalError(reply, 'Failed to update violation', error)
  }
}

export async function councilViolationsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/council/violations', { onRequest: jwtAuthMiddleware }, listViolations)
  fastify.patch('/api/council/violations/:id', { onRequest: jwtAuthMiddleware }, updateViolation)

  fastify.log.info('Council violation routes registered')
}
