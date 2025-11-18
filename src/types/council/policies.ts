/**
 * AI Risk Council - Policy Engine Types
 */

import {
  PolicyCategory,
  PolicyStatus,
  PolicySeverity,
  PolicyType,
  PolicyScope,
  EnforcementMode,
  PolicyConditionGroup,
  PolicyActions,
  PaginationParams,
  PaginationResponse,
} from './common'

export interface CreatePolicyRequest {
  name: string
  description: string
  category: PolicyCategory
  severity: PolicySeverity
  policyType: PolicyType
  scope: PolicyScope
  jurisdictions?: string[]
  industries?: string[]
  conditions: PolicyConditionGroup
  enforcementMode: EnforcementMode
  autoRemediate: boolean
  actions: PolicyActions
}

export interface Policy extends CreatePolicyRequest {
  id: string
  status: PolicyStatus
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
  lastReviewedAt?: string
  reviewedBy?: string
  geographyAccountId: string
  violationCount?: number
  lastEvaluatedAt?: string
}

export interface PolicyListResponse {
  policies: Policy[]
  pagination: PaginationResponse
}

export interface ListPoliciesQuery extends PaginationParams {
  category?: PolicyCategory
  status?: PolicyStatus
  severity?: PolicySeverity
}

export interface UpdatePolicyRequest {
  name?: string
  description?: string
  category?: PolicyCategory
  severity?: PolicySeverity
  policyType?: PolicyType
  scope?: PolicyScope
  jurisdictions?: string[]
  industries?: string[]
  conditions?: PolicyConditionGroup
  enforcementMode?: EnforcementMode
  autoRemediate?: boolean
  actions?: PolicyActions
  status?: PolicyStatus
}

export interface EvaluatePolicyRequest {
  assessmentId: string
  systemDescription?: string
  industry?: string
  jurisdictions?: string[]
  dataTypes?: string[]
  techStack?: string[]
}

export interface EvaluatePolicyResponse {
  policyId: string
  violated: boolean
  violations?: Array<{
    field: string
    operator: string
    expectedValue: string | string[]
    actualValue: string | string[]
  }>
  evidence?: Record<string, any>
  severity: PolicySeverity
}

export interface BulkEvaluateRequest {
  assessmentId: string
  policies?: string[] // specific policy IDs to evaluate
  systemDescription?: string
  industry?: string
  jurisdictions?: string[]
  dataTypes?: string[]
  techStack?: string[]
}

export interface BulkEvaluateResponse {
  assessmentId: string
  totalPolicies: number
  violatedCount: number
  passedCount: number
  results: EvaluatePolicyResponse[]
  evaluatedAt: string
}

export interface ListViolationsQuery extends PaginationParams {
  policyId?: string
  assessmentId?: string
  vendorId?: string
  status?: string
  severity?: PolicySeverity
}

export interface ViolationResponse {
  id: string
  policyId: string
  assessmentId?: string
  vendorId?: string
  status: string
  severity: PolicySeverity
  detectedAt: string
  resolvedAt?: string
  description: string
  evidence?: Record<string, any>
}

export interface ListViolationsResponse {
  violations: ViolationResponse[]
  pagination: PaginationResponse
}

export interface UpdateViolationRequest {
  status?: string
  notes?: string
  resolvedAt?: string
}
