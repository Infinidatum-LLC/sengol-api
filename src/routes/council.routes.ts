/**
 * Council Routes
 *
 * Registers all AI Risk Council API endpoints
 */

import { FastifyInstance } from 'fastify'
import * as controller from '../controllers/council.controller'

export async function councilRoutes(fastify: FastifyInstance) {
  // ============================================================
  // COUNCILS
  // ============================================================

  // GET /v1/councils - List councils
  fastify.get('/v1/councils', controller.listCouncilsController)

  // POST /v1/councils - Create council
  fastify.post('/v1/councils', controller.createCouncilController)

  // GET /v1/councils/:councilId - Get council details
  fastify.get('/v1/councils/:councilId', controller.getCouncilController)

  // PATCH /v1/councils/:councilId - Update council
  fastify.patch('/v1/councils/:councilId', controller.updateCouncilController)

  // POST /v1/councils/:councilId/archive - Archive council
  fastify.post('/v1/councils/:councilId/archive', controller.archiveCouncilController)

  // ============================================================
  // MEMBERSHIP
  // ============================================================

  // GET /v1/councils/:councilId/members - List members
  fastify.get('/v1/councils/:councilId/members', controller.listMembersController)

  // POST /v1/councils/:councilId/assignments - Add/reactivate member
  fastify.post('/v1/councils/:councilId/assignments', controller.addMemberController)

  // PATCH /v1/councils/:councilId/members/:membershipId - Update membership
  fastify.patch(
    '/v1/councils/:councilId/members/:membershipId',
    controller.updateMemberController
  )

  // POST /v1/councils/:councilId/members/:membershipId/revoke - Revoke member
  fastify.post(
    '/v1/councils/:councilId/members/:membershipId/revoke',
    controller.revokeMemberController
  )

  // ============================================================
  // ASSESSMENT WORKFLOW
  // ============================================================

  // GET /v1/councils/:councilId/assessments - List council assessments
  fastify.get(
    '/v1/councils/:councilId/assessments',
    controller.listCouncilAssessmentsController
  )

  // POST /v1/assessments/:assessmentId/council/assign - Assign to council
  fastify.post(
    '/v1/assessments/:assessmentId/council/assign',
    controller.assignAssessmentController
  )

  // DELETE /v1/assessments/:assessmentId/council/assign - Unassign from council
  fastify.delete(
    '/v1/assessments/:assessmentId/council/assign',
    controller.unassignAssessmentController
  )

  // POST /v1/assessments/:assessmentId/council/decision - Submit decision
  fastify.post(
    '/v1/assessments/:assessmentId/council/decision',
    controller.submitDecisionController
  )

  // GET /v1/assessments/:assessmentId/council/approvals - List approvals
  fastify.get(
    '/v1/assessments/:assessmentId/council/approvals',
    controller.listApprovalsController
  )

  // ============================================================
  // EVIDENCE LEDGER
  // ============================================================

  // GET /v1/assessments/:assessmentId/ledger - Get ledger entries
  fastify.get('/v1/assessments/:assessmentId/ledger', controller.getLedgerController)

  // POST /v1/assessments/:assessmentId/ledger - Append ledger entry
  fastify.post('/v1/assessments/:assessmentId/ledger', controller.appendLedgerController)

  // POST /v1/assessments/:assessmentId/ledger/verify - Verify ledger chain
  fastify.post(
    '/v1/assessments/:assessmentId/ledger/verify',
    controller.verifyLedgerController
  )
}
