/**
 * Test script for Council API
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('=== Finding existing users ===')

  const users = await prisma.user.findMany({
    take: 5,
    select: {
      id: true,
      email: true,
      role: true
    }
  })

  console.log(`Found ${users.length} users:`)
  users.forEach(u => {
    console.log(`  - ${u.email} (${u.id}) [${u.role}]`)
  })

  if (users.length === 0) {
    console.log('\n⚠️  No users found. Creating a test user...')
    const testUser = await prisma.user.create({
      data: {
        email: 'test.partner@sengol.ai',
        name: 'Test Partner',
        role: 'user'
      }
    })
    console.log(`✅ Created test user: ${testUser.email} (${testUser.id})`)
    console.log(`\nUse this userId to add a member: ${testUser.id}`)
  } else {
    console.log(`\nUse one of these userIds to add a member`)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
