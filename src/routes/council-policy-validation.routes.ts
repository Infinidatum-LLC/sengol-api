/**
 * AI Risk Council - Policy Validation Routes
 * 
 * Endpoints for validating AI policies using LLM analysis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { AuthenticationError, ValidationError } from '../lib/errors'
import {
  AuthenticatedRequest,
  GeographyRequest,
  getUserId,
  getGeographyAccountId,
} from '../types/request'
import {
  validateRequiredString,
  validateOptionalString,
} from '../lib/validation'
import {
  sendSuccess,
  sendError,
  sendUnauthorized,
  sendValidationError,
  sendInternalError,
} from '../lib/response-helpers'
import {
  validatePolicy,
  comparePolicies,
  type PolicyDocument,
} from '../services/policy-validation.service'
import { query } from '../lib/db'

/**
 * Validate a single policy
 * 
 * POST /api/council/policy-validation/validate
 */
async function validatePolicyRoute(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const body = request.body as {
      policy: PolicyDocument
      includeGapAnalysis?: boolean
      focusAreas?: string[]
      industry?: string
      jurisdiction?: string[]
    }

    // Validate required fields
    if (!body.policy) {
      sendValidationError(reply, 'Policy document is required', 'VALIDATION_ERROR')
      return
    }

    validateRequiredString(body.policy.name, 'Policy name')
    validateRequiredString(body.policy.content, 'Policy content')

    if (!body.policy.type || !['organization', 'vendor'].includes(body.policy.type)) {
      sendValidationError(reply, 'Policy type must be "organization" or "vendor"', 'VALIDATION_ERROR')
      return
    }

    // Perform validation
    const result = await validatePolicy(body.policy, {
      includeGapAnalysis: body.includeGapAnalysis ?? false,
      focusAreas: body.focusAreas,
      industry: body.industry,
      jurisdiction: body.jurisdiction,
    })

    sendSuccess(reply, { validation: result })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Policy validation error')
    sendInternalError(reply, 'Failed to validate policy', error)
  }
}

/**
 * Compare organization policy with vendor policy
 * 
 * POST /api/council/policy-validation/compare
 */
async function comparePoliciesRoute(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const body = request.body as {
      orgPolicy: PolicyDocument
      vendorPolicy: PolicyDocument
      focusAreas?: string[]
      industry?: string
    }

    // Validate required fields
    if (!body.orgPolicy || !body.vendorPolicy) {
      sendValidationError(reply, 'Both organization and vendor policies are required', 'VALIDATION_ERROR')
      return
    }

    validateRequiredString(body.orgPolicy.name, 'Organization policy name')
    validateRequiredString(body.orgPolicy.content, 'Organization policy content')
    validateRequiredString(body.vendorPolicy.name, 'Vendor policy name')
    validateRequiredString(body.vendorPolicy.content, 'Vendor policy content')

    // Perform comparison
    const result = await comparePolicies(body.orgPolicy, body.vendorPolicy, {
      focusAreas: body.focusAreas,
      industry: body.industry,
    })

    sendSuccess(reply, { validation: result })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    if (error instanceof ValidationError) {
      sendValidationError(reply, error.message, error.code)
      return
    }

    request.log.error({ err: error }, 'Policy comparison error')
    sendInternalError(reply, 'Failed to compare policies', error)
  }
}

/**
 * Get validation history for a policy
 * 
 * GET /api/council/policy-validation/history/:policyId
 */
async function getValidationHistory(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { policyId } = request.params as { policyId: string }

    validateRequiredString(policyId, 'Policy ID')

    // Fetch validation history
    const result = await query(
      `SELECT 
        "id", "policyId", "policyName", "validationType", "timestamp",
        "overallScore", "status", "summary", "metadata"
      FROM "PolicyValidation"
      WHERE "policyId" = $1
      ORDER BY "timestamp" DESC
      LIMIT 50`,
      [policyId]
    )

    const validations = result.rows.map(row => ({
      id: row.id,
      policyId: row.policyId,
      policyName: row.policyName,
      validationType: row.validationType,
      timestamp: row.timestamp,
      overallScore: row.overallScore,
      status: row.status,
      summary: row.summary,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }))

    sendSuccess(reply, { validations })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    request.log.error({ err: error }, 'Get validation history error')
    sendInternalError(reply, 'Failed to fetch validation history', error)
  }
}

/**
 * Get validation result by ID
 * 
 * GET /api/council/policy-validation/:id
 */
async function getValidationResult(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
    const { id } = request.params as { id: string }

    validateRequiredString(id, 'Validation ID')

    // Fetch validation result
    const result = await query(
      `SELECT * FROM "PolicyValidation"
      WHERE "id" = $1
      LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      sendError(reply, 'Validation result not found', 404)
      return
    }

    const row = result.rows[0]
    const validation = {
      id: row.id,
      policyId: row.policyId,
      policyName: row.policyName,
      validationType: row.validationType,
      timestamp: row.timestamp,
      overallScore: row.overallScore,
      status: row.status,
      issues: typeof row.issues === 'string' ? JSON.parse(row.issues) : row.issues,
      gapAnalysis: row.gapAnalysis ? (typeof row.gapAnalysis === 'string' ? JSON.parse(row.gapAnalysis) : row.gapAnalysis) : null,
      comparison: row.comparison ? (typeof row.comparison === 'string' ? JSON.parse(row.comparison) : row.comparison) : null,
      summary: row.summary,
      recommendations: typeof row.recommendations === 'string' ? JSON.parse(row.recommendations) : row.recommendations,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }

    sendSuccess(reply, { validation })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    request.log.error({ err: error }, 'Get validation result error')
    sendInternalError(reply, 'Failed to fetch validation result', error)
  }
}

export async function councilPolicyValidationRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/council/policy-validation/validate',
    { onRequest: jwtAuthMiddleware },
    validatePolicyRoute
  )

  fastify.post(
    '/api/council/policy-validation/compare',
    { onRequest: jwtAuthMiddleware },
    comparePoliciesRoute
  )

  fastify.get(
    '/api/council/policy-validation/history/:policyId',
    { onRequest: jwtAuthMiddleware },
    getValidationHistory
  )

  fastify.get(
    '/api/council/policy-validation/:id',
    { onRequest: jwtAuthMiddleware },
    getValidationResult
  )

  fastify.log.info('Council policy validation routes registered')
}

