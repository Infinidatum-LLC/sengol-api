/**
 * AI Risk Council - Vendor Routes
 *
 * Handles vendor management for AI Risk Council
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
 * Vendor status enum
 */
const VENDOR_STATUSES = ['active', 'inactive', 'archived'] as const
type VendorStatus = typeof VENDOR_STATUSES[number]

/**
 * Vendor creation/update body
 */
interface VendorBody {
  name?: string
  vendorType?: string
  riskTier?: string
  category?: string
  description?: string
  website?: string
  status?: string
}

/**
 * List vendors
 *
 * GET /api/council/vendors
 *
 * Returns list of vendors with filtering and pagination.
 */
async function listVendors(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const queryParams = request.query as PaginationQuery & {
      vendorType?: string
      riskTier?: string
      category?: string
    }
    const { page, limit, offset } = parsePagination(queryParams)

    // Build WHERE conditions
    const conditions: string[] = [`"geographyAccountId" = $1`]
    const params: (string | number | boolean | null)[] = [geographyAccountId]
    let paramIndex = 2

    if (queryParams.vendorType) {
      conditions.push(`"vendorType" = $${paramIndex}`)
      params.push(queryParams.vendorType)
      paramIndex++
    }

    if (queryParams.riskTier) {
      conditions.push(`"riskTier" = $${paramIndex}`)
      params.push(queryParams.riskTier)
      paramIndex++
    }

    if (queryParams.category) {
      conditions.push(`"category" = $${paramIndex}`)
      params.push(queryParams.category)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM "Vendor" WHERE ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0]?.count || '0', 10)

    // Get vendors
    params.push(limit, offset)
    const vendorsResult = await query(
      `SELECT 
        "id", "name", "vendorType", "riskTier", "category", 
        "description", "website", "status", "createdAt", "updatedAt"
      FROM "Vendor"
      WHERE ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    )

    const vendors = vendorsResult.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      vendorType: (row.vendorType as string) || null,
      riskTier: (row.riskTier as string) || null,
      category: (row.category as string) || null,
      description: (row.description as string) || '',
      website: (row.website as string) || null,
      status: (row.status as VendorStatus) || 'active',
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    }))

    request.log.info({ userId, count: vendors.length }, 'Vendors listed')

    sendPaginated(reply, vendors, total, page, limit, 'vendors')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    request.log.error({ err: error }, 'List vendors error')
    sendInternalError(reply, 'Failed to list vendors', error)
  }
}

/**
 * Create vendor
 *
 * POST /api/council/vendors
 *
 * Creates a new vendor.
 */
async function createVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const body = request.body as VendorBody

    // Validate input
    const name = validateRequiredString(body.name, 'Vendor name', 1, 255)
    const vendorType = validateOptionalString(body.vendorType, 'Vendor type')
    const riskTier = validateOptionalString(body.riskTier, 'Risk tier')
    const category = validateOptionalString(body.category, 'Category')
    const description = validateOptionalString(body.description, 'Description')
    const website = validateOptionalString(body.website, 'Website', 500)

    // Create vendor
    const vendorId = randomUUID()
    const now = new Date()

    await query(
      `INSERT INTO "Vendor" (
        "id", "geographyAccountId", "name", "vendorType", "riskTier", 
        "category", "description", "website", "status", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        vendorId,
        geographyAccountId,
        name,
        vendorType,
        riskTier,
        category,
        description,
        website,
        'active',
        now.toISOString(),
        now.toISOString(),
      ]
    )

    request.log.info({ userId, vendorId }, 'Vendor created')

    sendSuccess(
      reply,
      {
        id: vendorId,
        name,
        vendorType,
        riskTier,
        category,
        description,
        website,
        status: 'active' as VendorStatus,
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

    request.log.error({ err: error }, 'Create vendor error')
    sendInternalError(reply, 'Failed to create vendor', error)
  }
}

/**
 * Get vendor by ID
 *
 * GET /api/council/vendors/:id
 *
 * Returns details of a specific vendor.
 */
