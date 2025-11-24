/**
 * Script to grant AI Council Complete access to ALL users
 * Usage: npx tsx scripts/grant-council-access-all.ts
 */

import { query } from '../src/lib/db'
import { randomUUID } from 'crypto'

async function grantAccessToAll() {
  try {
    console.log(`[1/4] Fetching all users...`)
    
    // Get all users
    const usersResult = await query(
      `SELECT id, email, role FROM "User" ORDER BY "createdAt" DESC`,
      []
    )
    
    if (usersResult.rows.length === 0) {
      console.log(`❌ No users found`)
      process.exit(1)
    }
    
    console.log(`✅ Found ${usersResult.rows.length} users`)
    
    let granted = 0
    let updated = 0
    let skipped = 0
    const errors: Array<{ email: string; error: string }> = []
    
    console.log(`[2/4] Processing users...`)
    
    for (const user of usersResult.rows) {
      const userId = user.id
      const email = user.email
      
      try {
        // Check if access already exists
        const existingResult = await query(
          `SELECT id, status, "expiresAt" FROM "ProductAccess" 
           WHERE "userId" = $1 AND "productSlug" = $2`,
          [userId, 'ai-council-complete']
        )
        
        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0]
          
          // Update to active if needed
          if (existing.status !== 'active') {
            await query(
              `UPDATE "ProductAccess" 
               SET status = 'active', "expiresAt" = NULL, "updatedAt" = NOW()
               WHERE id = $1`,
              [existing.id]
            )
            updated++
            console.log(`  ✅ Updated: ${email}`)
          } else {
            skipped++
            console.log(`  ⏭️  Skipped (already active): ${email}`)
          }
        } else {
          // Grant new access
          const accessId = randomUUID()
          await query(
            `INSERT INTO "ProductAccess" 
             (id, "userId", "productSlug", status, "expiresAt", "createdAt", "updatedAt") 
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [accessId, userId, 'ai-council-complete', 'active', null]
          )
          granted++
          console.log(`  ✅ Granted: ${email}`)
        }
      } catch (error: any) {
        errors.push({ email, error: error.message })
        console.error(`  ❌ Error for ${email}: ${error.message}`)
      }
    }
    
    console.log(`\n[3/4] Summary:`)
    console.log(`  ✅ Granted: ${granted} users`)
    console.log(`  🔄 Updated: ${updated} users`)
    console.log(`  ⏭️  Skipped: ${skipped} users`)
    console.log(`  ❌ Errors: ${errors.length} users`)
    
    if (errors.length > 0) {
      console.log(`\n[4/4] Errors:`)
      errors.forEach(({ email, error }) => {
        console.log(`  - ${email}: ${error}`)
      })
    }
    
    console.log(`\n[4/4] Verifying access...`)
    
    // Verify total count
    const verifyResult = await query(
      `SELECT COUNT(*) as count 
       FROM "ProductAccess" 
       WHERE "productSlug" = $1 AND status = $2`,
      ['ai-council-complete', 'active']
    )
    
    const totalActive = parseInt(verifyResult.rows[0].count, 10)
    console.log(`✅ Total users with active AI Council access: ${totalActive}`)
    
    console.log(`\n🎉 Done! All users have been processed.`)
    
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

grantAccessToAll()

