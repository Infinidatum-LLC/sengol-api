/**
 * Question Impact Analysis
 * 
 * Analyzes which questions have the highest impact on the final score.
 * Helps users understand where to focus their efforts.
 */

import { DynamicQuestion } from './dynamic-question-generator'

export interface QuestionImpact {
  questionId: string
  questionText: string
  currentImpact: number // Current impact on score (0-100)
  maxPotentialImpact: number // Maximum impact if answered "addressed" (0-100)
  minPotentialImpact: number // Minimum impact if answered "not_addressed" (0-100)
  weight: number // Question weight (0-1)
  priority: 'critical' | 'high' | 'medium' | 'low'
  recommendation: string
}

export interface QuestionResponse {
  status: 'addressed' | 'partially_addressed' | 'not_addressed' | 'not_applicable'
  notes?: string
  userScore?: number
  riskScore?: number
}

/**
 * Calculate impact of a single question on the score
 */
function calculateQuestionImpact(
  question: DynamicQuestion,
  currentResponse: QuestionResponse | undefined,
  allQuestions: DynamicQuestion[],
  allResponses: Record<string, QuestionResponse>
): QuestionImpact {
  const weight = question.finalWeight || question.weight || 1.0

  // Helper to convert status to score
  const statusToScore = (status: string): number => {
    switch (status) {
      case 'addressed': return 20
      case 'partially_addressed': return 50
      case 'not_addressed': return 80
      case 'not_applicable': return 0
      default: return 50
    }
  }

  // Calculate current score contribution
  const currentStatus = currentResponse?.status || 'not_addressed'
  const currentScore = currentResponse?.riskScore ?? statusToScore(currentStatus)
  const currentContribution = currentScore * weight

  // Calculate max potential (if answered "addressed")
  const maxScore = 20 // Best case
  const maxContribution = maxScore * weight
  const maxImpact = maxContribution - currentContribution

  // Calculate min potential (if answered "not_addressed")
  const minScore = 80 // Worst case
  const minContribution = minScore * weight
  const minImpact = minContribution - currentContribution

  // Determine priority
  let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium'
  if (weight >= 0.8) priority = 'critical'
  else if (weight >= 0.6) priority = 'high'
  else if (weight >= 0.4) priority = 'medium'
  else priority = 'low'

  // Generate recommendation
  let recommendation = ''
  if (currentStatus === 'not_addressed' && maxImpact > 30) {
    recommendation = `High impact: Addressing this could improve your score by up to ${Math.round(maxImpact)} points`
  } else if (currentStatus === 'partially_addressed' && maxImpact > 15) {
    recommendation = `Medium impact: Fully addressing this could improve your score by ${Math.round(maxImpact)} points`
  } else if (currentStatus === 'addressed') {
    recommendation = `Well addressed: This question is already contributing positively to your score`
  } else {
    recommendation = `Low impact: This question has minimal impact on your overall score`
  }

  return {
    questionId: question.id,
    questionText: question.label || question.text || question.question || '',
    currentImpact: Math.round(currentContribution),
    maxPotentialImpact: Math.round(maxContribution),
    minPotentialImpact: Math.round(minContribution),
    weight,
    priority,
    recommendation,
  }
}

/**
 * Analyze impact of all questions
 */
export function analyzeQuestionImpacts(
  questions: DynamicQuestion[],
  responses: Record<string, QuestionResponse>
): QuestionImpact[] {
  return questions
    .map(question => {
      const response = responses[question.id]
      return calculateQuestionImpact(question, response, questions, responses)
    })
    .sort((a, b) => {
      // Sort by max potential impact (descending)
      return b.maxPotentialImpact - a.maxPotentialImpact
    })
}

/**
 * Get top N questions by impact
 */
export function getTopImpactQuestions(
  impacts: QuestionImpact[],
  limit: number = 5
): QuestionImpact[] {
  return impacts.slice(0, limit)
}

/**
 * Get questions that could improve score the most
 */
export function getHighImpactOpportunities(
  impacts: QuestionImpact[],
  currentResponses: Record<string, QuestionResponse>
): QuestionImpact[] {
  return impacts
    .filter(impact => {
      const response = currentResponses[impact.questionId]
      const status = response?.status || 'not_addressed'
      
      // Only include questions that are not fully addressed and have high potential impact
      return status !== 'addressed' && impact.maxPotentialImpact > 20
    })
    .slice(0, 5) // Top 5 opportunities
}

