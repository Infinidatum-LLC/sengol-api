/**
 * Council Service
 *
 * Handles business logic for AI Risk Council governance:
 * - Council lifecycle management
 * - Membership administration
 * - Risk approval workflows
 * - Tamper-evident evidence ledger with SHA-256 hash chaining
 */

import { prisma } from '../lib/prisma'
import { createHash } from 'crypto'
import type {
  Council,
  CouncilMembership,
  RiskApproval,
  EvidenceLedgerEntry,
  CouncilStatus,
  CouncilRole,
  MembershipStatus,
  ApprovalStatus,
  LedgerEntryType
} from '@prisma/client'

// ============================================================
// TYPES
// ============================================================

export interface CreateCouncilInput {
  name: string
  description?: string
  orgId?: string
  approvalPolicy?: any
  quorum?: number
  requireUnanimous?: boolean
  metadata?: any
}

export interface UpdateCouncilInput {
  name?: string
  description?: string
  approvalPolicy?: any
  quorum?: number
  requireUnanimous?: boolean
  metadata?: any
  status?: CouncilStatus
}

export interface AddMemberInput {
  userId: string
  role: CouncilRole
  permissions?: any
  notes?: string
  assignedBy: string
}

export interface SubmitApprovalInput {
  assessmentId: string
  councilId: string
  membershipId: string
  partnerId: string
  step: string
  status: ApprovalStatus
  decisionNotes?: string
  reasonCodes?: string[]
  evidenceSnapshotId?: string
  attachments?: any[]
  actorId: string
  actorRole: string
}

export interface AppendLedgerInput {
  assessmentId: string
  councilId?: string
  membershipId?: string
  approvalId?: string
  actorId?: string
  actorRole: string
  entryType: LedgerEntryType
  payload: any
}

// ============================================================
// HASH CHAIN UTILITIES
// ============================================================

/**
 * Compute SHA-256 hash for ledger entry
 */
export function computeEntryHash(entry: {
  assessmentId: string
  entryType: string
  payload: any
  prevHash: string | null
  createdAt: Date
}): string {
  // Canonical JSON representation for consistent hashing
  const canonical = JSON.stringify({
    assessmentId: entry.assessmentId,
    entryType: entry.entryType,
    payload: entry.payload,
    prevHash: entry.prevHash,
    timestamp: entry.createdAt.toISOString()
  }, Object.keys(entry).sort())

  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Verify the integrity of the entire ledger chain
 */
export async function verifyLedgerChain(assessmentId: string): Promise<{
  verified: boolean
  failureIndex?: number
  expectedHash?: string
  actualHash?: string
}> {
  const entries = await prisma.evidenceLedgerEntry.findMany({
    where: { assessmentId },
    orderBy: { createdAt: 'asc' }
  })

  if (entries.length === 0) {
    return { verified: true }
  }

  // Verify first entry has null prevHash
  if (entries[0].prevHash !== null) {
    return {
      verified: false,
      failureIndex: 0,
      expectedHash: 'null',
      actualHash: entries[0].prevHash
    }
  }

  // Verify each subsequent entry
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const expectedHash = computeEntryHash({
      assessmentId: entry.assessmentId,
      entryType: entry.entryType,
      payload: entry.payload,
      prevHash: entry.prevHash,
      createdAt: entry.createdAt
    })

    if (entry.hash !== expectedHash) {
      return {
        verified: false,
        failureIndex: i,
        expectedHash,
        actualHash: entry.hash
      }
    }

    // Verify hash chain linkage
    if (i > 0 && entry.prevHash !== entries[i - 1].hash) {
      return {
        verified: false,
        failureIndex: i,
        expectedHash: entries[i - 1].hash,
        actualHash: entry.prevHash ?? undefined
      }
    }
  }

  return { verified: true }
}

// ============================================================
// COUNCIL MANAGEMENT
// ============================================================

export async function createCouncil(input: CreateCouncilInput): Promise<Council> {
  return await prisma.council.create({
    data: {
      name: input.name,
      description: input.description,
      orgId: input.orgId,
      approvalPolicy: input.approvalPolicy || null,
      quorum: input.quorum || 1,
      requireUnanimous: input.requireUnanimous || false,
      metadata: input.metadata || null,
      status: 'ACTIVE'
    }
  })
}

