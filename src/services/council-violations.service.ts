/**
 * AI Risk Council - Violations Service
 * Handles violation management and tracking
 */

import { prisma } from '../lib/prisma'
import { NotFoundError, DatabaseError } from '../lib/errors'

export class CouncilViolationsService {
  async listViolations(
    geographyAccountId: string,
    limit: number = 10,
    offset: number = 0,
    filters?: any
  ): Promise<any> {
    try {
      console.log('[CouncilViolationsService] listViolations called with:', { geographyAccountId, limit, offset, filters })

      const where: any = { geographyAccountId }
      if (filters?.policyId) where.policyId = filters.policyId
      if (filters?.status) where.status = filters.status
      if (filters?.severity) where.severity = filters.severity
      if (filters?.vendorId) where.vendorId = filters.vendorId
      if (filters?.assessmentId) where.assessmentId = filters.assessmentId

      console.log('[CouncilViolationsService] Query where clause:', where)

      const [violations, total] = await Promise.all([
        prisma.council_Violation.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { detectedAt: 'desc' },
          include: {
            policy: {
              select: { id: true, name: true, category: true },
            },
          },
        }),
        prisma.council_Violation.count({ where }),
      ])

      console.log('[CouncilViolationsService] Query result:', { violationsCount: violations.length, total })

      return {
        violations: violations.map((v) => this.formatViolation(v)),
        total,
        hasMore: offset + limit < total,
      }
    } catch (error) {
      console.error('[CouncilViolationsService] Error in listViolations:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        error: error,
      })
      throw new DatabaseError('Failed to list violations', { originalError: error })
    }
  }

  async getViolationById(geographyAccountId: string, violationId: string): Promise<any> {
    try {
      const violation = await prisma.council_Violation.findFirst({
        where: { id: violationId, geographyAccountId },
        include: {
          policy: {
            select: { id: true, name: true, category: true, severity: true },
          },
        },
      })

      if (!violation) {
        throw new NotFoundError('Violation not found')
      }

      return this.formatViolation(violation)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new DatabaseError('Failed to get violation', { originalError: error })
    }
  }

  async updateViolation(geographyAccountId: string, violationId: string, updates: any): Promise<any> {
    try {
      // Verify violation exists
      const violation = await this.getViolationById(geographyAccountId, violationId)

      const updateData: any = {
        status: updates.status,
        updatedAt: new Date(),
      }

      // If resolving the violation, set resolvedAt timestamp
      if (updates.status === 'RESOLVED' && !violation.resolvedAt) {
        updateData.resolvedAt = new Date()
      }

      if (updates.description) updateData.description = updates.description
      if (updates.evidence) updateData.evidence = JSON.stringify(updates.evidence)

      const updated = await prisma.council_Violation.update({
        where: { id: violationId },
        data: updateData,
        include: {
          policy: {
            select: { id: true, name: true, category: true },
          },
        },
      })

      return this.formatViolation(updated)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new DatabaseError('Failed to update violation', { originalError: error })
    }
  }

  async deleteViolation(geographyAccountId: string, violationId: string): Promise<void> {
    try {
      await prisma.council_Violation.delete({
        where: { id: violationId },
      })
    } catch (error) {
      throw new DatabaseError('Failed to delete violation', { originalError: error })
    }
  }

  private formatViolation(violation: any): any {
    return {
      ...violation,
      evidence: typeof violation.evidence === 'string' ? JSON.parse(violation.evidence || '{}') : violation.evidence,
    }
  }
}

export const councilViolationsService = new CouncilViolationsService()
