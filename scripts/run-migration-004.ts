/**
 * Run Migration 004: Create Vendor Table
 * 
 * Creates the Vendor table for AI Risk Council
 */

import { query } from '../src/lib/db'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

dotenv.config()

async function runMigration() {
  try {
    console.log('Starting migration: 004-create-vendor-table.sql')

    const migrationSqlPath = join(__dirname, '004-create-vendor-table.sql')
    const migrationSql = readFileSync(migrationSqlPath, 'utf8')

    // Execute migration
    await query(migrationSql)

    console.log('Migration 004-create-vendor-table.sql completed successfully.')
    console.log('\nCreated table:')
    console.log('  - Vendor')
  } catch (error) {
    console.error('Error running migration 004-create-vendor-table.sql:', error)
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

