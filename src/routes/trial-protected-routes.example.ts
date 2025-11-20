/**
 * Example Trial-Protected Routes
 *
 * Demonstrates how to integrate trial system middleware into your API routes.
 * Copy these patterns to your actual route handlers.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateUser } from './auth'
import { createTrialLimitGuard } from '../middleware/trial-limit-guard'
import { checkTrialExpiration } from '../middleware/trial-expiration'
import { createUsageTracker } from '../middleware/feature-usage-tracker'
import { invalidateCacheOnSuccess } from '../middleware/cache-invalidation'

/**
 * EXAMPLE 1: Risk Assessment Endpoint
 *
 * POST /api/risk-assessment
 *
 * Flow:
 * 1. Auth middleware verifies JWT
 * 2. Trial expiration check (403 if expired)
 * 3. Feature limit check (429 if exceeded)
 * 4. Handler processes request
 * 5. Usage tracker increments counter (200+ only)
 *
 * Trial limits:
 * - Free: 5 assessments/month
 * - Trial: 5 assessments/month
 * - Consultant+: Unlimited
 */
async function createRiskAssessment(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).user.id
  const trialStatus = (request as any).trialStatus
  const feature = (request as any).feature // 'riskAssessment'

  // Your business logic here
  const systemDescription = (request.body as any).systemDescription

  if (!systemDescription || systemDescription.length < 50) {
    // This will fail the request - usage won't be tracked
    reply.code(400).send({
      code: 'INVALID_INPUT',
      message: 'System description must be at least 50 characters',
    })
    return
  }

  // Perform risk assessment...
  const assessment = {
    id: `assessment-${Date.now()}`,
    userId,
    score: 75,
    status: 'completed',
    createdAt: new Date(),
  }

  // Return 2xx response - usage will auto-increment
  reply.code(201).send(assessment)
}

/**
 * EXAMPLE 2: Compliance Check Endpoint
 *
 * POST /api/compliance-check
 *
 * Note: Compliance check is unlimited for all tiers,
 * but we still track middleware for consistency.
 */
async function checkCompliance(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).user.id

  // Your business logic here
  const jurisdiction = (request.body as any).jurisdiction
  const controlsData = (request.body as any).controls

  if (!jurisdiction) {
    reply.code(400).send({
      code: 'INVALID_INPUT',
      message: 'Jurisdiction is required',
    })
    return
  }

  // Perform compliance check...
  const compliance = {
    id: `compliance-${Date.now()}`,
    userId,
    jurisdiction,
    score: 85,
    gaps: [],
    recommendations: [],
  }

  // Return 2xx response
  reply.code(200).send(compliance)
}

/**
 * EXAMPLE 3: Incident Search Endpoint
 *
 * GET /api/incidents/search?query=...
 *
 * Limited to 5 searches/month for trial users
 */
async function searchIncidents(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).user.id
  const query = (request.query as any).query

  if (!query || query.length < 3) {
    reply.code(400).send({
      code: 'INVALID_QUERY',
      message: 'Query must be at least 3 characters',
    })
    return
  }

  // Perform semantic search...
  const results = {
    query,
    count: 5,
    incidents: [],
    searchTime: '245ms',
  }

  reply.code(200).send(results)
}

/**
 * EXAMPLE 4: Protected Endpoint with Subscription Check
 *
 * POST /api/export-report
 *
 * This feature is disabled (0) for free/trial users.
 * Returns 429 before handler even runs.
 */
async function exportReport(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).user.id

  // Generate report...
  const report = {
    id: `report-${Date.now()}`,
    format: 'pdf',
    url: 's3://reports/...',
  }

  reply.code(200).send(report)
}

/**
 * Register all trial-protected routes
 */
