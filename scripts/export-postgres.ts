import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const exportDir = '/tmp/postgres-export'

// Handle BigInt serialization for JSON
BigInt.prototype.toJSON = function() {
  return this.toString()
}

async function exportTable(tableName: string, fetchFunction: () => Promise<any[]>) {
  console.log(`\n📦 Exporting ${tableName}...`)
  const startTime = Date.now()

  try {
    const records = await fetchFunction()
    console.log(`   Found ${records.length} records`)

    if (records.length === 0) {
      console.log(`   ⏭️  Skipping empty table`)
      return { tableName, count: 0, file: null, error: null }
    }

    const filename = `${tableName}.json`
    const filepath = path.join(exportDir, filename)

    fs.writeFileSync(filepath, JSON.stringify(records, null, 2))

    const fileSizeMB = (fs.statSync(filepath).size / 1024 / 1024).toFixed(2)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log(`   ✓ Exported to ${filename} (${fileSizeMB} MB) in ${elapsed}s`)

    return { tableName, count: records.length, file: filename, sizeMB: fileSizeMB, error: null }
  } catch (error) {
    console.log(`   ❌ Export failed: ${error instanceof Error ? error.message : String(error)}`)
    return { tableName, count: 0, file: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function main() {
  console.log('🚀 PostgreSQL Data Export to JSON')
  console.log(`📁 Export directory: ${exportDir}\n`)

  const results = []

  // Export cyber incidents
  results.push(await exportTable('cyber_incident_staging', () =>
    prisma.cyber_incident_staging.findMany()
  ))

  // Export cloud incidents
  results.push(await exportTable('cloud_incident_staging', () =>
    prisma.cloud_incident_staging.findMany()
  ))

  // Export failure patterns
  results.push(await exportTable('failure_patterns', () =>
    prisma.failure_patterns.findMany()
  ))

  // Export security vulnerabilities
  results.push(await exportTable('security_vulnerabilities', () =>
    prisma.security_vulnerabilities.findMany()
  ))

  // Export regulation violations
  results.push(await exportTable('regulation_violations', () =>
    prisma.regulation_violations.findMany()
  ))

  // Export CEP (Complex Event Processing) data
  results.push(await exportTable('cep_signal_events', () =>
    prisma.cep_signal_events.findMany()
  ))

  results.push(await exportTable('cep_anomalies', () =>
    prisma.cep_anomalies.findMany()
  ))

  results.push(await exportTable('cep_pattern_templates', () =>
    prisma.cep_pattern_templates.findMany()
  ))

  // Export additional crawler data
  results.push(await exportTable('scraped_financial_data', () =>
    prisma.scraped_financial_data.findMany()
  ))

  results.push(await exportTable('ai_news', () =>
    prisma.ai_news.findMany()
  ))

  results.push(await exportTable('research_papers', () =>
    prisma.research_papers.findMany()
  ))

  results.push(await exportTable('risk_signals', () =>
    prisma.risk_signals.findMany()
  ))

  console.log('\n📊 Export Summary:')
  console.log('═'.repeat(60))

  let totalRecords = 0
  let totalSizeMB = 0

  results.forEach(r => {
    if (r.count > 0) {
      console.log(`   ${r.tableName.padEnd(30)} ${String(r.count).padStart(6)} records  ${r.sizeMB} MB`)
      totalRecords += r.count
      totalSizeMB += parseFloat(r.sizeMB!)
    }
  })

  console.log('─'.repeat(60))
  console.log(`   ${'TOTAL'.padEnd(30)} ${String(totalRecords).padStart(6)} records  ${totalSizeMB.toFixed(2)} MB`)
  console.log('═'.repeat(60))

  await prisma.$disconnect()
}

main().catch(console.error)
