import { FastifyRequest, FastifyReply } from 'fastify'
import { selectOne, selectMany, insertOne, updateOne, deleteOne } from '../lib/db-queries'
import { ValidationError, NotFoundError, AuthorizationError } from '../lib/errors'
import { checkProjectLimit } from '../services/feature-gates.service'
import crypto from 'crypto'

// ============================================================================
// TYPES
// ============================================================================

interface Project {
  id: string
  userId: string
  name: string
  description?: string
  createdAt?: Date
  updatedAt?: Date
  [key: string]: any
}

interface RiskAssessment {
  id: string
  projectId: string
  createdAt?: Date
  [key: string]: any
}

// ============================================================================
// GET /api/projects-list - List user's projects
// ============================================================================

interface ListProjectsQuery {
  userId: string
}

export async function listProjectsController(
  request: FastifyRequest<{ Querystring: ListProjectsQuery }>,
  reply: FastifyReply
) {
  try {
    const { userId } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    const projects = await selectMany<Project>('Project', { userId })

    // Get assessment counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const assessments = await selectMany<RiskAssessment>('RiskAssessment', { projectId: project.id })
        return {
          ...project,
          assessmentCount: assessments.length,
        }
      })
    )

    // Sort by createdAt desc
    projectsWithCounts.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()
      return dateB - dateA
    })

    return reply.send({
      success: true,
      data: projectsWithCounts,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to list projects')

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to list projects',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// POST /api/projects-create - Create project with limit check
// ============================================================================

interface CreateProjectBody {
  userId: string
  name: string
  description?: string
}

export async function createProjectController(
  request: FastifyRequest<{ Body: CreateProjectBody }>,
  reply: FastifyReply
) {
  try {
    const { userId, name, description } = request.body

    if (!userId || !name) {
      throw new ValidationError('userId and name are required')
    }

    request.log.info({ userId, name }, 'Creating project')

    // Check project limit
    const limitCheck = await checkProjectLimit(userId)

    if (!limitCheck.allowed) {
      return reply.code(403).send({
        success: false,
        ...limitCheck.error,
      })
    }

    // Create project
    const project = await insertOne<Project>('Project', {
      id: crypto.randomUUID(),
      userId,
      name,
      description: description || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    request.log.info({ projectId: project.id }, 'Project created')

    return reply.send({
      success: true,
      data: project,
      usage: {
        current: limitCheck.current! + 1,
        limit: limitCheck.limit,
        remaining: limitCheck.remaining! - 1,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to create project')

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to create project',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// GET /api/projects-get/:id - Get project details
// ============================================================================

interface GetProjectParams {
  id: string
}

interface GetProjectQuery {
  userId: string
}

export async function getProjectController(
  request: FastifyRequest<{ Params: GetProjectParams; Querystring: GetProjectQuery }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    // Get project
    const project = await selectOne<Project>('Project', { id })

    if (!project) {
      throw new NotFoundError('Project not found')
    }

    if (project.userId !== userId) {
      throw new AuthorizationError('You do not have access to this project')
    }

    // Get related risk assessments, ordered by createdAt desc
    const riskAssessments = await selectMany<RiskAssessment>('RiskAssessment', { projectId: id })
    riskAssessments.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()
      return dateB - dateA
    })

    return reply.send({
      success: true,
      data: {
        ...project,
        RiskAssessment: riskAssessments,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get project')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to get project',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// PUT /api/projects-update/:id - Update project
// ============================================================================

interface UpdateProjectBody {
  userId: string
  name?: string
  description?: string
}

export async function updateProjectController(
  request: FastifyRequest<{ Params: GetProjectParams; Body: UpdateProjectBody }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId, name, description } = request.body

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    // Verify ownership
    const project = await selectOne<Project>('Project', { id })

    if (!project) {
      throw new NotFoundError('Project not found')
    }

    if (project.userId !== userId) {
      throw new AuthorizationError('You do not have access to this project')
    }

    // Build update data
    const updateData: Record<string, any> = {}
    if (name) {
      updateData.name = name
    }
    if (description !== undefined) {
      updateData.description = description
    }
    updateData.updatedAt = new Date()

    // Update project
    const updated = await updateOne<Project>('Project', updateData, { id })

    return reply.send({
      success: true,
      data: updated,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to update project')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to update project',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// DELETE /api/projects-delete/:id - Delete project
// ============================================================================

export async function deleteProjectController(
  request: FastifyRequest<{ Params: GetProjectParams; Querystring: GetProjectQuery }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    // Verify ownership
    const project = await selectOne<Project>('Project', { id })

    if (!project) {
      throw new NotFoundError('Project not found')
    }

    if (project.userId !== userId) {
      throw new AuthorizationError('You do not have access to this project')
    }

    // Delete project (cascade will delete related assessments)
    await deleteOne('Project', { id })

    request.log.info({ projectId: id }, 'Project deleted')

    return reply.send({
      success: true,
      message: 'Project deleted successfully',
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to delete project')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to delete project',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}
