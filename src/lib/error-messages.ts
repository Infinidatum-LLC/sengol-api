/**
 * Enhanced Error Messages with Actionable Guidance
 * 
 * Provides user-friendly error messages with actionable steps to resolve issues.
 */

export interface ErrorContext {
  operation: string
  errorType: string
  details?: Record<string, any>
  userId?: string
  assessmentId?: string
}

export interface ActionableError {
  message: string
  userMessage: string
  actionableSteps: string[]
  errorCode: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  retryable: boolean
  estimatedFixTime?: string
}

/**
 * Generate actionable error message based on error type and context
 */
export function generateActionableError(
  error: Error | unknown,
  context: ErrorContext
): ActionableError {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorName = error instanceof Error ? error.name : 'UnknownError'

  // LLM Provider Errors
  if (errorMessage.includes('All LLM providers failed') || errorMessage.includes('API key')) {
    return {
      message: errorMessage,
      userMessage: 'AI question generation is temporarily unavailable. This usually happens when API services are experiencing issues.',
      actionableSteps: [
        'Your system description has been saved successfully',
        'You can continue with standard questions in Step 2',
        'Try again in a few minutes - the system will automatically retry',
        'If this persists, contact support with your assessment ID'
      ],
      errorCode: 'LLM_UNAVAILABLE',
      severity: 'high',
      retryable: true,
      estimatedFixTime: '2-5 minutes'
    }
  }

  // Rate Limit Errors
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
    return {
      message: errorMessage,
      userMessage: 'The AI service is currently handling many requests. Please wait a moment.',
      actionableSteps: [
        'Your progress has been saved',
        'Wait 30-60 seconds and try again',
        'The system will automatically retry with a different provider',
        'You can continue with standard questions if needed'
      ],
      errorCode: 'RATE_LIMIT',
      severity: 'medium',
      retryable: true,
      estimatedFixTime: '30-60 seconds'
    }
  }

  // Timeout Errors
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out') || errorName === 'AbortError') {
    return {
      message: errorMessage,
      userMessage: 'Question generation is taking longer than expected. This can happen with complex systems.',
      actionableSteps: [
        'Your system description has been saved',
        'You can continue with standard questions in Step 2',
        'Try regenerating questions later - they will be cached for faster loading',
        'Consider simplifying your system description if this happens frequently'
      ],
      errorCode: 'TIMEOUT',
      severity: 'medium',
      retryable: true,
      estimatedFixTime: '1-2 minutes'
    }
  }

  // Network Errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
    return {
      message: errorMessage,
      userMessage: 'Unable to connect to the question generation service. Please check your internet connection.',
      actionableSteps: [
        'Check your internet connection',
        'Your progress has been saved locally',
        'Try refreshing the page',
        'If using a VPN, try disconnecting it',
        'You can continue with standard questions'
      ],
      errorCode: 'NETWORK_ERROR',
      severity: 'high',
      retryable: true,
      estimatedFixTime: 'Immediate (after connection restored)'
    }
  }

  // Validation Errors
  if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
    return {
      message: errorMessage,
      userMessage: 'Some required information is missing or invalid.',
      actionableSteps: [
        'Review the highlighted fields in the form',
        'Ensure system description is at least 50 characters',
        'Select at least one industry and domain',
        'Check that all required fields are filled'
      ],
      errorCode: 'VALIDATION_ERROR',
      severity: 'low',
      retryable: false,
      estimatedFixTime: 'Immediate'
    }
  }

  // Database Errors
  if (errorMessage.includes('database') || errorMessage.includes('SQL') || errorMessage.includes('connection')) {
    return {
      message: errorMessage,
      userMessage: 'Unable to save your assessment data. This is a temporary issue.',
      actionableSteps: [
        'Your data is safe - it\'s stored locally in your browser',
        'Try saving again in a few moments',
        'If this persists, copy your system description before refreshing',
        'Contact support if the issue continues'
      ],
      errorCode: 'DATABASE_ERROR',
      severity: 'high',
      retryable: true,
      estimatedFixTime: '1-3 minutes'
    }
  }

  // Cache Errors
  if (errorMessage.includes('cache') || errorMessage.includes('storage')) {
    return {
      message: errorMessage,
      userMessage: 'Unable to store questions temporarily. This won\'t affect your assessment.',
      actionableSteps: [
        'Your assessment data is saved in the database',
        'Questions will be regenerated when needed',
        'Try clearing your browser cache if this persists',
        'You can continue normally'
      ],
      errorCode: 'CACHE_ERROR',
      severity: 'low',
      retryable: true,
      estimatedFixTime: 'Immediate'
    }
  }

  // Generic Error
  return {
    message: errorMessage,
    userMessage: 'An unexpected error occurred. Don\'t worry - your progress has been saved.',
    actionableSteps: [
      'Your system description has been saved',
      'You can continue with standard questions in Step 2',
      'Try refreshing the page',
      'If this continues, contact support with your assessment ID'
    ],
    errorCode: 'UNKNOWN_ERROR',
    severity: 'medium',
    retryable: true,
    estimatedFixTime: 'Unknown'
  }
}

/**
 * Format error for display in UI
 */
export function formatErrorForUI(error: ActionableError): {
  title: string
  message: string
  steps: string[]
  canRetry: boolean
  canContinue: boolean
} {
  const severityEmojis = {
    low: 'ℹ️',
    medium: '⚠️',
    high: '🔴',
    critical: '🚨'
  }

  return {
    title: `${severityEmojis[error.severity]} ${error.userMessage}`,
    message: error.message,
    steps: error.actionableSteps,
    canRetry: error.retryable,
    canContinue: true // Always allow continuing with standard questions
  }
}

