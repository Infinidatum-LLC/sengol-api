/**
 * Compliance Alerts Controller
 *
 * Handles compliance alert CRUD operations and status management.
 *
 * Created: November 2025
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { selectOne, selectMany, insertOne, updateOne, count } from '../lib/db-queries'

// ============================================================================
// TYPES
// ============================================================================

interface ComplianceAlert {
  id: string
  userId: string
  regulationCode: string
  changeType: string
  alertType: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  impactScore: number
  title: string
  summary: string
  actionRequired: boolean
  recommendedActions: string[]
  affectedProjectIds: string[]
  affectedSystemTypes: string[]
  status: 'unread' | 'read' | 'snoozed' | 'dismissed' | 'actioned'
  snoozedUntil?: Date | null
  readAt?: Date | null
  dismissedAt?: Date | null
  actionedAt?: Date | null
  actionTaken: boolean
  actionNotes?: string | null
  deadline?: Date | null
  expiresAt?: Date | null
  deliveredVia: string[]
  createdAt: Date
  updatedAt: Date
}

interface User {
  id: string
  email: string
  regulatoryProfile?: {
    userId: string
  } | null
}

// ============================================================================
// CONTROLLER FUNCTIONS
// ============================================================================

/**
 * GET /api/compliance/alerts - List user's compliance alerts
 */
export async function listComplianceAlerts(
  request: FastifyRequest<{
    Querystring: {
      status?: string
      severity?: string
      limit?: string
      offset?: string
    }
  }>,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { status, severity, limit: limitStr, offset: offsetStr } = request.query
    const limit = parseInt(limitStr || '50')
    const offset = parseInt(offsetStr || '0')

    const where: any = {
      userId,
    }

    if (status) {
      where.status = status
    }

    if (severity) {
      where.severity = severity
    }

    // Don't show snoozed alerts unless explicitly requested
    if (status !== 'snoozed') {
      where.OR = [
        { snoozedUntil: null },
        { snoozedUntil: { lte: new Date() } },
      ]
    }

    const [alerts, total, unreadCount] = await Promise.all([
      selectMany<ComplianceAlert>('ComplianceAlert', where, limit, offset),
      count('ComplianceAlert', where),
      count('ComplianceAlert', {
        userId,
        status: 'unread',
      }),
    ])

    // Severity order map for proper sorting
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    alerts.sort((a, b) => {
      const aSeverity = severityOrder[a.severity as keyof typeof severityOrder] ?? 999
      const bSeverity = severityOrder[b.severity as keyof typeof severityOrder] ?? 999
      if (aSeverity !== bSeverity) return aSeverity - bSeverity
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return reply.send({
      alerts,
      total,
      unreadCount,
      limit,
      offset,
      hasMore: offset + alerts.length < total,
    })
  } catch (error) {
    console.error('[Alerts] Error listing alerts:', error)
    return reply.status(500).send({
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * POST /api/compliance/alerts - Create new compliance alert
 */
export async function createComplianceAlert(
  request: FastifyRequest<{
    Body: {
      userId: string
      regulationCode: string
      changeType: string
      alertType: string
      severity: 'critical' | 'high' | 'medium' | 'low'
      impactScore: number
      title: string
      summary: string
      actionRequired?: boolean
      recommendedActions?: string[]
      affectedProjectIds?: string[]
      affectedSystemTypes?: string[]
      deadline?: string
      expiresAt?: string
    }
  }>,
  reply: FastifyReply
) {
  try {
    const {
      userId,
      regulationCode,
      changeType,
      alertType,
      severity,
      impactScore,
      title,
      summary,
      actionRequired,
      recommendedActions,
      affectedProjectIds,
      affectedSystemTypes,
      deadline,
      expiresAt,
    } = request.body

    // Validate required fields
    if (!userId || !regulationCode || !alertType || !severity || !title || !summary) {
      return reply.status(400).send({
        error: 'Invalid request body',
        message:
          'userId, regulationCode, alertType, severity, title, and summary are required',
      })
    }

    // Create alert
    const alert = await insertOne<ComplianceAlert>('ComplianceAlert', {
      userId,
      regulationCode,
      changeType,
      alertType,
      severity,
      impactScore,
      title,
      summary,
      actionRequired: actionRequired || false,
      recommendedActions: recommendedActions || [],
      affectedProjectIds: affectedProjectIds || [],
      affectedSystemTypes: affectedSystemTypes || [],
      deadline: deadline ? new Date(deadline) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: 'unread',
      actionTaken: false,
      deliveredVia: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    console.log(`[Alerts] Created alert ${alert.id} for user ${userId}`)

    return reply.status(201).send({
      alert,
    })
  } catch (error) {
    console.error('[Alerts] Error creating alert:', error)
    return reply.status(500).send({
      error: 'Failed to create alert',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * PATCH /api/compliance/alerts/:id - Update alert status
 */
export async function updateComplianceAlert(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      action: 'mark-read' | 'snooze' | 'dismiss' | 'action-taken'
      snoozedUntil?: string
      actionNotes?: string
    }
  }>,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { id } = request.params
    const { action, snoozedUntil, actionNotes } = request.body

    // Validate action
    if (!['mark-read', 'snooze', 'dismiss', 'action-taken'].includes(action)) {
      return reply.status(400).send({
        error: 'Invalid action',
        message: 'Action must be one of: mark-read, snooze, dismiss, action-taken',
      })
    }

    // Verify alert belongs to user
    const alert = await selectOne<ComplianceAlert>('ComplianceAlert', {
      id,
      userId,
    })

    if (!alert) {
      return reply.status(404).send({
        error: 'Alert not found',
      })
    }

    const updateData: any = {
      updatedAt: new Date(),
    }

    switch (action) {
      case 'mark-read':
        updateData.status = 'read'
        updateData.readAt = new Date()
        break
      case 'snooze':
        updateData.status = 'snoozed'
        updateData.snoozedUntil = snoozedUntil ? new Date(snoozedUntil) : null
        break
      case 'dismiss':
        updateData.status = 'dismissed'
        updateData.dismissedAt = new Date()
        break
      case 'action-taken':
        updateData.status = 'actioned'
        updateData.actionTaken = true
        updateData.actionedAt = new Date()
        if (actionNotes) updateData.actionNotes = actionNotes
        break
    }

    const updated = await updateOne<ComplianceAlert>(
      'ComplianceAlert',
      { id, userId },
      updateData
    )

    console.log(`[Alerts] Updated alert ${id} for user ${userId} with action: ${action}`)

    return reply.send({
      alert: updated,
      message: `Alert ${action} successfully`,
    })
  } catch (error) {
    console.error('[Alerts] Error updating alert:', error)
    return reply.status(500).send({
      error: 'Failed to update alert',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
