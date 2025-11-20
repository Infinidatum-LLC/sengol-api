/**
 * Trial System Configuration
 *
 * Defines trial duration, feature limits, and pricing tier constants
 * for the hybrid trial system implementation.
 *
 * Decision: Shared with Sengol frontend via Neon PostgreSQL
 * - Trial duration: 7 days
 * - Feature limits enforced at backend API level
 * - Pricing tiers: Free, Professional, Enterprise
 */

export const TRIAL_DURATION_DAYS = 7

/**
 * Feature limits by pricing tier
 * -1 = Unlimited
 * 0 = Disabled
 * N > 0 = Monthly limit of N
 */
export const PRICING_TIER_LIMITS = {
  free: {
    incidentSearch: 5,
    riskAssessment: 5,
    complianceCheck: -1, // Unlimited
    reportGeneration: 0, // Disabled
    batchOperations: 2,
  },
  trial: {
    incidentSearch: 5,
    riskAssessment: 5,
    complianceCheck: -1, // Unlimited
    reportGeneration: 0, // Disabled
    batchOperations: 2,
  },
  consultant: {
    incidentSearch: -1, // Unlimited
    riskAssessment: -1,
    complianceCheck: -1,
    reportGeneration: -1,
    batchOperations: -1,
  },
  professional: {
    incidentSearch: -1, // Unlimited
    riskAssessment: -1,
    complianceCheck: -1,
    reportGeneration: -1,
    batchOperations: -1,
  },
  enterprise: {
    incidentSearch: -1, // Unlimited
    riskAssessment: -1,
    complianceCheck: -1,
    reportGeneration: -1,
    batchOperations: -1,
  },
} as const

/**
 * Trial limit constants
 * Used for quick feature limit checks
 */
export const TRIAL_LIMITS = {
  incidentSearch: 5,
  riskAssessment: 5,
  complianceCheck: -1, // Unlimited
  reportGeneration: 0,
  batchOperations: 2,
} as const

/**
 * User subscription tiers
 * Determines which features and limits apply to a user
 */
export type PricingTier = 'free' | 'trial' | 'consultant' | 'professional' | 'enterprise'

/**
 * Feature types that can be limited
 */
export type FeatureType = keyof typeof TRIAL_LIMITS

/**
 * Trial status constants
 */
export const TRIAL_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  NOT_STARTED: 'not_started',
} as const

/**
 * Subscription status constants
 */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
} as const

/**
 * Cache configuration for subscription data
 */
export const CACHE_CONFIG = {
  SUBSCRIPTION_TTL_MS: 5 * 60 * 1000, // 5 minutes
  TRIAL_STATUS_TTL_MS: 5 * 60 * 1000, // 5 minutes
  FEATURE_USAGE_TTL_MS: 2 * 60 * 1000, // 2 minutes
} as const

/**
 * Error messages (user-friendly, non-technical)
 */
export const ERROR_MESSAGES = {
  TRIAL_LIMIT_REACHED: 'Feature not available for your tier',
  SUBSCRIPTION_REQUIRED: 'Subscription required to access this feature',
  TRIAL_EXPIRED: 'Your trial has expired. Please upgrade to continue.',
  INVALID_TIER: 'Invalid subscription tier',
} as const
