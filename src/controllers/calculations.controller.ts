/**
 * Calculations Controller
 *
 * Handles ROI Calculator CRUD operations and project-linked calculations.
 *
 * Created: November 2025
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { selectOne, selectMany, insertOne, updateOne, deleteOne } from '../lib/db-queries'

// ============================================================================
// TYPES
// ============================================================================

interface Calculation {
  id: string
  userId: string
  projectId: string
  name: string
  notes?: string | null
  inputs: Record<string, any>
  results: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

interface Project {
  id: string
  name: string
  color?: string | null
}

// ============================================================================
// CONTROLLER FUNCTIONS
// ============================================================================

/**
 * GET /api/calculations - List all user calculations
 */
export async function listCalculations(
  request: FastifyRequest<{
    Querystring: { projectId?: string }
  }>,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { projectId } = request.query

    const where: any = { userId }
    if (projectId) {
      where.projectId = projectId
    }

    const calculations = await selectMany<Calculation>('Calculation', where)

    return reply.send({
      calculations: calculations || [],
    })
  } catch (error) {
    console.error('[Calculations] Error listing calculations:', error)
    return reply.status(500).send({
      error: 'Failed to fetch calculations',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * POST /api/calculations - Create new calculation
 */
export async function createCalculation(
  request: FastifyRequest<{
    Body: {
      name: string
      notes?: string
      projectId: string
      inputs: Record<string, any>
      results: Record<string, any>
    }
  }>,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { name, notes, projectId, inputs, results } = request.body

    // Validate required fields
    if (!name || !projectId || !inputs || !results) {
      return reply.status(400).send({
        error: 'Invalid request body',
        message: 'name, projectId, inputs, and results are required',
      })
    }

    // Verify project belongs to user
    const project = await selectOne<Project>('Project', {
      id: projectId,
      userId,
    })

    if (!project) {
      return reply.status(404).send({
        error: 'Project not found',
        message: 'Project does not exist or does not belong to you',
      })
    }

    // Create calculation
    const calculation = await insertOne<Calculation>('Calculation', {
      userId,
      projectId,
      name: name.trim(),
      notes: notes?.trim() || null,
      inputs,
      results,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    console.log(`[Calculations] Created calculation ${calculation.id} for user ${userId}`)

    return reply.status(201).send({
      calculation: {
        ...calculation,
        project,
      },
    })
  } catch (error) {
    console.error('[Calculations] Error creating calculation:', error)
    return reply.status(500).send({
      error: 'Failed to create calculation',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * GET /api/calculations/:id - Get specific calculation
 */
export async function getCalculation(
  request: FastifyRequest<{
    Params: { id: string }
  }>,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { id } = request.params

    const calculation = await selectOne<Calculation>('Calculation', {
      id,
      userId,
    })

    if (!calculation) {
      return reply.status(404).send({
        error: 'Calculation not found',
      })
    }

    const project = calculation.projectId
      ? await selectOne<Project>('Project', {
          id: calculation.projectId,
          userId,
        })
      : null

    return reply.send({
      calculation: {
        ...calculation,
        project: project || null,
      },
    })
  } catch (error) {
    console.error('[Calculations] Error fetching calculation:', error)
    return reply.status(500).send({
      error: 'Failed to fetch calculation',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * PUT /api/calculations/:id - Update calculation
 */
export async function updateCalculation(
  request: FastifyRequest<{
    Params: { id: string }
    Body: {
      name?: string
      notes?: string
      inputs?: Record<string, any>
      results?: Record<string, any>
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
    const { name, notes, inputs, results } = request.body

    // Verify calculation belongs to user
    const calculation = await selectOne<Calculation>('Calculation', {
      id,
      userId,
    })

    if (!calculation) {
      return reply.status(404).send({
        error: 'Calculation not found',
      })
    }

    // Build update object with only provided fields
    const updateData: any = {
      updatedAt: new Date(),
    }

    if (name !== undefined) {
      updateData.name = name.trim()
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null
    }
    if (inputs !== undefined) {
      updateData.inputs = inputs
    }
    if (results !== undefined) {
      updateData.results = results
    }

    const updated = await updateOne<Calculation>('Calculation', { id, userId }, updateData)

    const project = calculation.projectId
      ? await selectOne<Project>('Project', {
          id: calculation.projectId,
          userId,
        })
      : null

    console.log(`[Calculations] Updated calculation ${id} for user ${userId}`)

    return reply.send({
      calculation: {
        ...updated,
        project: project || null,
      },
    })
  } catch (error) {
    console.error('[Calculations] Error updating calculation:', error)
    return reply.status(500).send({
      error: 'Failed to update calculation',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * DELETE /api/calculations/:id - Delete calculation
 */
export async function deleteCalculation(
  request: FastifyRequest<{
    Params: { id: string }
  }>,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { id } = request.params

    // Verify calculation belongs to user
    const calculation = await selectOne<Calculation>('Calculation', {
      id,
      userId,
    })

    if (!calculation) {
      return reply.status(404).send({
        error: 'Calculation not found',
      })
    }

    await deleteOne('Calculation', { id, userId })

    console.log(`[Calculations] Deleted calculation ${id} for user ${userId}`)

    return reply.send({
      message: 'Calculation deleted successfully',
    })
  } catch (error) {
    console.error('[Calculations] Error deleting calculation:', error)
    return reply.status(500).send({
      error: 'Failed to delete calculation',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
