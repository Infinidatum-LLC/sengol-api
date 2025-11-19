/**
 * AI Risk Council - Policy Engine Service
 * Handles policy CRUD, evaluation, and violation tracking
 */

import { prisma } from '../lib/prisma'
import { CreatePolicyRequest, Policy, EvaluatePolicyRequest, EvaluatePolicyResponse, BulkEvaluateRequest, BulkEvaluateResponse } from '../types/council/policies'
import { PolicyStatus, PolicySeverity } from '../types/council/common'
import { ValidationError, NotFoundError, DatabaseError } from '../lib/errors'

export class CouncilPolicyService {
  async createPolicy(geographyAccountId: string, request: CreatePolicyRequest): Promise<Policy> {
    try {
      const policy = await prisma.council_Policy.create({
        data: {
          ...request,
          geographyAccountId,
          status: PolicyStatus.DRAFT,
          version: 1,
          createdBy: 'system',
          conditions: JSON.stringify(request.conditions),
          actions: JSON.stringify(request.actions),
        },
      })

      return this.formatPolicy(policy)
    } catch (error) {
      throw new DatabaseError('Failed to create policy', { originalError: error })
    }
  }

  async listPolicies(
    geographyAccountId: string,
    limit: number = 10,
    offset: number = 0,
    filters?: any
  ): Promise<{ policies: Policy[]; total: number; hasMore: boolean }> {
    try {
      console.log('[CouncilPolicyService] listPolicies called with:', { geographyAccountId, limit, offset, filters })

      const where: any = { geographyAccountId }
      if (filters?.status) where.status = filters.status
      if (filters?.category) where.category = filters.category
      if (filters?.severity) where.severity = filters.severity

      console.log('[CouncilPolicyService] Query where clause:', where)

      const [policies, total] = await Promise.all([
        prisma.council_Policy.findMany({ where, skip: offset, take: limit }),
        prisma.council_Policy.count({ where }),
      ])

      console.log('[CouncilPolicyService] Query result:', { policiesCount: policies.length, total })

      return {
        policies: policies.map((p) => this.formatPolicy(p)),
        total,
        hasMore: offset + limit < total,
      }
    } catch (error) {
      console.error('[CouncilPolicyService] Error in listPolicies:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        error: error,
      })
      throw new DatabaseError('Failed to list policies', { originalError: error })
    }
  }

  async getPolicyById(geographyAccountId: string, policyId: string): Promise<Policy> {
    try {
      const policy = await prisma.council_Policy.findFirst({
        where: { id: policyId, geographyAccountId },
      })

      if (!policy) {
        throw new NotFoundError('Policy not found')
      }

      return this.formatPolicy(policy)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new DatabaseError('Failed to get policy', { originalError: error })
    }
  }

  async updatePolicy(geographyAccountId: string, policyId: string, updates: any): Promise<Policy> {
    try {
      const policy = await prisma.council_Policy.update({
        where: { id: policyId },
        data: {
          ...updates,
          conditions: updates.conditions ? JSON.stringify(updates.conditions) : undefined,
          actions: updates.actions ? JSON.stringify(updates.actions) : undefined,
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      })

      return this.formatPolicy(policy)
    } catch (error) {
      throw new DatabaseError('Failed to update policy', { originalError: error })
    }
  }

  async deletePolicy(geographyAccountId: string, policyId: string): Promise<void> {
    try {
      await prisma.council_Policy.delete({
        where: { id: policyId },
      })
    } catch (error) {
      throw new DatabaseError('Failed to delete policy', { originalError: error })
    }
  }

  async evaluatePolicy(geographyAccountId: string, policyId: string, request: EvaluatePolicyRequest): Promise<EvaluatePolicyResponse> {
    try {
      const policy = await this.getPolicyById(geographyAccountId, policyId)
      const violated = this.evaluateConditions(policy.conditions, request)

      const result: EvaluatePolicyResponse = {
        policyId,
        violated,
        severity: policy.severity,
      }

      if (violated) {
        // Store violation
        await prisma.council_Violation.create({
          data: {
            policyId,
            assessmentId: request.assessmentId,
            status: 'OPEN',
            severity: policy.severity,
            description: `${policy.name} violation detected`,
            geographyAccountId,
          },
        })
      }

      return result
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) throw error
      throw new DatabaseError('Failed to evaluate policy', { originalError: error })
    }
  }

  async bulkEvaluate(geographyAccountId: string, request: BulkEvaluateRequest): Promise<BulkEvaluateResponse> {
    try {
      const where: any = { geographyAccountId }
      if (request.policies?.length) {
        where.id = { in: request.policies }
      }

      const policies = await prisma.council_Policy.findMany({ where })
      const results: EvaluatePolicyResponse[] = []

      for (const policy of policies) {
        const result = await this.evaluatePolicy(geographyAccountId, policy.id, request)
        results.push(result)
      }

      const violatedCount = results.filter((r) => r.violated).length

      return {
        assessmentId: request.assessmentId,
        totalPolicies: policies.length,
        violatedCount,
        passedCount: policies.length - violatedCount,
        results,
        evaluatedAt: new Date().toISOString(),
      }
    } catch (error) {
      throw new DatabaseError('Failed to bulk evaluate policies', { originalError: error })
    }
  }

  private evaluateConditions(conditions: any, context: any): boolean {
    // Simplified condition evaluation - expand based on policy requirements
    if (!conditions || !conditions.conditions) return false

    const operator = conditions.operator || 'AND'
    const results = conditions.conditions.map((cond: any) => {
      const contextValue = context[cond.field]
      return this.compareValues(contextValue, cond.value, cond.operator)
    })

    return operator === 'AND' ? results.every((r: boolean) => r) : results.some((r: boolean) => r)
  }

  private compareValues(actual: any, expected: any, operator: string): boolean {
    switch (operator) {
      case 'EQUALS':
        return actual === expected
      case 'NOT_EQUALS':
        return actual !== expected
      case 'CONTAINS':
        return String(actual).includes(String(expected))
      case 'IN':
        return Array.isArray(expected) && expected.includes(actual)
      default:
        return false
    }
  }

  private formatPolicy(policy: any): Policy {
    return {
      ...policy,
      conditions: typeof policy.conditions === 'string' ? JSON.parse(policy.conditions) : policy.conditions,
      actions: typeof policy.actions === 'string' ? JSON.parse(policy.actions) : policy.actions,
    }
  }
}

export const councilPolicyService = new CouncilPolicyService()
