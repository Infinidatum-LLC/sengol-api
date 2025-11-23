/**
 * Assessment History Tracking
 * 
 * Tracks assessment scores over time to show trends and improvements.
 */

import { query } from '../lib/db'

export interface AssessmentSnapshot {
  assessmentId: string
  timestamp: Date
  riskScore: number | null
  complianceScore: number | null
  sengolScore: number | null
  letterGrade: string | null
  questionResponses: Record<string, any>
  metadata?: {
    answeredCount: number
    totalQuestions: number
    completionRate: number
  }
}

export interface ScoreTrend {
  snapshots: AssessmentSnapshot[]
  trend: 'improving' | 'declining' | 'stable'
  averageChange: number
  totalChange: number
  recommendations: string[]
}

/**
 * Create a snapshot of current assessment state
 */
export async function createAssessmentSnapshot(
  assessmentId: string,
  assessmentData: {
    riskScore?: number | null
    complianceScore?: number | null
    sengolScore?: number | null
    letterGrade?: string | null
    riskQuestionResponses?: Record<string, any>
    complianceQuestionResponses?: Record<string, any>
  }
): Promise<void> {
  try {
    // Store snapshot in a separate table (would need to be created in migration)
    // For now, we'll use the updatedAt timestamp and store in a JSON field
    const snapshot = {
      timestamp: new Date(),
      riskScore: assessmentData.riskScore,
      complianceScore: assessmentData.complianceScore,
      sengolScore: assessmentData.sengolScore,
      letterGrade: assessmentData.letterGrade,
      questionResponses: {
        risk: assessmentData.riskQuestionResponses || {},
        compliance: assessmentData.complianceQuestionResponses || {},
      },
      metadata: {
        answeredCount: 
          Object.keys(assessmentData.riskQuestionResponses || {}).length +
          Object.keys(assessmentData.complianceQuestionResponses || {}).length,
      },
    }

    // Store in assessment's history field (would need to be added to schema)
    // For now, log it
    console.log(`[HISTORY] Snapshot created for assessment ${assessmentId}:`, {
      sengolScore: snapshot.sengolScore,
      timestamp: snapshot.timestamp,
    })
  } catch (error) {
    console.error('[HISTORY] Failed to create snapshot:', error)
  }
}

/**
 * Get assessment history (from updatedAt timestamps and score changes)
 */
export async function getAssessmentHistory(
  assessmentId: string
): Promise<AssessmentSnapshot[]> {
  try {
    // In a real implementation, you'd query a history table
    // For now, we'll use the updatedAt field and assume each update is a snapshot
    const sql = `
      SELECT 
        id,
        "updatedAt",
        "riskScore",
        "complianceScore",
        "sengolScore",
        "letterGrade",
        "riskQuestionResponses",
        "complianceQuestionResponses"
      FROM "RiskAssessment"
      WHERE id = $1
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `

    const result = await query(sql, [assessmentId])
    
    if (result.rows.length === 0) {
      return []
    }

    const row = result.rows[0]
    return [
      {
        assessmentId,
        timestamp: new Date(row.updatedAt),
        riskScore: row.riskScore ? Number(row.riskScore) : null,
        complianceScore: row.complianceScore ? Number(row.complianceScore) : null,
        sengolScore: row.sengolScore ? Number(row.sengolScore) : null,
        letterGrade: row.letterGrade,
        questionResponses: {
          risk: row.riskQuestionResponses || {},
          compliance: row.complianceQuestionResponses || {},
        },
        metadata: {
          answeredCount:
            Object.keys(row.riskQuestionResponses || {}).length +
            Object.keys(row.complianceQuestionResponses || {}).length,
          totalQuestions: 0, // Would need to calculate from questions
          completionRate: 0,
        },
      },
    ]
  } catch (error) {
    console.error('[HISTORY] Failed to get assessment history:', error)
    return []
  }
}

/**
 * Analyze score trends
 */
export function analyzeScoreTrend(snapshots: AssessmentSnapshot[]): ScoreTrend {
  if (snapshots.length < 2) {
    return {
      snapshots,
      trend: 'stable',
      averageChange: 0,
      totalChange: 0,
      recommendations: ['Complete more assessments to see trends'],
    }
  }

  // Sort by timestamp (oldest first)
  const sorted = [...snapshots].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  )

  const firstScore = sorted[0].sengolScore || 0
  const lastScore = sorted[sorted.length - 1].sengolScore || 0
  const totalChange = lastScore - firstScore

  // Calculate average change per snapshot
  let totalChangeSum = 0
  for (let i = 1; i < sorted.length; i++) {
    const prevScore = sorted[i - 1].sengolScore || 0
    const currScore = sorted[i].sengolScore || 0
    totalChangeSum += currScore - prevScore
  }
  const averageChange = totalChangeSum / (sorted.length - 1)

  // Determine trend
  let trend: 'improving' | 'declining' | 'stable' = 'stable'
  if (averageChange > 2) trend = 'improving'
  else if (averageChange < -2) trend = 'declining'

  // Generate recommendations
  const recommendations: string[] = []
  if (trend === 'improving') {
    recommendations.push('Great progress! Your score is improving over time.')
    recommendations.push('Continue addressing high-impact questions to maintain this trend.')
  } else if (trend === 'declining') {
    recommendations.push('Your score has declined. Review recent changes to identify areas for improvement.')
    recommendations.push('Focus on addressing critical risk areas that have been marked as not addressed.')
  } else {
    recommendations.push('Your score has remained stable. Consider addressing new risk areas to improve.')
  }

  return {
    snapshots: sorted,
    trend,
    averageChange: Math.round(averageChange * 10) / 10,
    totalChange: Math.round(totalChange),
    recommendations,
  }
}

