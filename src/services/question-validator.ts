/**
 * Question Quality Validation
 * 
 * Validates generated questions to ensure quality before returning to users.
 * Prevents low-quality questions from being displayed.
 */

import { DynamicQuestion } from './dynamic-question-generator'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  score: number // 0-100 quality score
}

/**
 * Validate a single question
 */
export function validateQuestion(question: DynamicQuestion, existingQuestions: DynamicQuestion[] = []): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let score = 100

  // 1. Check question text length
  const questionText = question.label || question.text || question.question || ''
  if (questionText.length < 20) {
    errors.push('Question text is too short (minimum 20 characters)')
    score -= 30
  } else if (questionText.length > 500) {
    warnings.push('Question text is very long (may be hard to read)')
    score -= 5
  }

  // 2. Check for placeholder text
  const placeholderPatterns = [
    /\[data\]/i,
    /\[system\]/i,
    /\[organization\]/i,
    /\[industry\]/i,
    /placeholder/i,
    /TODO/i,
    /FIXME/i,
  ]
  
  for (const pattern of placeholderPatterns) {
    if (pattern.test(questionText)) {
      errors.push('Question contains placeholder text')
      score -= 20
      break
    }
  }

  // 3. Check weight validity
  if (question.finalWeight < 0 || question.finalWeight > 1) {
    errors.push(`Invalid weight: ${question.finalWeight} (must be between 0 and 1)`)
    score -= 15
  }

  // 4. Check for duplicates
  const isDuplicate = existingQuestions.some(existing => {
    const existingText = existing.label || existing.text || existing.question || ''
    const similarity = calculateTextSimilarity(questionText, existingText)
    return similarity > 0.8 // 80% similarity threshold
  })

  if (isDuplicate) {
    errors.push('Question is too similar to an existing question')
    score -= 25
  }

  // 5. Check description
  if (!question.description || question.description.length < 10) {
    warnings.push('Question description is missing or too short')
    score -= 5
  }

  // 6. Check evidence quality
  if (question.evidence.incidentCount === 0 && question.finalWeight > 0.7) {
    warnings.push('High weight question has no incident evidence')
    score -= 10
  }

  // 7. Check priority consistency
  const weightToPriority: Record<string, string[]> = {
    critical: ['0.9', '1.0'],
    high: ['0.7', '0.8', '0.9'],
    medium: ['0.4', '0.5', '0.6', '0.7'],
    low: ['0.0', '0.1', '0.2', '0.3', '0.4'],
  }

  const expectedPriorities = weightToPriority[question.priority] || []
  const weightStr = question.finalWeight.toFixed(1)
  if (!expectedPriorities.includes(weightStr)) {
    warnings.push(`Priority (${question.priority}) doesn't match weight (${weightStr})`)
    score -= 5
  }

  // 8. Check for empty arrays
  if (question.examples.length === 0 && question.evidence.incidentCount > 0) {
    warnings.push('Question has incidents but no examples')
    score -= 5
  }

  // 9. Check ID format
  if (!question.id || question.id.length < 5) {
    errors.push('Question ID is missing or invalid')
    score -= 10
  }

  // 10. Check category
  if (!question.category || !['ai', 'cyber', 'cloud', 'compliance'].includes(question.category)) {
    errors.push(`Invalid category: ${question.category}`)
    score -= 10
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, Math.min(100, score)),
  }
}

/**
 * Calculate text similarity using simple word overlap
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/))
  const words2 = new Set(text2.toLowerCase().split(/\s+/))

  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return intersection.size / union.size
}

/**
 * Validate multiple questions
 */
export function validateQuestions(questions: DynamicQuestion[]): {
  valid: boolean
  results: ValidationResult[]
  summary: {
    total: number
    valid: number
    invalid: number
    avgScore: number
    errors: string[]
    warnings: string[]
  }
} {
  const results: ValidationResult[] = []
  const allErrors: string[] = []
  const allWarnings: string[] = []

  for (let i = 0; i < questions.length; i++) {
    const existing = questions.slice(0, i)
    const result = validateQuestion(questions[i], existing)
    results.push(result)

    if (!result.valid) {
      allErrors.push(...result.errors.map(e => `Question ${i + 1}: ${e}`))
    }
    allWarnings.push(...result.warnings.map(w => `Question ${i + 1}: ${w}`))
  }

  const validCount = results.filter(r => r.valid).length
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length

  return {
    valid: results.every(r => r.valid),
    results,
    summary: {
      total: questions.length,
      valid: validCount,
      invalid: questions.length - validCount,
      avgScore,
      errors: allErrors,
      warnings: allWarnings,
    },
  }
}

/**
 * Filter out invalid questions and log warnings
 */
export function filterValidQuestions(questions: DynamicQuestion[]): {
  valid: DynamicQuestion[]
  invalid: DynamicQuestion[]
  validationResults: ValidationResult[]
} {
  const validation = validateQuestions(questions)
  const valid: DynamicQuestion[] = []
  const invalid: DynamicQuestion[] = []

  questions.forEach((question, index) => {
    const result = validation.results[index]
    if (result.valid) {
      valid.push(question)
    } else {
      invalid.push(question)
      console.warn(`[VALIDATION] Invalid question filtered out:`, {
        id: question.id,
        text: question.label?.substring(0, 50),
        errors: result.errors,
      })
    }
  })

  return {
    valid,
    invalid,
    validationResults: validation.results,
  }
}

