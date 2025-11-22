/**
 * Compliance Alerts Routes
 *
 * API endpoints for compliance alert management (CRUD operations).
 *
 * Created: November 2025
 */

import { FastifyInstance } from 'fastify'
import {
  listComplianceAlerts,
  createComplianceAlert,
  updateComplianceAlert,
} from '../controllers/alerts.controller'

export async function alertsRoutes(fastify: FastifyInstance) {
  // List all user compliance alerts
  fastify.get('/compliance/alerts', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter by alert status (unread, read, snoozed, dismissed, actioned)',
          },
          severity: {
            type: 'string',
            description: 'Filter by severity (critical, high, medium, low)',
          },
          limit: { type: 'string', description: 'Number of results to return (default: 50)' },
          offset: { type: 'string', description: 'Number of results to skip (default: 0)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  userId: { type: 'string' },
                  regulationCode: { type: 'string' },
                  changeType: { type: 'string' },
                  alertType: { type: 'string' },
                  severity: { type: 'string' },
                  impactScore: { type: 'number' },
                  title: { type: 'string' },
                  summary: { type: 'string' },
                  actionRequired: { type: 'boolean' },
                  recommendedActions: { type: 'array', items: { type: 'string' } },
                  affectedProjectIds: { type: 'array', items: { type: 'string' } },
                  affectedSystemTypes: { type: 'array', items: { type: 'string' } },
                  status: { type: 'string' },
                  snoozedUntil: { type: ['string', 'null'], format: 'date-time' },
                  readAt: { type: ['string', 'null'], format: 'date-time' },
                  dismissedAt: { type: ['string', 'null'], format: 'date-time' },
                  actionedAt: { type: ['string', 'null'], format: 'date-time' },
                  actionTaken: { type: 'boolean' },
                  actionNotes: { type: ['string', 'null'] },
                  deadline: { type: ['string', 'null'], format: 'date-time' },
                  expiresAt: { type: ['string', 'null'], format: 'date-time' },
                  deliveredVia: { type: 'array', items: { type: 'string' } },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'number' },
            unreadCount: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' },
            hasMore: { type: 'boolean' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, listComplianceAlerts)

  // Create new compliance alert
  fastify.post('/compliance/alerts', {
    schema: {
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          regulationCode: { type: 'string' },
          changeType: { type: 'string' },
          alertType: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          impactScore: { type: 'number' },
          title: { type: 'string' },
          summary: { type: 'string' },
          actionRequired: { type: 'boolean' },
          recommendedActions: { type: 'array', items: { type: 'string' } },
          affectedProjectIds: { type: 'array', items: { type: 'string' } },
          affectedSystemTypes: { type: 'array', items: { type: 'string' } },
          deadline: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
        required: ['userId', 'regulationCode', 'alertType', 'severity', 'title', 'summary'],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            alert: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                regulationCode: { type: 'string' },
                changeType: { type: 'string' },
                alertType: { type: 'string' },
                severity: { type: 'string' },
                impactScore: { type: 'number' },
                title: { type: 'string' },
                summary: { type: 'string' },
                actionRequired: { type: 'boolean' },
                recommendedActions: { type: 'array', items: { type: 'string' } },
                affectedProjectIds: { type: 'array', items: { type: 'string' } },
                affectedSystemTypes: { type: 'array', items: { type: 'string' } },
                status: { type: 'string' },
                actionTaken: { type: 'boolean' },
                deliveredVia: { type: 'array', items: { type: 'string' } },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, createComplianceAlert)

  // Update alert status
  fastify.patch('/compliance/alerts/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Alert ID' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['mark-read', 'snooze', 'dismiss', 'action-taken'],
            description: 'Action to perform on the alert',
          },
          snoozedUntil: { type: 'string', format: 'date-time' },
          actionNotes: { type: 'string' },
        },
        required: ['action'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            alert: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                regulationCode: { type: 'string' },
                changeType: { type: 'string' },
                alertType: { type: 'string' },
                severity: { type: 'string' },
                impactScore: { type: 'number' },
                title: { type: 'string' },
                summary: { type: 'string' },
                actionRequired: { type: 'boolean' },
                recommendedActions: { type: 'array', items: { type: 'string' } },
                affectedProjectIds: { type: 'array', items: { type: 'string' } },
                affectedSystemTypes: { type: 'array', items: { type: 'string' } },
                status: { type: 'string' },
                snoozedUntil: { type: ['string', 'null'], format: 'date-time' },
                readAt: { type: ['string', 'null'], format: 'date-time' },
                dismissedAt: { type: ['string', 'null'], format: 'date-time' },
                actionedAt: { type: ['string', 'null'], format: 'date-time' },
                actionTaken: { type: 'boolean' },
                actionNotes: { type: ['string', 'null'] },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, updateComplianceAlert)
}
