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

/**
 * List vendors
 *
 * GET /api/council/vendors
 *
 * Returns list of vendors with filtering and pagination.
 */
async function listVendors(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const queryParams = request.query as {
      page?: string
      limit?: string
      vendorType?: string
      riskTier?: string
      category?: string
    }

    const page = parseInt(queryParams.page || '1', 10)
    const limit = Math.min(parseInt(queryParams.limit || '50', 10), 100)
    const offset = (page - 1) * limit

    // Build WHERE conditions
    const conditions: string[] = [`"geographyAccountId" = $1`]
    const params: any[] = [geographyAccountId]
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

    const vendors = vendorsResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      vendorType: row.vendorType,
      riskTier: row.riskTier,
      category: row.category,
      description: row.description || '',
      website: row.website || null,
      status: row.status || 'active',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    request.log.info({ userId, count: vendors.length }, 'Vendors listed')

    return reply.status(200).send({
      success: true,
      vendors,
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

    request.log.error({ err: error }, 'List vendors error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to list vendors',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
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
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const body = request.body as {
      name?: string
      vendorType?: string
      riskTier?: string
      category?: string
      description?: string
      website?: string
    }

    // Validate input
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('Vendor name is required', 'INVALID_INPUT')
    }

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
        body.name.trim(),
        body.vendorType || null,
        body.riskTier || null,
        body.category || null,
        body.description || null,
        body.website || null,
        'active',
        now.toISOString(),
        now.toISOString(),
      ]
    )

    request.log.info({ userId, vendorId }, 'Vendor created')

    return reply.status(201).send({
      success: true,
      data: {
        id: vendorId,
        name: body.name.trim(),
        vendorType: body.vendorType || null,
        riskTier: body.riskTier || null,
        category: body.category || null,
        description: body.description || null,
        website: body.website || null,
        status: 'active',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
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

    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Create vendor error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create vendor',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
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
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

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
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const vendor = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: vendor.id,
        name: vendor.name,
        vendorType: vendor.vendorType,
        riskTier: vendor.riskTier,
        category: vendor.category,
        description: vendor.description || '',
        website: vendor.website || null,
        status: vendor.status || 'active',
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
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

    request.log.error({ err: error }, 'Get vendor error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch vendor',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
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
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const body = request.body as {
      name?: string
      vendorType?: string
      riskTier?: string
      category?: string
      description?: string
      website?: string
      status?: string
    }

    // Verify vendor exists and belongs to geography account
    const checkResult = await query(
      `SELECT "id" FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    // Build update query
    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    if (body.name !== undefined) {
      updateFields.push(`"name" = $${paramIndex}`)
      updateValues.push(body.name.trim())
      paramIndex++
    }

    if (body.vendorType !== undefined) {
      updateFields.push(`"vendorType" = $${paramIndex}`)
      updateValues.push(body.vendorType)
      paramIndex++
    }

    if (body.riskTier !== undefined) {
      updateFields.push(`"riskTier" = $${paramIndex}`)
      updateValues.push(body.riskTier)
      paramIndex++
    }

    if (body.category !== undefined) {
      updateFields.push(`"category" = $${paramIndex}`)
      updateValues.push(body.category)
      paramIndex++
    }

    if (body.description !== undefined) {
      updateFields.push(`"description" = $${paramIndex}`)
      updateValues.push(body.description)
      paramIndex++
    }

    if (body.website !== undefined) {
      updateFields.push(`"website" = $${paramIndex}`)
      updateValues.push(body.website)
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

    return reply.status(200).send({
      success: true,
      data: {
        id: vendor.id,
        name: vendor.name,
        vendorType: vendor.vendorType,
        riskTier: vendor.riskTier,
        category: vendor.category,
        description: vendor.description || '',
        website: vendor.website || null,
        status: vendor.status || 'active',
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
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

    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Update vendor error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to update vendor',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
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
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'
    const { id } = request.params as { id: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    // Verify vendor exists and belongs to geography account
    const checkResult = await query(
      `SELECT "id" FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2 LIMIT 1`,
      [id, geographyAccountId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Vendor not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    // Delete vendor
    await query(
      `DELETE FROM "Vendor" WHERE "id" = $1 AND "geographyAccountId" = $2`,
      [id, geographyAccountId]
    )

    request.log.info({ userId, vendorId: id }, 'Vendor deleted')

    return reply.status(200).send({
      success: true,
      message: 'Vendor deleted successfully',
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

    request.log.error({ err: error }, 'Delete vendor error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to delete vendor',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
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

  fastify.log.info('Council vendor routes registered')
}

