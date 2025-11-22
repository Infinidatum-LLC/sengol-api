/**
 * Subscription & Trial Queries
 *
 * Database queries for managing user subscriptions and trial status.
 * Uses shared Neon PostgreSQL connection to Sengol database.
 */

import { query } from '../lib/db'
import { PricingTier, PRICING_TIER_LIMITS, FeatureType, TRIAL_DURATION_DAYS } from '../config/trial'
import { randomUUID } from 'crypto'
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
 * 2. ProductAccess with ENTERPRISE access type (legacy paid access)
 * 3. Active trial
 * 4. Free/Community tier (default)
 */
export async function getUserSubscription(userId: string): Promise<{ tier: PricingTier; status: string }> {
  try {
    // Check for active paid subscription (ToolSubscription)
    const toolSubResult = await query(
      `SELECT "planId", "status" FROM "ToolSubscription" WHERE "userId" = $1 AND "status" = 'active' ORDER BY "createdAt" DESC LIMIT 1`,
      [userId]
    )

    if (toolSubResult.rows.length > 0) {
      const row = toolSubResult.rows[0]
      const tier = (row.planId.toLowerCase() as PricingTier) || 'free'
      return { tier, status: row.status }
    }

    // Check for ProductAccess with ENTERPRISE access type (legacy paid access)
    const productAccessResult = await query(
      `SELECT "accessType" FROM "ProductAccess" WHERE "userId" = $1 AND "status" = 'ACTIVE' AND "accessType" = 'ENTERPRISE' LIMIT 1`,
      [userId]
    )

    if (productAccessResult.rows.length > 0) {
      return { tier: 'enterprise', status: 'active' }
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
    // Check for active subscription with trial
    const subscriptionResult = await query(
      `SELECT "trialEnds", "createdAt" FROM "ToolSubscription" 
       WHERE "userId" = $1 AND "status" = 'active' 
       ORDER BY "createdAt" DESC LIMIT 1`,
      [userId]
    )

    if (subscriptionResult.rows.length > 0) {
      const subscription = subscriptionResult.rows[0]
      const trialEnds = subscription.trialEnds ? new Date(subscription.trialEnds) : null
      const now = new Date()

      if (trialEnds && trialEnds > now) {
        const daysRemaining = Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return {
          isActive: true,
          isExpired: false,
          startedAt: subscription.createdAt ? new Date(subscription.createdAt) : null,
          endsAt: trialEnds,
          daysRemaining,
        }
      } else if (trialEnds && trialEnds <= now) {
        return {
          isActive: false,
          isExpired: true,
          startedAt: subscription.createdAt ? new Date(subscription.createdAt) : null,
          endsAt: trialEnds,
          daysRemaining: 0,
        }
      }
    }

    // No active trial
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
    const { used, limit } = await getFeatureUsage(userId, feature)
    
    // -1 means unlimited
    if (limit === -1) {
      return false
    }

    return used >= limit
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
    // Check if user has reached limit
    const hasReachedLimit = await hasReachedTrialLimit(userId, feature)
    if (hasReachedLimit) {
      const { used, limit } = await getFeatureUsage(userId, feature)
      const { tier } = await getUserSubscription(userId)
      throw new TrialLimitError(feature, used, limit, tier)
    }

    // For now, we don't have a dedicated usage tracking table
    // Usage is tracked implicitly through feature usage (assessments, projects, etc.)
    // This function succeeds if limit check passes
    // In the future, we can add a ToolUsage or FeatureUsage table for detailed tracking
    
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
    const { tier } = await getUserSubscription(userId)
    const limit = PRICING_TIER_LIMITS[tier][feature]

    // Map feature types to actual database queries
    let used = 0

    switch (feature) {
      case 'riskAssessment':
        // Count assessments (Review records) created this month
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)
        const assessmentResult = await query(
          `SELECT COUNT(*) as count FROM "Review" 
           WHERE "userId" = $1 AND "createdAt" >= $2`,
          [userId, startOfMonth.toISOString()]
        )
        used = parseInt(assessmentResult.rows[0]?.count || '0', 10)
        break

      case 'incidentSearch':
        // For now, return 0 - incident search usage would need separate tracking
        used = 0
        break

      case 'complianceCheck':
        // Count compliance assessments
        used = 0 // Would need compliance-specific tracking
        break

      case 'reportGeneration':
        // Count generated reports
        used = 0 // Would need report-specific tracking
        break

      case 'batchOperations':
        // Count batch operations
        used = 0 // Would need batch operation tracking
        break

      default:
        used = 0
    }

    return { used, limit }
  } catch (error) {
    throw new DatabaseError('getFeatureUsage', error as Error)
  }
}

/**
 * Helper: Map feature to database field name
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
    const now = new Date()
    const endsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
    const trialUuid = randomUUID()

    // Create a trial subscription record
    await query(
      `INSERT INTO "ToolSubscription" (
        "id", "userId", "planId", "status", "trialEnds", 
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT DO NOTHING`,
      [trialUuid, userId, 'trial', 'active', endsAt.toISOString()]
    )

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
    // Update trial subscription status to expired
    await query(
      `UPDATE "ToolSubscription" 
       SET "status" = 'expired', "updatedAt" = NOW()
       WHERE "userId" = $1 AND "planId" = 'trial' AND "status" = 'active'`,
      [userId]
    )

    return { userId, status: 'expired' }
  } catch (error) {
    throw new DatabaseError('expireTrial', error as Error)
  }
}
