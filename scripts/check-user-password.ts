/**
 * Check User Password Script
 * 
 * Checks if a user exists and verifies password
 */

import { query } from '../src/lib/db'
import { verifyPassword } from '../src/lib/password.service'
import dotenv from 'dotenv'

dotenv.config()

async function checkUser() {
  try {
    const email = process.argv[2] || 'durai@sengol.ai'
    const testPassword = process.argv[3] || 'test'
    
    console.log('Checking user:', email)
    console.log('Testing password:', testPassword)
    console.log('')
    
    const result = await query(
      `SELECT "id", "email", "password", "name", "emailVerified", "role" FROM "User" WHERE "email" = $1 LIMIT 1`,
      [email.toLowerCase()]
    )
    
    if (result.rows.length === 0) {
      console.log('❌ User not found in database')
      process.exit(1)
    }
    
    const user = result.rows[0]
    console.log('✅ User found:')
    console.log('  ID:', user.id)
    console.log('  Email:', user.email)
    console.log('  Name:', user.name || '(not set)')
    console.log('  Role:', user.role || 'user')
    console.log('  Email Verified:', user.emailVerified ? 'Yes' : 'No')
    console.log('  Password Hash:', user.password ? `${user.password.substring(0, 30)}...` : 'NULL')
    console.log('')
    
    // Test password verification
    if (!user.password) {
      console.log('❌ Password hash is NULL - user needs to reset password')
      console.log('')
      console.log('To reset password, use:')
      console.log('  npm run reset-password <email> <new-password>')
      process.exit(1)
    }
    
    console.log('🔐 Testing password verification...')
    const isValid = await verifyPassword(testPassword, user.password)
    
    if (isValid) {
      console.log('✅ Password is CORRECT!')
    } else {
      console.log('❌ Password is INCORRECT!')
      console.log('')
      console.log('The password you tested does not match the stored hash.')
      console.log('Either:')
      console.log('  1. The password is wrong')
      console.log('  2. The password needs to be reset')
    }
    
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkUser()

