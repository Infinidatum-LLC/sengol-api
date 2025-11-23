/**
 * Run Migration 003: Create AI Risk Council Tables
 * 
 * Creates the following tables:
 * - Policy
 * - AssessmentSchedule
 * - PolicyViolation
 * - ProductAccess (if not exists)
 */

import { query } from '../src/lib/db'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

dotenv.config()

async function runMigration() {
  try {
    console.log('Starting migration: 003-create-council-tables.sql')

    const migrationSqlPath = join(__dirname, '003-create-council-tables.sql')
    const migrationSql = readFileSync(migrationSqlPath, 'utf8')

    // Execute migration
    await query(migrationSql)

    console.log('Migration 003-create-council-tables.sql completed successfully.')
    console.log('\nCreated tables:')
    console.log('  - Policy')
    console.log('  - AssessmentSchedule')
    console.log('  - PolicyViolation')
    console.log('  - ProductAccess (if not exists)')
  } catch (error) {
    console.error('Error running migration 003-create-council-tables.sql:', error)
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

