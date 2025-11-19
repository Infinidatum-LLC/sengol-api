/**
 * AI Risk Council - Vendor Governance Service
 * Handles vendor management and assessment operations
 */

import { prisma } from '../lib/prisma'
import { VendorStatus, AssessmentStatus, AssessmentType } from '../types/council/common'
import { NotFoundError, DatabaseError } from '../lib/errors'

export class CouncilVendorService {
  async createVendor(geographyAccountId: string, vendorData: any): Promise<any> {
    try {
      return await prisma.council_Vendor.create({
        data: {
          name: vendorData.name,
          type: vendorData.type,
          status: VendorStatus.ACTIVE,
          geographyAccountId,
          riskLevel: 'MEDIUM',
          lastAssessmentDate: null,
          metadata: JSON.stringify(vendorData.metadata || {}),
        },
      })
    } catch (error) {
      throw new DatabaseError('Failed to create vendor', { originalError: error })
    }
  }

  async listVendors(geographyAccountId: string, limit: number = 10, offset: number = 0): Promise<any> {
    try {
      console.log('[CouncilVendorService] listVendors called with:', { geographyAccountId, limit, offset })

      const [vendors, total] = await Promise.all([
        prisma.council_Vendor.findMany({
          where: { geographyAccountId },
          skip: offset,
          take: limit,
        }),
        prisma.council_Vendor.count({ where: { geographyAccountId } }),
      ])

      console.log('[CouncilVendorService] Query result:', { vendorsCount: vendors.length, total })

      return {
        vendors: vendors.map((v) => this.formatVendor(v)),
        total,
        hasMore: offset + limit < total,
      }
    } catch (error) {
      console.error('[CouncilVendorService] Error in listVendors:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        error: error,
      })
      throw new DatabaseError('Failed to list vendors', { originalError: error })
    }
  }

  async getVendorById(geographyAccountId: string, vendorId: string): Promise<any> {
    try {
      const vendor = await prisma.council_Vendor.findFirst({
        where: { id: vendorId, geographyAccountId },
      })

      if (!vendor) {
        throw new NotFoundError('Vendor not found')
      }

      return this.formatVendor(vendor)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new DatabaseError('Failed to get vendor', { originalError: error })
    }
  }

  async updateVendor(geographyAccountId: string, vendorId: string, updates: any): Promise<any> {
    try {
      const vendor = await prisma.council_Vendor.update({
        where: { id: vendorId },
        data: {
          name: updates.name,
          status: updates.status,
          riskLevel: updates.riskLevel,
          metadata: updates.metadata ? JSON.stringify(updates.metadata) : undefined,
          updatedAt: new Date(),
        },
      })

      return this.formatVendor(vendor)
    } catch (error) {
      throw new DatabaseError('Failed to update vendor', { originalError: error })
    }
  }

  async deleteVendor(geographyAccountId: string, vendorId: string): Promise<void> {
    try {
      await prisma.council_Vendor.delete({
        where: { id: vendorId },
      })
    } catch (error) {
      throw new DatabaseError('Failed to delete vendor', { originalError: error })
    }
  }

  async assessVendor(geographyAccountId: string, vendorId: string, assessmentData: any): Promise<any> {
    try {
      const assessment = await prisma.council_VendorAssessment.create({
        data: {
          vendorId,
          type: assessmentData.type || AssessmentType.SECURITY,
          status: AssessmentStatus.IN_PROGRESS,
          geographyAccountId,
          questions: JSON.stringify(assessmentData.questions || []),
          results: JSON.stringify(assessmentData.results || {}),
          overallScore: assessmentData.overallScore || 0,
        },
      })

      // Update vendor's last assessment date
      await prisma.council_Vendor.update({
        where: { id: vendorId },
        data: { lastAssessmentDate: new Date() },
      })

      return this.formatAssessment(assessment)
    } catch (error) {
      throw new DatabaseError('Failed to assess vendor', { originalError: error })
    }
  }

  async getAssessmentById(geographyAccountId: string, vendorId: string, assessmentId: string): Promise<any> {
    try {
      const assessment = await prisma.council_VendorAssessment.findFirst({
        where: { id: assessmentId, vendorId, geographyAccountId },
      })

      if (!assessment) {
        throw new NotFoundError('Assessment not found')
      }

      return this.formatAssessment(assessment)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new DatabaseError('Failed to get assessment', { originalError: error })
    }
  }

  async createScorecard(geographyAccountId: string, vendorId: string, scorecardData: any): Promise<any> {
    try {
      const scorecard = await prisma.council_VendorScorecard.create({
        data: {
          vendorId,
          assessmentPeriod: scorecardData.assessmentPeriod,
          overallScore: scorecardData.overallScore,
          securityScore: scorecardData.securityScore || 0,
          complianceScore: scorecardData.complianceScore || 0,
          operationalScore: scorecardData.operationalScore || 0,
          geographyAccountId,
          metadata: JSON.stringify(scorecardData.metadata || {}),
        },
      })

      return this.formatScorecard(scorecard)
    } catch (error) {
      throw new DatabaseError('Failed to create scorecard', { originalError: error })
    }
  }

  async listScorecards(geographyAccountId: string, vendorId: string, limit: number = 10, offset: number = 0): Promise<any> {
    try {
      const [scorecards, total] = await Promise.all([
        prisma.council_VendorScorecard.findMany({
          where: { vendorId, geographyAccountId },
          skip: offset,
          take: limit,
        }),
        prisma.council_VendorScorecard.count({ where: { vendorId, geographyAccountId } }),
      ])

      return {
        scorecards: scorecards.map((s) => this.formatScorecard(s)),
        total,
        hasMore: offset + limit < total,
      }
    } catch (error) {
      throw new DatabaseError('Failed to list scorecards', { originalError: error })
    }
  }

  private formatVendor(vendor: any): any {
    return {
      ...vendor,
      metadata: typeof vendor.metadata === 'string' ? JSON.parse(vendor.metadata) : vendor.metadata,
    }
  }

  private formatAssessment(assessment: any): any {
    return {
      ...assessment,
      questions: typeof assessment.questions === 'string' ? JSON.parse(assessment.questions) : assessment.questions,
      results: typeof assessment.results === 'string' ? JSON.parse(assessment.results) : assessment.results,
    }
  }

  private formatScorecard(scorecard: any): any {
    return {
      ...scorecard,
      metadata: typeof scorecard.metadata === 'string' ? JSON.parse(scorecard.metadata) : scorecard.metadata,
    }
  }
}

export const councilVendorService = new CouncilVendorService()