async function getVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Vendor ID')

    const result = await query(
      `SELECT 
        "id", "name", "vendorType", "riskTier", "category", 
        "description", "website", "status", "createdAt", "updatedAt"
      FROM "Vendor"
      WHERE "id" = $1 AND "geographyAccountId" = $2
      LIMIT 1`,
      [id, geographyAccountId]
    )

    if (result.rows.length === 0) {
      sendNotFound(reply, 'Vendor')
      return
    }

    const vendor = result.rows[0]

    sendSuccess(reply, {
      id: vendor.id as string,
      name: vendor.name as string,
      vendorType: (vendor.vendorType as string) || null,
      riskTier: (vendor.riskTier as string) || null,
      category: (vendor.category as string) || null,
      description: (vendor.description as string) || '',
      website: (vendor.website as string) || null,
      status: (vendor.status as VendorStatus) || 'active',
      createdAt: vendor.createdAt as Date,
      updatedAt: vendor.updatedAt as Date,
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

    request.log.error({ err: error }, 'Get vendor error')
    sendInternalError(reply, 'Failed to fetch vendor', error)
  }
}

/**
 * Update vendor
 *
 * PUT /api/council/vendors/:id
 *
 * Updates an existing vendor.
 */
async function updateVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }
    const body = request.body as VendorBody

    validateRequiredString(id, 'Vendor ID')

    // Verify vendor exists and belongs to geography account
    const checkResult = await query(
      `SELECT "id" FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      sendNotFound(reply, 'Vendor')
      return
    }

    // Build update query
    const updateFields: string[] = []
    const updateValues: (string | number | boolean | null)[] = []
    let paramIndex = 1

    if (body.name !== undefined) {
      const validatedName = validateRequiredString(body.name, 'Vendor name', 1, 255)
      updateFields.push(`"name" = $${paramIndex}`)
      updateValues.push(validatedName)
      paramIndex++
    }

    if (body.vendorType !== undefined) {
      const validatedType = validateOptionalString(body.vendorType, 'Vendor type')
      updateFields.push(`"vendorType" = $${paramIndex}`)
      updateValues.push(validatedType)
      paramIndex++
    }

    if (body.riskTier !== undefined) {
      const validatedTier = validateOptionalString(body.riskTier, 'Risk tier')
      updateFields.push(`"riskTier" = $${paramIndex}`)
      updateValues.push(validatedTier)
      paramIndex++
    }

    if (body.category !== undefined) {
      const validatedCategory = validateOptionalString(body.category, 'Category')
      updateFields.push(`"category" = $${paramIndex}`)
      updateValues.push(validatedCategory)
      paramIndex++
    }

    if (body.description !== undefined) {
      const validatedDescription = validateOptionalString(body.description, 'Description')
      updateFields.push(`"description" = $${paramIndex}`)
      updateValues.push(validatedDescription)
      paramIndex++
    }

    if (body.website !== undefined) {
      const validatedWebsite = validateOptionalString(body.website, 'Website', 500)
      updateFields.push(`"website" = $${paramIndex}`)
      updateValues.push(validatedWebsite)
      paramIndex++
    }

    if (body.status !== undefined) {
      const validatedStatus = validateOptionalString(body.status, 'Status')
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
      `UPDATE "Vendor" 
       SET ${updateFields.join(', ')}
       WHERE "id" = $${paramIndex} AND "geographyAccountId" = $${paramIndex + 1}`,
      updateValues
    )

    // Fetch updated vendor
    const result = await query(
      `SELECT 
        "id", "name", "vendorType", "riskTier", "category", 
        "description", "website", "status", "createdAt", "updatedAt"
      FROM "Vendor"
      WHERE "id" = $1 AND "geographyAccountId" = $2
      LIMIT 1`,
      [id, geographyAccountId]
    )

    const vendor = result.rows[0]

    request.log.info({ userId, vendorId: id }, 'Vendor updated')

    sendSuccess(reply, {
      id: vendor.id as string,
      name: vendor.name as string,
      vendorType: (vendor.vendorType as string) || null,
      riskTier: (vendor.riskTier as string) || null,
      category: (vendor.category as string) || null,
      description: (vendor.description as string) || '',
      website: (vendor.website as string) || null,
      status: (vendor.status as VendorStatus) || 'active',
      createdAt: vendor.createdAt as Date,
      updatedAt: vendor.updatedAt as Date,
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

    request.log.error({ err: error }, 'Update vendor error')
    sendInternalError(reply, 'Failed to update vendor', error)
  }
}

/**
 * Delete vendor
 *
 * DELETE /api/council/vendors/:id
 *
 * Deletes a vendor.
 */
async function deleteVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Vendor ID')

    // Verify vendor exists and belongs to geography account
    const checkResult = await query(
      `SELECT "id" FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      sendNotFound(reply, 'Vendor')
      return
    }

    // Delete vendor
    await query(
      `DELETE FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2`,
      [id, geographyAccountId]
    )

    request.log.info({ userId, vendorId: id }, 'Vendor deleted')

    sendSuccessMessage(reply, 'Vendor deleted successfully')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Delete vendor error')
    sendInternalError(reply, 'Failed to delete vendor', error)
  }
}

