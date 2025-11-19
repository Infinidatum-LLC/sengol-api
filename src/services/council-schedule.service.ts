/**
 * AI Risk Council - Automated Assessment Service
 * Handles scheduling and execution of automated assessments
 */

import { prisma } from '../lib/prisma'
import { ScheduleFrequency, AssessmentStatus } from '../types/council/common'
import { NotFoundError, DatabaseError } from '../lib/errors'

export class CouncilScheduleService {
  async createSchedule(geographyAccountId: string, scheduleData: any): Promise<any> {
    try {
      return await prisma.council_Schedule.create({
        data: {
          name: scheduleData.name,
          description: scheduleData.description,
          frequency: scheduleData.frequency || ScheduleFrequency.MONTHLY,
          assessmentType: scheduleData.assessmentType,
          policyIds: JSON.stringify(scheduleData.policyIds || []),
          isActive: true,
          nextRunAt: this.calculateNextRun(scheduleData.frequency),
          geographyAccountId,
          metadata: JSON.stringify(scheduleData.metadata || {}),
        },
      })
    } catch (error) {
      throw new DatabaseError('Failed to create schedule', { originalError: error })
    }
  }

  async listSchedules(geographyAccountId: string, limit: number = 10, offset: number = 0): Promise<any> {
    try {
      const [schedules, total] = await Promise.all([
        prisma.council_Schedule.findMany({
          where: { geographyAccountId },
          skip: offset,
          take: limit,
        }),
        prisma.council_Schedule.count({ where: { geographyAccountId } }),
      ])

      return {
        schedules: schedules.map((s) => this.formatSchedule(s)),
        total,
        hasMore: offset + limit < total,
      }
    } catch (error) {
      throw new DatabaseError('Failed to list schedules', { originalError: error })
    }
  }

  async getScheduleById(geographyAccountId: string, scheduleId: string): Promise<any> {
    try {
      const schedule = await prisma.council_Schedule.findFirst({
        where: { id: scheduleId, geographyAccountId },
      })

      if (!schedule) {
        throw new NotFoundError('Schedule not found')
      }

      return this.formatSchedule(schedule)
    } catch (error) {
      if (error instanceof NotFoundError) throw error
      throw new DatabaseError('Failed to get schedule', { originalError: error })
    }
  }

  async updateSchedule(geographyAccountId: string, scheduleId: string, updates: any): Promise<any> {
    try {
      const schedule = await prisma.council_Schedule.update({
        where: { id: scheduleId },
        data: {
          name: updates.name,
          description: updates.description,
          frequency: updates.frequency,
          isActive: updates.isActive,
          policyIds: updates.policyIds ? JSON.stringify(updates.policyIds) : undefined,
          metadata: updates.metadata ? JSON.stringify(updates.metadata) : undefined,
          updatedAt: new Date(),
        },
      })

      return this.formatSchedule(schedule)
    } catch (error) {
      throw new DatabaseError('Failed to update schedule', { originalError: error })
    }
  }

  async deleteSchedule(geographyAccountId: string, scheduleId: string): Promise<void> {
    try {
      await prisma.council_Schedule.delete({
        where: { id: scheduleId },
      })
    } catch (error) {
      throw new DatabaseError('Failed to delete schedule', { originalError: error })
    }
  }

  async executeSchedule(geographyAccountId: string, scheduleId: string): Promise<any> {
    try {
      const schedule = await this.getScheduleById(geographyAccountId, scheduleId)

      const run = await prisma.council_ScheduleRun.create({
        data: {
          scheduleId,
          status: AssessmentStatus.IN_PROGRESS,
          geographyAccountId,
          startedAt: new Date(),
          results: JSON.stringify({}),
        },
      })

      // TODO: Implement actual assessment execution logic
      // For now, just mark as completed
      const completed = await prisma.council_ScheduleRun.update({
        where: { id: run.id },
        data: {
          status: AssessmentStatus.COMPLETED,
          completedAt: new Date(),
          results: JSON.stringify({
            policiesEvaluated: 0,
            violationsFound: 0,
            remediationsRequired: 0,
          }),
        },
      })

      // Update schedule's next run time
      await prisma.council_Schedule.update({
        where: { id: scheduleId },
        data: { nextRunAt: this.calculateNextRun(schedule.frequency) },
      })

      return this.formatRun(completed)
    } catch (error) {
      throw new DatabaseError('Failed to execute schedule', { originalError: error })
    }
  }

  private calculateNextRun(frequency: string): Date {
    const now = new Date()
    const next = new Date(now)

    switch (frequency) {
      case ScheduleFrequency.DAILY:
        next.setDate(next.getDate() + 1)
        break
      case ScheduleFrequency.WEEKLY:
        next.setDate(next.getDate() + 7)
        break
      case ScheduleFrequency.BIWEEKLY:
        next.setDate(next.getDate() + 14)
        break
      case ScheduleFrequency.MONTHLY:
        next.setMonth(next.getMonth() + 1)
        break
      case ScheduleFrequency.QUARTERLY:
        next.setMonth(next.getMonth() + 3)
        break
      case ScheduleFrequency.ANNUALLY:
        next.setFullYear(next.getFullYear() + 1)
        break
      default:
        next.setMonth(next.getMonth() + 1)
    }

    return next
  }

  private formatSchedule(schedule: any): any {
    return {
      ...schedule,
      policyIds: typeof schedule.policyIds === 'string' ? JSON.parse(schedule.policyIds) : schedule.policyIds,
      metadata: typeof schedule.metadata === 'string' ? JSON.parse(schedule.metadata) : schedule.metadata,
    }
  }

  private formatRun(run: any): any {
    return {
      ...run,
      results: typeof run.results === 'string' ? JSON.parse(run.results) : run.results,
    }
  }
}

export const councilScheduleService = new CouncilScheduleService()