export async function getCouncil(councilId: string, includeRevoked = false) {
  const council = await prisma.council.findUnique({
    where: { id: councilId },
    include: {
      memberships: includeRevoked ? true : {
        where: { status: { not: 'REVOKED' } }
      },
      _count: {
        select: {
          riskAssessments: true,
          approvals: true
        }
      }
    }
  })

  return council
}

export async function listCouncils(params: {
  status?: CouncilStatus
  orgId?: string
  cursor?: string
  limit?: number
}) {
  const { status, orgId, cursor, limit = 20 } = params

  const where: any = {}
  if (status) where.status = status
  if (orgId) where.orgId = orgId

  const councils = await prisma.council.findMany({
    where,
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      _count: {
        select: {
          memberships: true,
          riskAssessments: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return councils
}

export async function updateCouncil(
  councilId: string,
  input: UpdateCouncilInput
): Promise<Council> {
  return await prisma.council.update({
    where: { id: councilId },
    data: input
  })
}

export async function archiveCouncil(councilId: string): Promise<Council> {
  return await prisma.council.update({
    where: { id: councilId },
    data: { status: 'ARCHIVED' }
  })
}

// ============================================================
// MEMBERSHIP MANAGEMENT
// ============================================================

export async function addOrReactivateMember(
  councilId: string,
  input: AddMemberInput
): Promise<CouncilMembership> {
  // Check if membership already exists
  const existing = await prisma.councilMembership.findUnique({
    where: {
      councilId_userId: {
        councilId,
        userId: input.userId
      }
    }
  })

  if (existing) {
    // Reactivate existing membership
    return await prisma.councilMembership.update({
      where: { id: existing.id },
      data: {
        status: 'ACTIVE',
        role: input.role,
        permissions: input.permissions,
        notes: input.notes,
        assignedBy: input.assignedBy,
        assignedAt: new Date(),
        revokedAt: null
      }
    })
  }

  // Create new membership
  return await prisma.councilMembership.create({
    data: {
      councilId,
      userId: input.userId,
      role: input.role,
      status: 'ACTIVE',
      permissions: input.permissions || null,
      assignedBy: input.assignedBy,
      notes: input.notes
    }
  })
}

export async function updateMembership(
  membershipId: string,
  updates: {
    role?: CouncilRole
    status?: MembershipStatus
    permissions?: any
    notes?: string
  }
): Promise<CouncilMembership> {
  const data: any = { ...updates }

  if (updates.status === 'REVOKED') {
    data.revokedAt = new Date()
  }

  return await prisma.councilMembership.update({
    where: { id: membershipId },
    data
  })
}

export async function revokeMembership(
  membershipId: string,
  notes?: string
): Promise<CouncilMembership> {
  return await prisma.councilMembership.update({
    where: { id: membershipId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      notes
    }
  })
}

export async function listMembers(
  councilId: string,
  status?: MembershipStatus
) {
  const where: any = { councilId }
  if (status) where.status = status

  return await prisma.councilMembership.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// ============================================================
// APPROVAL WORKFLOW
// ============================================================

export async function submitApproval(
  input: SubmitApprovalInput
): Promise<{ approval: RiskApproval; ledgerEntry: EvidenceLedgerEntry }> {
  // Execute in transaction to ensure atomicity
  return await prisma.$transaction(async (tx) => {
    // 1. Create approval record
    const approval = await tx.riskApproval.create({
      data: {
        assessmentId: input.assessmentId,
        councilId: input.councilId,
        membershipId: input.membershipId,
        partnerId: input.partnerId,
        step: input.step,
        status: input.status,
        decisionNotes: input.decisionNotes || undefined,
        reasonCodes: input.reasonCodes || [],
        evidenceSnapshotId: input.evidenceSnapshotId || undefined,
        attachments: input.attachments || undefined
      }
    })

    // 2. Create ledger entry
    const ledgerEntry = await appendToLedger(
      {
        assessmentId: input.assessmentId,
        councilId: input.councilId,
        membershipId: input.membershipId,
        approvalId: approval.id,
        actorId: input.actorId,
        actorRole: input.actorRole,
        entryType: input.status === 'APPROVED' ? 'APPROVAL' : 'REJECTION',
        payload: {
          step: input.step,
          status: input.status,
          notes: input.decisionNotes,
          reasonCodes: input.reasonCodes
        }
      },
      tx
    )

    return { approval, ledgerEntry }
  })
}

export async function listApprovals(assessmentId: string) {
  return await prisma.riskApproval.findMany({
    where: { assessmentId },
    include: {
      membership: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      },
      council: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { decidedAt: 'desc' }
  })
}

export async function listCouncilAssessments(
  councilId: string,
  status?: ApprovalStatus,
  cursor?: string,
  limit = 20
) {
  const assessments = await prisma.riskAssessment.findMany({
    where: {
      councilId,
      ...(status && {
        approvals: {
          some: { status }
        }
      })
    },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      approvals: {
        include: {
          membership: {
            include: {
              user: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        }
      },
      _count: {
        select: {
          approvals: true,
          ledgerEntries: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return assessments
}

export async function assignAssessmentToCouncil(
  assessmentId: string,
  councilId: string
) {
  return await prisma.riskAssessment.update({
    where: { id: assessmentId },
    data: { councilId }
  })
}

export async function unassignAssessmentFromCouncil(assessmentId: string) {
  return await prisma.riskAssessment.update({
    where: { id: assessmentId },
    data: { councilId: null }
  })
}

// ============================================================
// EVIDENCE LEDGER
// ============================================================

export async function appendToLedger(
  input: AppendLedgerInput,
  tx: any = prisma
): Promise<EvidenceLedgerEntry> {
  // Get the last entry to compute hash chain
  const lastEntry = await tx.evidenceLedgerEntry.findFirst({
    where: { assessmentId: input.assessmentId },
    orderBy: { createdAt: 'desc' }
  })

  const prevHash = lastEntry?.hash || null
  const createdAt = new Date()

  // Compute hash for this entry
  const hash = computeEntryHash({
    assessmentId: input.assessmentId,
    entryType: input.entryType,
    payload: input.payload,
    prevHash,
    createdAt
  })

  // Create ledger entry
  return await tx.evidenceLedgerEntry.create({
    data: {
      assessmentId: input.assessmentId,
      councilId: input.councilId,
      membershipId: input.membershipId,
      approvalId: input.approvalId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      entryType: input.entryType,
      payload: input.payload,
      hash,
      prevHash,
      createdAt
    }
  })
}

export async function getLedger(
  assessmentId: string,
  params: {
    entryType?: LedgerEntryType[]
    cursor?: string
    limit?: number
  } = {}
) {
  const { entryType, cursor, limit = 50 } = params

  const where: any = { assessmentId }
  if (entryType && entryType.length > 0) {
    where.entryType = { in: entryType }
  }

  return await prisma.evidenceLedgerEntry.findMany({
    where,
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      council: {
        select: { id: true, name: true }
      },
      membership: {
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  })
}

// ============================================================
// BUSINESS LOGIC - QUORUM & CONSENSUS
// ============================================================

/**
 * Check if assessment meets council approval requirements
 */
export async function checkApprovalStatus(assessmentId: string): Promise<{
  approved: boolean
  rejected: boolean
  pending: boolean
  quorumMet: boolean
  totalApprovals: number
  totalRejections: number
  totalPending: number
  requiredQuorum: number
  requiresUnanimous: boolean
}> {
  const assessment = await prisma.riskAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      council: true,
      approvals: {
        where: {
          membership: {
            status: 'ACTIVE'
          }
        }
      }
    }
  })

  if (!assessment || !assessment.council) {
    throw new Error('Assessment not assigned to council')
  }

  const { council, approvals } = assessment

  const totalApprovals = approvals.filter(a => a.status === 'APPROVED').length
  const totalRejections = approvals.filter(a => a.status === 'REJECTED').length
  const totalPending = approvals.filter(a => a.status === 'PENDING').length

  const quorumMet = (totalApprovals + totalRejections) >= council.quorum
  const requiresUnanimous = council.requireUnanimous

  let approved = false
  let rejected = false

  if (requiresUnanimous) {
    // All votes must be approvals
    approved = quorumMet && totalRejections === 0 && totalApprovals >= council.quorum
    rejected = totalRejections > 0
  } else {
    // Simple quorum majority
    approved = totalApprovals >= council.quorum
    rejected = totalRejections > 0 && totalApprovals < council.quorum
  }

  return {
    approved,
    rejected,
    pending: !approved && !rejected,
    quorumMet,
    totalApprovals,
    totalRejections,
    totalPending,
    requiredQuorum: council.quorum,
    requiresUnanimous
  }
}
