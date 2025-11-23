// Add these new route handlers before the export function

/**
 * Get assessment benchmark
 * 
 * GET /api/assessments/:id/benchmark
 */
async function getAssessmentBenchmark(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.headers['x-user-id'] as string

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Get assessment
    const result = await query(
      `SELECT "id", "userId", "sengolScore", "industry", "systemCriticality", 
              "dataTypes", "technologyStack"
       FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const assessment = result.rows[0]
    if (assessment.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to view this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    const userScore = assessment.sengolScore ? Number(assessment.sengolScore) : 0
    if (userScore === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Assessment has not been submitted yet',
        code: 'NOT_SUBMITTED',
        statusCode: 400,
      })
    }

    // Get benchmark data
    const benchmarkData = await benchmarkAssessment(userScore, {
      industry: assessment.industry,
      systemCriticality: assessment.systemCriticality,
      dataTypes: assessment.dataTypes || [],
      techStack: assessment.technologyStack || [],
    })

    return reply.send({
      success: true,
      data: benchmarkData,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get assessment benchmark')
    return reply.status(500).send({
      success: false,
      error: 'Failed to get benchmark data',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get assessment history
 * 
 * GET /api/assessments/:id/history
 */
async function getAssessmentHistory(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.headers['x-user-id'] as string

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Get assessment
    const checkResult = await query(
      `SELECT "id", "userId" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const assessment = checkResult.rows[0]
    if (assessment.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to view this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    const assessment = checkResult.rows[0]
    if (assessment.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to view this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    // Get history
    const { getAssessmentHistory, analyzeScoreTrend } = await import('../services/assessment-history')
    const snapshots = await getAssessmentHistory(id)
    const trend = analyzeScoreTrend(snapshots)

    return reply.send({
      success: true,
      data: {
        snapshots,
        trend,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get assessment history')
    return reply.status(500).send({
      success: false,
      error: 'Failed to get history data',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}