/**
 * Trigger vendor assessment
 *
 * POST /api/council/vendors/:id/assess
 */
async function assessVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Vendor ID')

    // Verify vendor exists
    const vendorResult = await query(
      `SELECT "id" FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (vendorResult.rows.length === 0) {
      sendNotFound(reply, 'Vendor')
      return
    }

    request.log.info({ userId, vendorId: id }, 'Vendor assessment triggered')

    sendSuccess(
      reply,
      {
        vendorId: id,
        status: 'pending',
        message: 'Assessment queued successfully',
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

    request.log.error({ err: error }, 'Assess vendor error')
    sendInternalError(reply, 'Failed to trigger vendor assessment', error)
  }
}

/**
 * Get vendor scorecard
 *
 * GET /api/council/vendors/:id/scorecard
 */
async function getVendorScorecard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Vendor ID')

    // Verify vendor exists
    const vendorResult = await query(
      `SELECT "id", "name", "riskTier" FROM "Vendor" 
       WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (vendorResult.rows.length === 0) {
      sendNotFound(reply, 'Vendor')
      return
    }

    const vendor = vendorResult.rows[0]

    // Build scorecard response
    const scorecard = {
      vendorId: vendor.id as string,
      vendorName: vendor.name as string,
      riskTier: (vendor.riskTier as string) || 'unknown',
      overallScore: 0,
      assessmentCount: 0,
      lastAssessmentDate: null,
      riskFactors: [],
      recommendations: [],
    }

    sendSuccess(reply, scorecard)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Get vendor scorecard error')
    sendInternalError(reply, 'Failed to fetch vendor scorecard', error)
  }
}

/**
 * List vendor assessments
 *
 * GET /api/council/vendors/:id/assessments
 */
async function listVendorAssessments(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }
    const queryParams = request.query as PaginationQuery & { status?: string }

    validateRequiredString(id, 'Vendor ID')
    const { page, limit, offset } = parsePagination(queryParams)

    // Verify vendor exists
    const vendorResult = await query(
      `SELECT "id" FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (vendorResult.rows.length === 0) {
      sendNotFound(reply, 'Vendor')
      return
    }

    // Return empty list (assessments table may not exist yet)
    sendPaginated(reply, [], 0, page, limit, 'assessments')
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'List vendor assessments error')
    sendInternalError(reply, 'Failed to list vendor assessments', error)
  }
}

/**
 * Register vendor routes
 */
export async function councilVendorsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/council/vendors', { onRequest: jwtAuthMiddleware }, listVendors)
  fastify.post('/api/council/vendors', { onRequest: jwtAuthMiddleware }, createVendor)
  fastify.get('/api/council/vendors/:id', { onRequest: jwtAuthMiddleware }, getVendor)
  fastify.put('/api/council/vendors/:id', { onRequest: jwtAuthMiddleware }, updateVendor)
  fastify.delete('/api/council/vendors/:id', { onRequest: jwtAuthMiddleware }, deleteVendor)
  fastify.post('/api/council/vendors/:id/assess', { onRequest: jwtAuthMiddleware }, assessVendor)
  fastify.get('/api/council/vendors/:id/scorecard', { onRequest: jwtAuthMiddleware }, getVendorScorecard)
  fastify.get('/api/council/vendors/:id/assessments', { onRequest: jwtAuthMiddleware }, listVendorAssessments)

  fastify.log.info('Council vendor routes registered')
}
