/**
 * Verify Database Schema
 * 
 * Checks that all required tables exist in the database
 */

import { query } from '../src/lib/db'
import dotenv from 'dotenv'

dotenv.config()

async function verifySchema() {
  try {
    console.log('Verifying database schema...\n')

    const requiredTables = [
      'User',
      'Project',
      'RiskAssessment',
      'ToolSubscription',
      'Vendor',
      'Policy',
      'AssessmentSchedule',
      'PolicyViolation',
      'ProductAccess',
      'EmailVerification',
      'PasswordResetToken',
    ]

    const results: { table: string; exists: boolean; columns?: number }[] = []

    for (const tableName of requiredTables) {
      try {
        // Check if table exists by querying its structure
        const result = await query(
          `SELECT column_name, data_type 
           FROM information_schema.columns 
           WHERE table_name = $1 
           ORDER BY ordinal_position`,
          [tableName]
        )

        if (result.rows.length > 0) {
          results.push({
            table: tableName,
            exists: true,
            columns: result.rows.length,
          })
          console.log(`✅ ${tableName} - EXISTS (${result.rows.length} columns)`)
        } else {
          results.push({
            table: tableName,
            exists: false,
          })
          console.log(`❌ ${tableName} - MISSING`)
        }
      } catch (error: any) {
        // If query fails, table likely doesn't exist
        results.push({
          table: tableName,
          exists: false,
        })
        console.log(`❌ ${tableName} - ERROR: ${error.message}`)
      }
    }

    console.log('\n=== Summary ===')
    const existing = results.filter((r) => r.exists).length
    const missing = results.filter((r) => !r.exists).length

    console.log(`Total tables: ${requiredTables.length}`)
    console.log(`✅ Existing: ${existing}`)
    console.log(`❌ Missing: ${missing}`)

    if (missing === 0) {
      console.log('\n🎉 All required tables exist!')
      process.exit(0)
    } else {
      console.log('\n⚠️  Some tables are missing. Please run migrations.')
      process.exit(1)
    }
  } catch (error) {
    console.error('Error verifying schema:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Run verification
verifySchema()

