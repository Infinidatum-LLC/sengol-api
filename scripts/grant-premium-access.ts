/**
 * Grant Premium Access to All Existing Users
 * 
 * This script grants premium access to all existing users in the database
 * by creating ToolSubscription records with planId='premium' and status='active'.
 * 
 * Run this script once to upgrade all existing users to premium tier.
 * 
 * Usage:
 *   npx tsx scripts/grant-premium-access.ts
 */

import { query } from '../src/lib/db'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

async function grantPremiumAccess() {
  try {
    console.log('Starting premium access grant for all users...')

    // Get all users
    const usersResult = await query(`SELECT "id", "email" FROM "User"`)
    const users = usersResult.rows

    console.log(`Found ${users.length} users to upgrade`)

    if (users.length === 0) {
      console.log('No users found. Exiting.')
      return
    }

    let successCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const user of users) {
      try {
        // Check if user already has an active premium subscription
        const existingSub = await query(
          `SELECT "id" FROM "ToolSubscription" 
           WHERE "userId" = $1 AND "planId" = 'premium' AND "status" = 'active' 
           LIMIT 1`,
          [user.id]
        )

        if (existingSub.rows.length > 0) {
          console.log(`  ✓ User ${user.email} already has premium access - skipping`)
          skippedCount++
          continue
        }

        // Create premium subscription
        const subscriptionId = randomUUID()
        const now = new Date()
        const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year from now

        // First, check if there's an existing subscription (any plan) and update it
        const existingAnySub = await query(
          `SELECT "id" FROM "ToolSubscription" 
           WHERE "userId" = $1 AND "status" = 'active' 
           LIMIT 1`,
          [user.id]
        )

        if (existingAnySub.rows.length > 0) {
          // Update existing subscription to premium
          await query(
            `UPDATE "ToolSubscription" 
             SET "planId" = $1, 
                 "currentPeriodStart" = $2,
                 "currentPeriodEnd" = $3,
                 "updatedAt" = NOW()
             WHERE "userId" = $4 AND "status" = 'active'`,
            ['premium', now.toISOString(), oneYearFromNow.toISOString(), user.id]
          )
        } else {
          // Create new premium subscription
          await query(
            `INSERT INTO "ToolSubscription" (
              "id", "userId", "planId", "status", 
              "currentPeriodStart", "currentPeriodEnd",
              "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
            [
              subscriptionId,
              user.id,
              'premium',
              'active',
              now.toISOString(),
              oneYearFromNow.toISOString(),
            ]
          )
        }

        console.log(`  ✓ Granted premium access to ${user.email}`)
        successCount++
      } catch (error) {
        console.error(`  ✗ Error granting premium access to ${user.email}:`, error)
        errorCount++
      }
    }

    console.log('\n=== Summary ===')
    console.log(`Total users: ${users.length}`)
    console.log(`Successfully upgraded: ${successCount}`)
    console.log(`Already had premium: ${skippedCount}`)
    console.log(`Errors: ${errorCount}`)
    console.log('\nPremium access grant completed!')
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  } finally {
    // Close database connection
    process.exit(0)
  }
}

// Run the script
grantPremiumAccess()