export async function registerTrialProtectedRoutes(
  fastifyApp: FastifyInstance
) {
  // Risk Assessment endpoint
  fastifyApp.post(
    '/api/risk-assessment',
    {
      preHandler: [
        authenticateUser,
        checkTrialExpiration,
        createTrialLimitGuard('riskAssessment'),
      ],
      onResponse: [createUsageTracker('riskAssessment')],
      schema: {
        description: 'Create a risk assessment (limited by trial)',
        tags: ['risk'],
        body: {
          type: 'object',
          required: ['systemDescription'],
          properties: {
            systemDescription: { type: 'string', minLength: 50 },
          },
        },
      },
    },
    createRiskAssessment
  )

  // Compliance Check endpoint
  fastifyApp.post(
    '/api/compliance-check',
    {
      preHandler: [
        authenticateUser,
        checkTrialExpiration,
        createTrialLimitGuard('complianceCheck'), // Unlimited, but tracked
      ],
      onResponse: [createUsageTracker('complianceCheck')],
      schema: {
        description: 'Check compliance requirements (unlimited)',
        tags: ['compliance'],
        body: {
          type: 'object',
          required: ['jurisdiction'],
          properties: {
            jurisdiction: { type: 'string' },
            controls: { type: 'object' },
          },
        },
      },
    },
    checkCompliance
  )

  // Incident Search endpoint
  fastifyApp.get(
    '/api/incidents/search',
    {
      preHandler: [
        authenticateUser,
        checkTrialExpiration,
        createTrialLimitGuard('incidentSearch'), // 5/month limit
      ],
      onResponse: [createUsageTracker('incidentSearch')],
      schema: {
        description: 'Search incidents by query (5/month trial limit)',
        tags: ['incidents'],
        querystring: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 3 },
          },
        },
      },
    },
    searchIncidents
  )

  // Export Report endpoint (disabled for trial)
  fastifyApp.post(
    '/api/export-report',
    {
      preHandler: [
        authenticateUser,
        checkTrialExpiration,
        createTrialLimitGuard('reportGeneration'), // 0 = disabled for trial
      ],
      onResponse: [
        invalidateCacheOnSuccess, // Cache invalidation on success
      ],
      schema: {
        description: 'Export risk assessment report (Professional+ only)',
        tags: ['reports'],
        body: {
          type: 'object',
          required: ['assessmentId'],
          properties: {
            assessmentId: { type: 'string' },
            format: { type: 'string', enum: ['pdf', 'json', 'html'] },
          },
        },
      },
    },
    exportReport
  )
}

/**
 * Middleware Integration Patterns
 *
 * Pattern 1: Limited Feature
 * ```typescript
 * {
 *   preHandler: [
 *     authenticateUser,
 *     checkTrialExpiration,
 *     createTrialLimitGuard('riskAssessment')
 *   ],
 *   onResponse: [createUsageTracker('riskAssessment')]
 * }
 * ```
 *
 * Pattern 2: Unlimited Feature (but logged)
 * ```typescript
 * {
 *   preHandler: [
 *     authenticateUser,
 *     checkTrialExpiration,
 *     createTrialLimitGuard('complianceCheck') // Limit is -1 (unlimited)
 *   ],
 *   onResponse: [createUsageTracker('complianceCheck')]
 * }
 * ```
 *
 * Pattern 3: Disabled Feature (0 limit)
 * ```typescript
 * {
 *   preHandler: [
 *     authenticateUser,
 *     createTrialLimitGuard('reportGeneration') // Limit is 0 (disabled)
 *   ]
 * }
 * // Returns 429 before handler runs
 * ```
 *
 * Pattern 4: Trial Expiration Only
 * ```typescript
 * {
 *   preHandler: [
 *     authenticateUser,
 *     checkTrialExpiration
 *   ]
 * }
 * // No feature limit, but trial status is checked
 * ```
 *
 * Pattern 5: Public Endpoint (no auth)
 * ```typescript
 * {
 *   preHandler: [] // No auth or trial checks
 * }
 * // Public access
 * ```
 */
