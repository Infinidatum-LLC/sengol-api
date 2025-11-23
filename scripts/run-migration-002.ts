/**
 * Run migration 002: Add user onboarding fields
 * 
 * This script adds the onboarding fields to the User table:
 * - eulaAccepted (boolean)
 * - onboardingCompleted (boolean)
 * - onboardingCompletedAt (timestamp)
 * 
 * Usage:
 *   tsx scripts/run-migration-002.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { query } from '../src/lib/db'
import dotenv from 'dotenv'

dotenv.config()

async function runMigration() {
  try {
    console.log('Starting migration 002: Add user onboarding fields...')

    // Read the SQL file
    const sqlPath = join(__dirname, '002-add-user-onboarding-fields.sql')
    const sql = readFileSync(sqlPath, 'utf-8')

    // Split by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    for (const statement of statements) {
      if (statement.length > 0) {
        console.log(`Executing: ${statement.substring(0, 50)}...`)
        await query(statement)
      }
    }

    console.log('✅ Migration 002 completed successfully!')
    console.log('\nAdded columns to User table:')
    console.log('  - eulaAccepted (BOOLEAN, default: false)')
    console.log('  - onboardingCompleted (BOOLEAN, default: false)')
    console.log('  - onboardingCompletedAt (TIMESTAMP, nullable)')
    console.log('\nCreated indexes:')
    console.log('  - idx_user_onboardingCompleted')
    console.log('  - idx_user_eulaAccepted')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Run the migration
runMigration()

