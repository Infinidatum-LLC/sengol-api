/**
 * Zod validation schemas for Council API endpoints
 */

import { z } from 'zod'

// ============================================================
// ENUMS
// ============================================================

export const CouncilStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'SUSPENDED'])
export const CouncilRoleSchema = z.enum(['CHAIR', 'PARTNER', 'OBSERVER'])
export const MembershipStatusSchema = z.enum(['ACTIVE', 'REVOKED', 'SUSPENDED'])
export const ApprovalStatusSchema = z.enum(['APPROVED', 'REJECTED', 'PENDING', 'CONDITIONAL'])
export const LedgerEntryTypeSchema = z.enum([
  'APPROVAL',
  'REJECTION',
  'STATUS_CHANGE',
  'ASSIGNMENT',
  'MEMBER_ADDED',
  'MEMBER_REVOKED',
  'POLICY_CHANGE',
  'SYSTEM_EVENT'
])

// ============================================================
// COUNCIL SCHEMAS
// ============================================================

export const CreateCouncilSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  orgId: z.string().optional(),
  approvalPolicy: z.any().optional(),
  quorum: z.number().int().min(1).default(1),
  requireUnanimous: z.boolean().default(false),
  metadata: z.any().optional()
})

export const UpdateCouncilSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  approvalPolicy: z.any().optional(),
  quorum: z.number().int().min(1).optional(),
  requireUnanimous: z.boolean().optional(),
  metadata: z.any().optional(),
  status: CouncilStatusSchema.optional()
})

export const ListCouncilsSchema = z.object({
  status: CouncilStatusSchema.optional(),
  orgId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20)
})

// ============================================================
// MEMBERSHIP SCHEMAS
// ============================================================

export const AddMemberSchema = z.object({
  userId: z.string(),
  role: CouncilRoleSchema,
  permissions: z.any().optional(),
  notes: z.string().optional()
})

export const UpdateMembershipSchema = z.object({
  role: CouncilRoleSchema.optional(),
  status: MembershipStatusSchema.optional(),
  permissions: z.any().optional(),
  notes: z.string().optional()
})

export const RevokeMembershipSchema = z.object({
  notes: z.string().optional()
})

export const ListMembersSchema = z.object({
  status: MembershipStatusSchema.optional()
})

// ============================================================
// ASSESSMENT WORKFLOW SCHEMAS
// ============================================================

export const AssignAssessmentSchema = z.object({
  councilId: z.string()
})

export const SubmitDecisionSchema = z.object({
  councilId: z.string(),
  membershipId: z.string().optional(), // Can be inferred from caller
  step: z.string(),
  status: ApprovalStatusSchema,
  notes: z.string().optional(),
  reasonCodes: z.array(z.string()).default([]),
  evidenceSnapshotId: z.string().optional(),
  attachments: z.array(z.object({
    storageKey: z.string(),
    filename: z.string(),
    contentType: z.string(),
    size: z.number()
  })).optional()
})

export const ListCouncilAssessmentsSchema = z.object({
  status: ApprovalStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20)
})

// ============================================================
// LEDGER SCHEMAS
// ============================================================

export const AppendLedgerSchema = z.object({
  councilId: z.string().optional(),
  membershipId: z.string().optional(),
  approvalId: z.string().optional(),
  actorId: z.string().optional(),
  actorRole: z.string(),
  entryType: LedgerEntryTypeSchema,
  payload: z.any()
})

export const ListLedgerSchema = z.object({
  entryType: z.array(LedgerEntryTypeSchema).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50)
})

// ============================================================
// TYPE EXPORTS
// ============================================================

export type CreateCouncilInput = z.infer<typeof CreateCouncilSchema>
export type UpdateCouncilInput = z.infer<typeof UpdateCouncilSchema>
export type ListCouncilsInput = z.infer<typeof ListCouncilsSchema>
export type AddMemberInput = z.infer<typeof AddMemberSchema>
export type UpdateMembershipInput = z.infer<typeof UpdateMembershipSchema>
export type SubmitDecisionInput = z.infer<typeof SubmitDecisionSchema>
export type ListCouncilAssessmentsInput = z.infer<typeof ListCouncilAssessmentsSchema>
export type AppendLedgerInput = z.infer<typeof AppendLedgerSchema>
export type ListLedgerInput = z.infer<typeof ListLedgerSchema>
