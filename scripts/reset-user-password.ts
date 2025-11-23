/**
 * Reset User Password Script
 * 
 * Resets a user's password in the database
 */

import { query } from '../src/lib/db'
import { hashPassword } from '../src/lib/password.service'
import dotenv from 'dotenv'

dotenv.config()

async function resetPassword() {
  try {
    const email = process.argv[2]
    const newPassword = process.argv[3]
    
    if (!email || !newPassword) {
      console.log('Usage: npm run reset-password <email> <new-password>')
      console.log('Example: npm run reset-password durai@sengol.ai MyNewPassword123')
      process.exit(1)
    }
    
    if (newPassword.length < 8) {
      console.log('❌ Password must be at least 8 characters')
      process.exit(1)
    }
    
    console.log('Resetting password for:', email)
    console.log('')
    
    // Check if user exists
    const userResult = await query(
      `SELECT "id", "email" FROM "User" WHERE "email" = $1 LIMIT 1`,
      [email.toLowerCase()]
    )
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found in database')
      process.exit(1)
    }
    
    const user = userResult.rows[0]
    console.log('✅ User found:', user.email)
    
    // Hash new password
    console.log('Hashing new password...')
    const hashedPassword = await hashPassword(newPassword)
    
    // Update password
    await query(
      `UPDATE "User" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [hashedPassword, user.id]
    )
    
    console.log('✅ Password reset successfully!')
    console.log('')
    console.log('User can now login with:')
    console.log('  Email:', email)
    console.log('  Password:', newPassword)
    
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

resetPassword()

