/**
 * Script to grant AI Council Complete access to a user
 * Usage: npx tsx scripts/grant-council-access.ts <email>
 */

import { query } from '../src/lib/db'
import { randomUUID } from 'crypto'

async function grantAccess(email: string) {
  try {
    console.log(`[1/4] Looking up user: ${email}`)
    
    // Find user
    const userResult = await query(
      `SELECT id, email, role FROM "User" WHERE email = $1`,
      [email]
    )
    
    if (userResult.rows.length === 0) {
      console.error(`❌ User not found: ${email}`)
      process.exit(1)
    }
    
    const userId = userResult.rows[0].id
    const userRole = userResult.rows[0].role
    console.log(`✅ Found user:`, {
      id: userId,
      email: userResult.rows[0].email,
      role: userRole,
    })
    
    console.log(`[2/4] Checking existing access...`)
    
    // Check if access already exists
    const existingResult = await query(
      `SELECT id, status, "expiresAt" FROM "ProductAccess" 
       WHERE "userId" = $1 AND "productSlug" = $2`,
      [userId, 'ai-council-complete']
    )
    
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0]
      console.log(`⚠️  Access already exists:`, existing)
      
      // Update to active if needed
      if (existing.status !== 'active') {
        await query(
          `UPDATE "ProductAccess" 
           SET status = 'active', "expiresAt" = NULL, "updatedAt" = NOW()
           WHERE id = $1`,
          [existing.id]
        )
        console.log(`✅ Updated access to active`)
      } else {
        console.log(`✅ Access is already active`)
      }
    } else {
      console.log(`[3/4] Granting new access...`)
      
      // Grant access
      const accessId = randomUUID()
      await query(
        `INSERT INTO "ProductAccess" 
         (id, "userId", "productSlug", status, "expiresAt", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [accessId, userId, 'ai-council-complete', 'active', null]
      )
      
      console.log(`✅ Access granted successfully!`)
    }
    
    console.log(`[4/4] Verifying access...`)
    
    // Verify
    const verifyResult = await query(
      `SELECT pa.*, u.email 
       FROM "ProductAccess" pa 
       JOIN "User" u ON pa."userId" = u.id 
       WHERE u.email = $1 AND pa."productSlug" = $2`,
      [email, 'ai-council-complete']
    )
    
    if (verifyResult.rows.length > 0) {
      const access = verifyResult.rows[0]
      console.log(`\n✅ Verification successful:`)
      console.log({
        id: access.id,
        userId: access.userId,
        email: access.email,
        productSlug: access.productSlug,
        status: access.status,
        expiresAt: access.expiresAt || 'Never (lifetime)',
        createdAt: access.createdAt,
      })
      console.log(`\n🎉 User ${email} now has full AI Council access!`)
    } else {
      console.error(`❌ Verification failed - access not found`)
      process.exit(1)
    }
    
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

// Get email from command line argument
const email = process.argv[2] || 'durai@sengol.ai'

if (!email) {
  console.error('Usage: npx tsx scripts/grant-council-access.ts <email>')
  process.exit(1)
}

grantAccess(email)

