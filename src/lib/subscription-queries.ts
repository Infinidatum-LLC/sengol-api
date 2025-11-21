/**
 * Subscription & Trial Queries
 *
 * Database queries for managing user subscriptions and trial status.
 * Uses shared Neon PostgreSQL connection to Sengol database.
 */

import { query } from '../lib/db'
import { PricingTier, PRICING_TIER_LIMITS, FeatureType, TRIAL_DURATION_DAYS } from '../config/trial'
import {
  TrialLimitError,
  SubscriptionError,
  TrialExpiredError,
  InvalidTierError,
  DatabaseError,
} from './errors'

/**
 * Get user's subscription tier
 * Determines which feature limits apply to the user
 *
 * Tier hierarchy (in order of precedence):
 * 1. Active paid subscription (ToolSubscription)
 * 2. Active trial
 * 3. Free/Community tier (default)
 */
export async function getUserSubscription(userId: string): Promise<{ tier: PricingTier; status: string }> {
  try {
    // Check for active paid subscription
    const result = await query(
      `SELECT "planId", "status" FROM "ToolSubscription" WHERE "userId" = $1 AND "status" = 'active' ORDER BY "createdAt" DESC LIMIT 1`,
      [userId]
    )

    if (result.rows.length > 0) {
      const row = result.rows[0]
      const tier = (row.planId.toLowerCase() as PricingTier) || 'free'
      return { tier, status: row.status }
    }

    // Default to free tier
    return { tier: 'free', status: 'active' }
  } catch (error) {
    throw new DatabaseError('getUserSubscription', error as Error)
  }
}

/**
 * Get detailed trial status for a user
 */
export async function getTrialStatus(userId: string) {
  try {
    // TODO: Trial status tracking requires database schema updates
    // This function is a stub for now - trial field support needs to be added to User model
    return {
      isActive: false,
      isExpired: false,
      startedAt: null,
      endsAt: null,
      daysRemaining: 0,
    }
  } catch (error) {
    throw new DatabaseError('getTrialStatus', error as Error)
  }
}

/**
 * Check if user has reached trial limit for a feature
 */
export async function hasReachedTrialLimit(userId: string, feature: FeatureType): Promise<boolean> {
  try {
    // TODO: Trial limits require database schema updates (trialUsage table)
    // For now, always return false (no limits enforced)
    return false
  } catch (error) {
    throw new DatabaseError('hasReachedTrialLimit', error as Error)
  }
}

/**
 * Get feature limit for a user's tier
 */
export async function getFeatureLimit(userId: string, feature: FeatureType): Promise<number> {
  try {
    const { tier } = await getUserSubscription(userId)
    const tierLimits = PRICING_TIER_LIMITS[tier]
    return tierLimits[feature]
  } catch (error) {
    throw new DatabaseError('getFeatureLimit', error as Error)
  }
}

/**
 * Increment feature usage for trial user
 */
export async function incrementFeatureUsage(userId: string, feature: FeatureType): Promise<boolean> {
  try {
    // TODO: Usage tracking requires database schema updates
    // For now, this is a stub that always succeeds
    return true
  } catch (error) {
    if (error instanceof TrialLimitError) {
      throw error
    }
    throw new DatabaseError('incrementFeatureUsage', error as Error)
  }
}

/**
 * Get user's current feature usage
 */
export async function getFeatureUsage(userId: string, feature: FeatureType): Promise<{ used: number; limit: number }> {
  try {
    // TODO: Usage tracking requires database schema updates
    const limit = PRICING_TIER_LIMITS.trial[feature]
    return { used: 0, limit }
  } catch (error) {
    throw new DatabaseError('getFeatureUsage', error as Error)
  }
}

/**
 * Helper: Map feature to Prisma TrialUsage field name
 */
function getUsageField(feature: FeatureType): string {
  const fieldMap: Record<FeatureType, string> = {
    incidentSearch: 'incidentSearchCount',
    riskAssessment: 'riskAssessmentCount',
    complianceCheck: 'complianceCheckCount',
    reportGeneration: 'reportGenerationCount',
    batchOperations: 'batchOperationsCount',
  }
  return fieldMap[feature] || `${feature}Count`
}

/**
 * Start a trial for a user
 */
export async function startTrial(userId: string) {
  try {
    // TODO: Trial start requires database schema updates
    const now = new Date()
    const endsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
    return { userId, trialStartedAt: now, trialEndsAt: endsAt }
  } catch (error) {
    throw new DatabaseError('startTrial', error as Error)
  }
}

/**
 * Expire a trial for a user
 */
export async function expireTrial(userId: string) {
  try {
    // TODO: Trial expiration requires database schema updates
    return { userId, status: 'expired' }
  } catch (error) {
    throw new DatabaseError('expireTrial', error as Error)
  }
}
