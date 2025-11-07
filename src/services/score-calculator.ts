/**
 * Score Calculator Service
 *
 * Provides unified score calculation logic for assessments including:
 * - Sengol Score (composite risk/compliance score)
 * - Letter Grade (A+, A, B+, etc.)
 * - Risk Coverage Score (% of questions answered)
 * - Individual domain scores
 */

// ============================================================================
// TYPES
// ============================================================================

export interface QuestionResponse {
  status: 'completed' | 'in_progress' | 'not_started' | 'not_applicable'
  notes?: string
  lastUpdated?: string
  riskScore?: number
}

export interface ScoreBreakdown {
  sengolScore: number
  letterGrade: string
  riskScore: number
  complianceScore: number
  riskCoverageScore: number
  complianceCoverageScore: number
  domainScores?: {
    ai?: number
    cyber?: number
    cloud?: number
  }
}

// ============================================================================
// LETTER GRADE CALCULATION
// ============================================================================

/**
 * Calculate letter grade from Sengol Score
 *
 * Uses standard academic grading scale:
 * A+: 90-100, A: 85-89, A-: 80-84
 * B+: 75-79, B: 70-74, B-: 65-69
 * C+: 60-64, C: 55-59, C-: 50-54
 * D+: 45-49, D: 40-44
 * F: 0-39
 */
export function calculateLetterGrade(sengolScore: number): string {
  if (sengolScore >= 90) return 'A+'
  if (sengolScore >= 85) return 'A'
  if (sengolScore >= 80) return 'A-'
  if (sengolScore >= 75) return 'B+'
  if (sengolScore >= 70) return 'B'
  if (sengolScore >= 65) return 'B-'
  if (sengolScore >= 60) return 'C+'
  if (sengolScore >= 55) return 'C'
  if (sengolScore >= 50) return 'C-'
  if (sengolScore >= 45) return 'D+'
  if (sengolScore >= 40) return 'D'
  return 'F'
}

/**
 * Get letter grade color (for UI)
 */
export function getLetterGradeColor(letterGrade: string): string {
  if (letterGrade.startsWith('A')) return '#10b981' // green
  if (letterGrade.startsWith('B')) return '#3b82f6' // blue
  if (letterGrade.startsWith('C')) return '#f59e0b' // yellow
  if (letterGrade.startsWith('D')) return '#f97316' // orange
  return '#ef4444' // red (F)
}

// ============================================================================
// COVERAGE SCORE CALCULATION
// ============================================================================

/**
 * Calculate risk coverage score (% of risk questions answered)
 *
 * Only counts 'completed' status as answered
 * Excludes 'not_applicable' from total count
 */
export function calculateRiskCoverageScore(
  responses: Record<string, QuestionResponse>,
  totalQuestions: number
): number {
  if (totalQuestions === 0) return 0

  // Count applicable questions (exclude not_applicable)
  const applicableQuestions = Object.values(responses).filter(
    r => r.status !== 'not_applicable'
  ).length

  // Count completed questions
  const completedQuestions = Object.values(responses).filter(
    r => r.status === 'completed'
  ).length

  // Calculate percentage (use applicable count as denominator)
  const denominator = applicableQuestions > 0 ? applicableQuestions : totalQuestions
  return Math.round((completedQuestions / denominator) * 100)
}

/**
 * Calculate compliance coverage score (% of compliance questions answered)
 */
export function calculateComplianceCoverageScore(
  responses: Record<string, QuestionResponse>,
  totalQuestions: number
): number {
  // Same logic as risk coverage
  return calculateRiskCoverageScore(responses, totalQuestions)
}

// ============================================================================
// SENGOL SCORE CALCULATION
// ============================================================================

/**
 * Calculate Sengol Score (composite risk + compliance score)
 *
 * Formula: (riskScore * 0.6) + (complianceScore * 0.4)
 *
 * Weights:
 * - Risk: 60% (primary focus on risk mitigation)
 * - Compliance: 40% (regulatory/standards adherence)
 */
export function calculateSengolScore(
  riskScore: number,
  complianceScore: number
): number {
  if (riskScore === 0 && complianceScore === 0) return 0

  const weightedScore = (riskScore * 0.6) + (complianceScore * 0.4)
  return Math.round(weightedScore)
}

/**
 * Calculate risk score from question responses
 *
 * Averages all individual question risk scores
 * Only includes completed questions with risk scores
 */
export function calculateRiskScoreFromResponses(
  responses: Record<string, QuestionResponse>
): number {
  const scoredResponses = Object.values(responses).filter(
    r => r.status === 'completed' && r.riskScore !== undefined && r.riskScore !== null
  )

  if (scoredResponses.length === 0) return 0

  const totalScore = scoredResponses.reduce((sum, r) => sum + (r.riskScore || 0), 0)
  return Math.round(totalScore / scoredResponses.length)
}

/**
 * Calculate compliance score from question responses
 *
 * Same logic as risk score calculation
 */
export function calculateComplianceScoreFromResponses(
  responses: Record<string, QuestionResponse>
): number {
  return calculateRiskScoreFromResponses(responses)
}

