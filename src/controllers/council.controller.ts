/**
 * AI Risk Council - Main Controllers
 * Routes requests to appropriate services
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { councilPolicyService } from '../services/council-policy.service'
import { councilVendorService } from '../services/council-vendor.service'
import { councilScheduleService } from '../services/council-schedule.service'
import { councilViolationsService } from '../services/council-violations.service'
import { ValidationError, AppError } from '../lib/errors'

// Get geographyAccountId from request context or headers
function getGeographyAccountId(request: FastifyRequest): string {
  return request.headers['x-geography-account-id'] as string || 'default-account'
}

// ==================== Policy Engine Controllers ====================

export async function createPolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    console.log('[createPolicy controller] Request body:', JSON.stringify(request.body))

    const policy = await councilPolicyService.createPolicy(geographyAccountId, request.body as any)
    console.log('[createPolicy controller] Policy created successfully:', policy.id)

    return reply.status(201).send({ success: true, data: policy })
  } catch (error) {
    console.error('[createPolicy controller] Error caught:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      details: error instanceof Error && 'meta' in error ? (error as any).meta : undefined,
    })

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, error: error.message })
    }

    // Return detailed error for debugging
    return reply.status(500).send({
      success: false,
      error: 'Failed to create policy',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function listPolicies(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { limit = '10', offset = '0' } = request.query as any
    const result = await councilPolicyService.listPolicies(geographyAccountId, parseInt(limit as string, 10), parseInt(offset as string, 10))
    return reply.send({
      success: true,
      data: result.policies,
      pagination: { total: result.total, limit, offset, hasMore: result.hasMore },
    })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to list policies' })
  }
}

export async function getPolicyById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const policy = await councilPolicyService.getPolicyById(geographyAccountId, id)
    return reply.send({ success: true, data: policy })
  } catch (error) {
    return reply.status(404).send({ success: false, error: 'Policy not found' })
  }
}

export async function updatePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const policy = await councilPolicyService.updatePolicy(geographyAccountId, id, request.body)
    return reply.send({ success: true, data: policy })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to update policy' })
  }
}

export async function deletePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    await councilPolicyService.deletePolicy(geographyAccountId, id)
    return reply.send({ success: true, data: { id } })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to delete policy' })
  }
}

export async function evaluatePolicy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const result = await councilPolicyService.evaluatePolicy(geographyAccountId, id, request.body as any)
    return reply.send({ success: true, data: result })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to evaluate policy' })
  }
}

export async function bulkEvaluatePolicies(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const result = await councilPolicyService.bulkEvaluate(geographyAccountId, request.body as any)
    return reply.send({ success: true, data: result })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to bulk evaluate policies' })
  }
}

export async function listViolations(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { limit = 10, offset = 0 } = request.query as any
    console.log('[listViolations controller] Calling service with:', { geographyAccountId, limit, offset })
    const result = await councilViolationsService.listViolations(geographyAccountId, limit, offset, request.query)
    console.log('[listViolations controller] Service returned successfully')
    return reply.send({
      success: true,
      data: result.violations,
      pagination: { total: result.total, limit, offset, hasMore: result.hasMore },
    })
  } catch (error) {
    console.error('[listViolations controller] Error caught:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    })
    return reply.status(500).send({ success: false, error: 'Failed to list violations' })
  }
}

export async function updateViolation(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const violation = await councilViolationsService.updateViolation(geographyAccountId, id, request.body)
    return reply.send({ success: true, data: violation })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to update violation' })
  }
}

// ==================== Vendor Governance Controllers ====================

export async function createVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const vendor = await councilVendorService.createVendor(geographyAccountId, request.body as any)
    return reply.status(201).send({ success: true, data: vendor })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to create vendor' })
  }
}

export async function listVendors(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { limit = '10', offset = '0' } = request.query as any
    const result = await councilVendorService.listVendors(geographyAccountId, parseInt(limit as string, 10), parseInt(offset as string, 10))
    return reply.send({
      success: true,
      data: result.vendors,
      pagination: { total: result.total, limit, offset, hasMore: result.hasMore },
    })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to list vendors' })
  }
}

export async function getVendorById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const vendor = await councilVendorService.getVendorById(geographyAccountId, id)
    return reply.send({ success: true, data: vendor })
  } catch (error) {
    return reply.status(404).send({ success: false, error: 'Vendor not found' })
  }
}

export async function updateVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const vendor = await councilVendorService.updateVendor(geographyAccountId, id, request.body)
    return reply.send({ success: true, data: vendor })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to update vendor' })
  }
}

export async function deleteVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    await councilVendorService.deleteVendor(geographyAccountId, id)
    return reply.send({ success: true, data: { id } })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to delete vendor' })
  }
}

export async function assessVendor(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const assessment = await councilVendorService.assessVendor(geographyAccountId, id, request.body as any)
    return reply.send({ success: true, data: assessment })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to assess vendor' })
  }
}

export async function getVendorAssessment(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { vendorId, assessmentId } = request.params as any

    // Verify vendor exists first
    await councilVendorService.getVendorById(geographyAccountId, vendorId)

    // Get the assessment
    const assessment = await councilVendorService.getAssessmentById(geographyAccountId, vendorId, assessmentId)
    return reply.send({ success: true, data: assessment })
  } catch (error) {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, error: error.message })
    }
    return reply.status(500).send({ success: false, error: 'Failed to get vendor assessment' })
  }
}

export async function createScorecard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const scorecard = await councilVendorService.createScorecard(geographyAccountId, id, request.body as any)
    return reply.status(201).send({ success: true, data: scorecard })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to create scorecard' })
  }
}

export async function listScorecards(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const { limit = 10, offset = 0 } = request.query as any
    const result = await councilVendorService.listScorecards(geographyAccountId, id, limit, offset)
    return reply.send({
      success: true,
      data: result.scorecards,
      pagination: { total: result.total, limit, offset, hasMore: result.hasMore },
    })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to list scorecards' })
  }
}

// ==================== Automated Assessment Controllers ====================

export async function createSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const schedule = await councilScheduleService.createSchedule(geographyAccountId, request.body as any)
    return reply.status(201).send({ success: true, data: schedule })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to create schedule' })
  }
}

export async function listSchedules(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { limit = '10', offset = '0' } = request.query as any
    const result = await councilScheduleService.listSchedules(geographyAccountId, parseInt(limit as string, 10), parseInt(offset as string, 10))
    return reply.send({
      success: true,
      data: result.schedules,
      pagination: { total: result.total, limit, offset, hasMore: result.hasMore },
    })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to list schedules' })
  }
}

export async function getScheduleById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const schedule = await councilScheduleService.getScheduleById(geographyAccountId, id)
    return reply.send({ success: true, data: schedule })
  } catch (error) {
    return reply.status(404).send({ success: false, error: 'Schedule not found' })
  }
}

export async function updateSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const schedule = await councilScheduleService.updateSchedule(geographyAccountId, id, request.body)
    return reply.send({ success: true, data: schedule })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to update schedule' })
  }
}

export async function deleteSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    await councilScheduleService.deleteSchedule(geographyAccountId, id)
    return reply.send({ success: true, data: { id } })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to delete schedule' })
  }
}

export async function executeSchedule(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)
    const { id } = request.params as any
    const result = await councilScheduleService.executeSchedule(geographyAccountId, id)
    return reply.send({ success: true, data: result })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to execute schedule' })
  }
}

// ==================== Health & Status Controllers ====================

export async function councilHealth(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    status: 'healthy',
    module: 'ai-council',
    timestamp: new Date().toISOString(),
  })
}

export async function councilStatus(request: FastifyRequest, reply: FastifyReply) {
  try {
    const geographyAccountId = getGeographyAccountId(request)

    // License tiers mapping
    const licenseTiers = {
      free: { policies: 10, vendors: 0, schedules: 0 },
      'policy-engine': { policies: 50, vendors: 0, schedules: 0 },
      'vendor-governance': { policies: 0, vendors: 25, schedules: 0 },
      'automated-assessment': { policies: 0, vendors: 0, schedules: 50 },
      'ai-council-complete': { policies: 50, vendors: 25, schedules: 50 },
    }

    // Default to free tier for now
    const currentTier = licenseTiers.free
    const limits = {
      policies: { allowed: true, limit: currentTier.policies, current: 12, remaining: currentTier.policies - 12, upgradeRequired: false, upgradeUrl: '/products/ai-council/policy-engine' },
      vendors: { allowed: false, limit: currentTier.vendors, current: 0, remaining: currentTier.vendors, upgradeRequired: true, upgradeUrl: '/products/ai-council/vendor-governance' },
      schedules: { allowed: false, limit: currentTier.schedules, current: 0, remaining: currentTier.schedules, upgradeRequired: true, upgradeUrl: '/products/ai-council/automated-assessment' },
    }

    return reply.send({
      success: true,
      data: {
        policies: limits.policies,
        vendors: limits.vendors,
        schedules: limits.schedules,
        licenses: {
          policyEngine: { hasAccess: true, productSlug: 'policy-engine', expiresAt: null },
          vendorGovernance: { hasAccess: false, productSlug: 'vendor-governance', expiresAt: null },
          automatedAssessment: { hasAccess: false, productSlug: 'automated-assessment', expiresAt: null },
          completeBundle: { hasAccess: false, productSlug: 'ai-council-complete', expiresAt: null },
        },
      },
    })
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to get council status' })
  }
}
