/**
 * Project Routes
 *
 * Implements project management endpoints for creating, fetching, and listing projects.
 * Projects are containers for assessments and related analysis.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { ValidationError } from '../lib/errors'
import { v4 as uuidv4 } from 'uuid'

/**
 * List all projects for authenticated user
 *
 * GET /api/projects
 *
 * Retrieves all projects belonging to the authenticated user.
 *
 * Query Parameters:
 * - limit: Max results (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 * - status: Filter by status (active, archived)
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "projects": [
 *       {
 *         "id": "project-uuid",
 *         "name": "AI Risk Assessment Q1 2024",
 *         "description": "Assessment of AI system risks",
 *         "status": "active",
 *         "assessmentCount": 3,
 *         "createdAt": "2024-01-01T00:00:00Z",
 *         "updatedAt": "2024-01-15T00:00:00Z"
 *       }
 *     ],
 *     "total": 5,
 *     "limit": 50,
 *     "offset": 0
 *   }
 * }
 * ```
 */
async function listProjects(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Note: In production, userId would come from authenticated JWT token
    // For now, we'll accept it as a header for testing
    const userId = request.headers['x-user-id'] as string
    
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Parse query parameters
    const limit = Math.min(
      parseInt((request.query as any).limit || '50'),
      100
    )
    const offset = parseInt((request.query as any).offset || '0')
    const status = (request.query as any).status || 'active'

    // Validate parameters
    if (limit < 1 || offset < 0) {
      throw new ValidationError('Invalid pagination parameters', 'INVALID_INPUT')
    }

    // Fetch total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM "Project" WHERE "userId" = $1 AND "status" = $2`,
      [userId, status]
    )
    const total = countResult.rows[0]?.count || 0

    // Fetch projects with pagination
    const result = await query(
      `SELECT "id", "name", "description", "status", "createdAt", "updatedAt"
       FROM "Project"
       WHERE "userId" = $1 AND "status" = $2
       ORDER BY "updatedAt" DESC
       LIMIT $3 OFFSET $4`,
      [userId, status, limit, offset]
    )

    // Fetch assessment counts for each project
    const projects = await Promise.all(
      result.rows.map(async (project) => {
        const assessmentResult = await query(
          `SELECT COUNT(*) as count FROM "RiskAssessment" WHERE "projectId" = $1`,
          [project.id]
        )
        return {
          id: project.id,
          name: project.name || 'Untitled Project',
          description: project.description || '',
          status: project.status || 'active',
          assessmentCount: assessmentResult.rows[0]?.count || 0,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }
      })
    )

    request.log.info({ userId, count: projects.length }, 'Projects listed')

    return reply.status(200).send({
      success: true,
      data: {
        projects,
        total,
        limit,
        offset,
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'List projects error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to list projects',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Create new project
 *
 * POST /api/projects
 *
 * Creates a new project for the authenticated user.
 *
 * Request:
 * ```json
 * {
 *   "name": "AI Risk Assessment Q1 2024",
 *   "description": "Assessment of AI system risks",
 *   "status": "active"
 * }
 * ```
 *
 * Response (201):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "project-uuid",
 *     "name": "AI Risk Assessment Q1 2024",
 *     "description": "Assessment of AI system risks",
 *     "status": "active",
 *     "createdAt": "2024-01-01T00:00:00Z",
 *     "updatedAt": "2024-01-01T00:00:00Z"
 *   }
 * }
 * ```
 */
async function createProject(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Note: In production, userId would come from authenticated JWT token
    const userId = request.headers['x-user-id'] as string
    
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    const { name, description, status } = request.body as {
      name?: string
      description?: string
      status?: string
    }

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Project name is required', 'INVALID_INPUT')
    }

    if (name.length > 255) {
      throw new ValidationError('Project name must be 255 characters or less', 'INVALID_INPUT')
    }

    // Validate status if provided
    const validStatuses = ['active', 'archived']
    const projectStatus = status || 'active'
    
    if (!validStatuses.includes(projectStatus)) {
      throw new ValidationError(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        'INVALID_STATUS'
      )
    }

    // Create project
    const projectId = uuidv4()
    const now = new Date()

    await query(
      `INSERT INTO "Project" ("id", "userId", "name", "description", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [projectId, userId, name.trim(), description || '', projectStatus, now.toISOString(), now.toISOString()]
    )

    request.log.info({ projectId, userId, name }, 'Project created')

    return reply.status(201).send({
      success: true,
      data: {
        id: projectId,
        name: name.trim(),
        description: description || '',
        status: projectStatus,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Create project error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create project',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all project routes
 */
export async function projectsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/projects', listProjects)
  fastify.post('/api/projects', createProject)

  fastify.log.info('Project routes registered')
}
