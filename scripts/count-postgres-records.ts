import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('📊 PostgreSQL Record Count Check\n')
  console.log('═'.repeat(60))

  try {
    // Count all incident tables
    const cyberCount = await prisma.cyber_incident_staging.count()
    const cloudCount = await prisma.cloud_incident_staging.count()
    const failureCount = await prisma.failure_patterns.count()
    const vulnCount = await prisma.security_vulnerabilities.count()
    const regCount = await prisma.regulation_violations.count()

    console.log(`cyber_incident_staging:        ${cyberCount.toLocaleString().padStart(8)} records`)
    console.log(`cloud_incident_staging:        ${cloudCount.toLocaleString().padStart(8)} records`)
    console.log(`failure_patterns:              ${failureCount.toLocaleString().padStart(8)} records`)
    console.log(`security_vulnerabilities:      ${vulnCount.toLocaleString().padStart(8)} records`)
    console.log(`regulation_violations:         ${regCount.toLocaleString().padStart(8)} records`)
    console.log('─'.repeat(60))

    const total = cyberCount + cloudCount + failureCount + vulnCount + regCount
    console.log(`TOTAL:                         ${total.toLocaleString().padStart(8)} records`)
    console.log('═'.repeat(60))

    // Check for any other tables
    const allTables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma%'
      ORDER BY tablename
    `

    console.log('\n📋 All tables in database:')
    for (const table of allTables) {
      try {
        const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM "${table.tablename}"`)
        const recordCount = (count as any)[0].count
        console.log(`   ${table.tablename.padEnd(35)} ${String(recordCount).padStart(8)} records`)
      } catch (e) {
        console.log(`   ${table.tablename.padEnd(35)} ${' ERROR'.padStart(8)}`)
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
