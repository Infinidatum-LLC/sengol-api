/**
 * AI Risk Council Routes
 * All Council API endpoints
 */

import { FastifyInstance } from 'fastify'
import * as controller from '../controllers/council.controller'

export async function registerCouncilRoutes(fastify: FastifyInstance) {
  // ==================== Policy Engine Routes ====================

  // Health check for Council API
  fastify.get('/api/council/health', controller.councilHealth)

  // Policy CRUD endpoints
  fastify.post('/api/council/policies', controller.createPolicy)
  fastify.get('/api/council/policies', controller.listPolicies)
  fastify.get('/api/council/policies/:id', controller.getPolicyById)
  fastify.put('/api/council/policies/:id', controller.updatePolicy)
  fastify.delete('/api/council/policies/:id', controller.deletePolicy)

  // Policy evaluation endpoints
  fastify.post('/api/council/policies/:id/evaluate', controller.evaluatePolicy)
  fastify.post('/api/council/policies/evaluate-all', controller.bulkEvaluatePolicies)

  // Violation endpoints
  fastify.get('/api/council/violations', controller.listViolations)
  fastify.put('/api/council/violations/:id', controller.updateViolation)

  // ==================== Vendor Governance Routes ====================

  // Vendor CRUD endpoints
  fastify.post('/api/council/vendors', controller.createVendor)
  fastify.get('/api/council/vendors', controller.listVendors)
  fastify.get('/api/council/vendors/:id', controller.getVendorById)
  fastify.put('/api/council/vendors/:id', controller.updateVendor)
  fastify.delete('/api/council/vendors/:id', controller.deleteVendor)

  // Vendor assessment endpoints
  fastify.post('/api/council/vendors/:id/assess', controller.assessVendor)
  fastify.get('/api/council/vendors/:vendorId/assessments/:assessmentId', controller.getVendorAssessment)

  // Vendor scorecard endpoints
  fastify.post('/api/council/vendors/:id/scorecard', controller.createScorecard)
  fastify.get('/api/council/vendors/:id/scorecards', controller.listScorecards)

  // ==================== Automated Assessment Routes ====================

  // Schedule CRUD endpoints
  fastify.post('/api/council/schedules', controller.createSchedule)
  fastify.get('/api/council/schedules', controller.listSchedules)
  fastify.get('/api/council/schedules/:id', controller.getScheduleById)
  fastify.put('/api/council/schedules/:id', controller.updateSchedule)
  fastify.delete('/api/council/schedules/:id', controller.deleteSchedule)

  // Schedule execution endpoint
  fastify.post('/api/council/schedules/:id/run-now', controller.executeSchedule)

  // ==================== Cross-Module Routes ====================

  // Status endpoint
  fastify.get('/api/council/status', controller.councilStatus)
}
