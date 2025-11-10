/**
 * Council Controllers
 *
 * Handles HTTP requests for AI Risk Council API endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import * as councilService from '../services/council.service'
import * as schemas from '../schemas/council.schemas'
import { AppError } from '../lib/errors'

// ============================================================
// HELPER: Extract User Context
// ============================================================

function getUserContext(request: FastifyRequest): {
  userId: string
  userRole: string
} {
  // TODO: Replace with actual auth middleware extraction
  const userId = (request as any).user?.id || request.headers['x-user-id'] as string
  const userRole = (request as any).user?.role || request.headers['x-user-role'] as string || 'user'

  if (!userId) {
    throw new AppError('Unauthorized', 401, 'UNAUTHORIZED')
  }

  return { userId, userRole }
}

function isAdmin(userRole: string): boolean {
  return userRole === 'admin'
}

function isCouncilRole(userRole: string): boolean {
  return ['admin', 'council_chair', 'council_partner', 'council_observer'].includes(userRole)
}

// ============================================================
// COUNCILS ENDPOINTS
// ============================================================

export async function listCouncilsController(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)

    // Validate query params
    const params = schemas.ListCouncilsSchema.parse(request.query)

    // Only admins or council members can list councils
    if (!isCouncilRole(userRole)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const councils = await councilService.listCouncils(params)

    return reply.send({
      success: true,
      councils,
      pagination: {
        limit: params.limit,
        cursor: councils.length > 0 ? councils[councils.length - 1].id : null
      }
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error listing councils:', error)
    throw new AppError('Failed to list councils', 500, 'INTERNAL_ERROR')
  }
}

export async function getCouncilController(
  request: FastifyRequest<{ Params: { councilId: string }; Querystring: { includeRevoked?: string } }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { councilId } = request.params
    const includeRevoked = request.query.includeRevoked === 'true'

    // Only admins or council members can view councils
    if (!isCouncilRole(userRole)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const council = await councilService.getCouncil(councilId, includeRevoked)

    if (!council) {
      throw new AppError('Council not found', 404, 'NOT_FOUND')
    }

    return reply.send({
      success: true,
      council
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error getting council:', error)
    throw new AppError('Failed to get council', 500, 'INTERNAL_ERROR')
  }
}

export async function createCouncilController(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)

    // Only admins can create councils
    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const input = schemas.CreateCouncilSchema.parse(request.body)

    const council = await councilService.createCouncil(input)

    return reply.code(201).send({
      success: true,
      council
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error creating council:', error)
    throw new AppError('Failed to create council', 500, 'INTERNAL_ERROR')
  }
}

export async function updateCouncilController(
  request: FastifyRequest<{ Params: { councilId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { councilId } = request.params

    // Only admins can update councils
    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const input = schemas.UpdateCouncilSchema.parse(request.body)

    const council = await councilService.updateCouncil(councilId, input)

    return reply.send({
      success: true,
      council
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error updating council:', error)
    throw new AppError('Failed to update council', 500, 'INTERNAL_ERROR')
  }
}

export async function archiveCouncilController(
  request: FastifyRequest<{ Params: { councilId: string } }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { councilId } = request.params

    // Only admins can archive councils
    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const council = await councilService.archiveCouncil(councilId)

    return reply.send({
      success: true,
      council
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error archiving council:', error)
    throw new AppError('Failed to archive council', 500, 'INTERNAL_ERROR')
  }
}

// ============================================================
// MEMBERSHIP ENDPOINTS
// ============================================================

export async function listMembersController(
  request: FastifyRequest<{ Params: { councilId: string }; Querystring: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { councilId } = request.params

    if (!isCouncilRole(userRole)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const params = schemas.ListMembersSchema.parse(request.query)

    const members = await councilService.listMembers(councilId, params.status)

    return reply.send({
      success: true,
      members
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error listing members:', error)
    throw new AppError('Failed to list members', 500, 'INTERNAL_ERROR')
  }
}

export async function addMemberController(
  request: FastifyRequest<{ Params: { councilId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { councilId } = request.params

    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const input = schemas.AddMemberSchema.parse(request.body)

    const membership = await councilService.addOrReactivateMember(councilId, {
      ...input,
      assignedBy: userId
    })

    return reply.code(201).send({
      success: true,
      membership
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error adding member:', error)
    throw new AppError('Failed to add member', 500, 'INTERNAL_ERROR')
  }
}

export async function updateMemberController(
  request: FastifyRequest<{ Params: { councilId: string; membershipId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { membershipId } = request.params

    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const input = schemas.UpdateMembershipSchema.parse(request.body)

    const membership = await councilService.updateMembership(membershipId, input)

    return reply.send({
      success: true,
      membership
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error updating member:', error)
    throw new AppError('Failed to update member', 500, 'INTERNAL_ERROR')
  }
}

export async function revokeMemberController(
  request: FastifyRequest<{ Params: { councilId: string; membershipId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { membershipId } = request.params

    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const input = schemas.RevokeMembershipSchema.parse(request.body)

    const membership = await councilService.revokeMembership(membershipId, input.notes)

    return reply.send({
      success: true,
      membership
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error revoking member:', error)
    throw new AppError('Failed to revoke member', 500, 'INTERNAL_ERROR')
  }
}

// ============================================================
// ASSESSMENT WORKFLOW ENDPOINTS
// ============================================================

export async function listCouncilAssessmentsController(
  request: FastifyRequest<{ Params: { councilId: string }; Querystring: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { councilId } = request.params

    if (!isCouncilRole(userRole)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const params = schemas.ListCouncilAssessmentsSchema.parse(request.query)

    const assessments = await councilService.listCouncilAssessments(
      councilId,
      params.status,
      params.cursor,
      params.limit
    )

    return reply.send({
      success: true,
      assessments,
      pagination: {
        limit: params.limit,
        cursor: assessments.length > 0 ? assessments[assessments.length - 1].id : null
      }
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error listing assessments:', error)
    throw new AppError('Failed to list assessments', 500, 'INTERNAL_ERROR')
  }
}

export async function assignAssessmentController(
  request: FastifyRequest<{ Params: { assessmentId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { assessmentId } = request.params

    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const input = schemas.AssignAssessmentSchema.parse(request.body)

    const assessment = await councilService.assignAssessmentToCouncil(
      assessmentId,
      input.councilId
    )

    return reply.send({
      success: true,
      assessment
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error assigning assessment:', error)
    throw new AppError('Failed to assign assessment', 500, 'INTERNAL_ERROR')
  }
}

export async function unassignAssessmentController(
  request: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { assessmentId } = request.params

    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const assessment = await councilService.unassignAssessmentFromCouncil(assessmentId)

    return reply.send({
      success: true,
      assessment
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error unassigning assessment:', error)
    throw new AppError('Failed to unassign assessment', 500, 'INTERNAL_ERROR')
  }
}

export async function submitDecisionController(
  request: FastifyRequest<{ Params: { assessmentId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { assessmentId } = request.params

    if (!isCouncilRole(userRole)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const input = schemas.SubmitDecisionSchema.parse(request.body)

    // Submit approval with ledger entry
    const result = await councilService.submitApproval({
      assessmentId,
      councilId: input.councilId,
      membershipId: input.membershipId || '', // TODO: Infer from user
      partnerId: userId,
      step: input.step,
      status: input.status,
      decisionNotes: input.notes,
      reasonCodes: input.reasonCodes,
      evidenceSnapshotId: input.evidenceSnapshotId,
      attachments: input.attachments,
      actorId: userId,
      actorRole: userRole
    })

    // Check approval status
    const approvalStatus = await councilService.checkApprovalStatus(assessmentId)

    return reply.send({
      success: true,
      approval: result.approval,
      ledgerEntry: result.ledgerEntry,
      approvalStatus
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error submitting decision:', error)
    throw new AppError('Failed to submit decision', 500, 'INTERNAL_ERROR')
  }
}

export async function listApprovalsController(
  request: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { assessmentId } = request.params

    if (!isCouncilRole(userRole)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const approvals = await councilService.listApprovals(assessmentId)

    return reply.send({
      success: true,
      approvals
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error listing approvals:', error)
    throw new AppError('Failed to list approvals', 500, 'INTERNAL_ERROR')
  }
}

// ============================================================
// LEDGER ENDPOINTS
// ============================================================

export async function getLedgerController(
  request: FastifyRequest<{ Params: { assessmentId: string }; Querystring: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { assessmentId } = request.params

    if (!isCouncilRole(userRole)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const params = schemas.ListLedgerSchema.parse(request.query)

    const entries = await councilService.getLedger(assessmentId, params)

    return reply.send({
      success: true,
      entries,
      pagination: {
        limit: params.limit,
        cursor: entries.length > 0 ? entries[entries.length - 1].id : null
      }
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error getting ledger:', error)
    throw new AppError('Failed to get ledger', 500, 'INTERNAL_ERROR')
  }
}

export async function appendLedgerController(
  request: FastifyRequest<{ Params: { assessmentId: string }; Body: unknown }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { assessmentId } = request.params

    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const input = schemas.AppendLedgerSchema.parse(request.body)

    const entry = await councilService.appendToLedger({
      ...input,
      assessmentId
    } as councilService.AppendLedgerInput)

    return reply.code(201).send({
      success: true,
      entry
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error appending ledger:', error)
    throw new AppError('Failed to append ledger', 500, 'INTERNAL_ERROR')
  }
}

export async function verifyLedgerController(
  request: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  try {
    const { userId, userRole } = getUserContext(request)
    const { assessmentId } = request.params

    if (!isAdmin(userRole)) {
      throw new AppError('Forbidden - Admin access required', 403, 'FORBIDDEN')
    }

    const result = await councilService.verifyLedgerChain(assessmentId)

    return reply.send({
      success: true,
      verification: result
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    console.error('[CouncilController] Error verifying ledger:', error)
    throw new AppError('Failed to verify ledger', 500, 'INTERNAL_ERROR')
  }
}