// ============================================================================
// DOMAIN SCORE CALCULATION
// ============================================================================

/**
 * Calculate individual domain scores (AI, Cyber, Cloud)
 *
 * Returns scores for each domain based on domain-specific questions
 */
export function calculateDomainScores(
  responses: Record<string, QuestionResponse>,
  domainQuestionMap: Record<string, string> // questionId -> domain mapping
): { ai?: number; cyber?: number; cloud?: number } {
  const domainScores: Record<string, number[]> = {
    ai: [],
    cyber: [],
    cloud: [],
  }

  // Group scores by domain
  Object.entries(responses).forEach(([questionId, response]) => {
    const domain = domainQuestionMap[questionId]
    if (domain && response.status === 'completed' && response.riskScore) {
      domainScores[domain].push(response.riskScore)
    }
  })

  // Calculate averages
  const result: { ai?: number; cyber?: number; cloud?: number } = {}

  Object.entries(domainScores).forEach(([domain, scores]) => {
    if (scores.length > 0) {
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
      result[domain as keyof typeof result] = Math.round(avgScore)
    }
  })

  return result
}

// ============================================================================
// COMPREHENSIVE SCORE CALCULATION
// ============================================================================

/**
 * Calculate all scores for an assessment
 *
 * Returns complete score breakdown including:
 * - Sengol Score
 * - Letter Grade
 * - Risk Score
 * - Compliance Score
 * - Coverage Scores
 * - Domain Scores
 */
export function calculateAllScores(params: {
  riskResponses: Record<string, QuestionResponse>
  complianceResponses: Record<string, QuestionResponse>
  totalRiskQuestions: number
  totalComplianceQuestions: number
  domainQuestionMap?: Record<string, string>
}): ScoreBreakdown {
  const {
    riskResponses,
    complianceResponses,
    totalRiskQuestions,
    totalComplianceQuestions,
    domainQuestionMap,
  } = params

  // Calculate individual scores
  const riskScore = calculateRiskScoreFromResponses(riskResponses)
  const complianceScore = calculateComplianceScoreFromResponses(complianceResponses)
  const sengolScore = calculateSengolScore(riskScore, complianceScore)
  const letterGrade = calculateLetterGrade(sengolScore)

  // Calculate coverage
  const riskCoverageScore = calculateRiskCoverageScore(riskResponses, totalRiskQuestions)
  const complianceCoverageScore = calculateComplianceCoverageScore(
    complianceResponses,
    totalComplianceQuestions
  )

  // Calculate domain scores (if mapping provided)
  const domainScores = domainQuestionMap
    ? calculateDomainScores(riskResponses, domainQuestionMap)
    : undefined

  console.log(`[ScoreCalculator] Calculated scores:`)
  console.log(`  • Sengol Score: ${sengolScore} (${letterGrade})`)
  console.log(`  • Risk Score: ${riskScore}`)
  console.log(`  • Compliance Score: ${complianceScore}`)
  console.log(`  • Risk Coverage: ${riskCoverageScore}%`)
  console.log(`  • Compliance Coverage: ${complianceCoverageScore}%`)
  if (domainScores) {
    console.log(`  • Domain Scores:`, domainScores)
  }

  return {
    sengolScore,
    letterGrade,
    riskScore,
    complianceScore,
    riskCoverageScore,
    complianceCoverageScore,
    domainScores,
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate question response status
 */
export function isValidStatus(status: string): boolean {
  const validStatuses = ['completed', 'in_progress', 'not_started', 'not_applicable']
  return validStatuses.includes(status)
}

/**
 * Validate risk score value (0-100)
 */
export function isValidRiskScore(score: number): boolean {
  return typeof score === 'number' && score >= 0 && score <= 100
}

/**
 * Clean and validate responses object
 * Removes invalid responses and returns cleaned data
 */
export function cleanResponses(
  responses: Record<string, any>
): Record<string, QuestionResponse> {
  const cleaned: Record<string, QuestionResponse> = {}

  Object.entries(responses).forEach(([questionId, response]) => {
    if (response && typeof response === 'object') {
      // Validate status
      if (!isValidStatus(response.status)) {
        console.warn(`[ScoreCalculator] Invalid status for ${questionId}: ${response.status}`)
        return
      }

      // Validate riskScore if present
      if (response.riskScore !== undefined && !isValidRiskScore(response.riskScore)) {
        console.warn(`[ScoreCalculator] Invalid riskScore for ${questionId}: ${response.riskScore}`)
        response.riskScore = undefined
      }

      cleaned[questionId] = {
        status: response.status,
        notes: response.notes,
        lastUpdated: response.lastUpdated,
        riskScore: response.riskScore,
      }
    }
  })

  return cleaned
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  calculateLetterGrade,
  getLetterGradeColor,
  calculateRiskCoverageScore,
  calculateComplianceCoverageScore,
  calculateSengolScore,
  calculateRiskScoreFromResponses,
  calculateComplianceScoreFromResponses,
  calculateDomainScores,
  calculateAllScores,
  isValidStatus,
  isValidRiskScore,
  cleanResponses,
}
