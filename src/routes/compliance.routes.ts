/**
 * Compliance Routes
 *
 * API endpoints for compliance question responses.
 *
 * Created: November 12, 2025
 */

import { FastifyInstance } from 'fastify'
import {
  saveComplianceResponses,
  getComplianceResponses
} from '../controllers/compliance.controller'

export async function complianceRoutes(fastify: FastifyInstance) {
  // Save compliance question responses
  fastify.post('/api/review/:id/compliance-responses', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Assessment ID' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          responses: {
            type: 'object',
            description: 'Map of question ID to response',
            additionalProperties: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['addressed', 'partially_addressed', 'not_addressed', 'not_applicable'],
                  description: 'Compliance status'
                },
                answer: {
                  type: 'string',
                  maxLength: 5000,
                  description: 'Detailed answer explaining compliance measures'
                },
                score: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Optional self-assessment score (0-100)'
                },
                notes: {
                  type: 'string',
                  maxLength: 1000,
                  description: 'Optional additional notes'
                }
              },
              required: ['status', 'answer']
            }
          }
        },
        required: ['responses']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            assessmentId: { type: 'string' },
            complianceCoverageScore: { type: 'number' },
            complianceCoverageDetails: { type: 'object' },
            responseCount: { type: 'number' },
            questionCount: { type: 'number' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, saveComplianceResponses)

  // Get compliance question responses
  fastify.get('/api/review/:id/compliance-responses', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Assessment ID' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            assessmentId: { type: 'string' },
            responses: { type: 'object' },
            coverageScore: { type: ['number', 'null'] },
            coverageDetails: { type: ['object', 'null'] },
            userScores: { type: 'object' },
            notes: { type: 'object' },
            lastUpdated: { type: 'string', format: 'date-time' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, getComplianceResponses)
}
