import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { ValidationError, NotFoundError, AuthorizationError } from '../lib/errors'
import { checkProjectLimit } from '../services/feature-gates.service'

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

    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            riskAssessments: true,
          },
        },
      },
    })

    return reply.send({
      success: true,
      data: projects.map(project => ({
        ...project,
        assessmentCount: project._count.riskAssessments,
      })),
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
    const project = await prisma.project.create({
      data: {
        userId,
        name,
        description: description || null,
      },
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

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        riskAssessments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!project) {
      throw new NotFoundError('Project not found')
    }

    if (project.userId !== userId) {
      throw new AuthorizationError('You do not have access to this project')
    }

    return reply.send({
      success: true,
      data: project,
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
    const project = await prisma.project.findUnique({
      where: { id },
    })

    if (!project) {
      throw new NotFoundError('Project not found')
    }

    if (project.userId !== userId) {
      throw new AuthorizationError('You do not have access to this project')
    }

    // Update project
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
    })

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
    const project = await prisma.project.findUnique({
      where: { id },
    })

    if (!project) {
      throw new NotFoundError('Project not found')
    }

    if (project.userId !== userId) {
      throw new AuthorizationError('You do not have access to this project')
    }

    // Delete project (cascade will delete related assessments)
    await prisma.project.delete({
      where: { id },
    })

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
