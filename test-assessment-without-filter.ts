/**
 * Test incident search for assessment cmhvalzy20003fsw85c8ue94l
 * WITHOUT industry filter to see raw results
 */
import { findSimilarIncidents } from './src/services/incident-search'

const systemDescription = `AI-powered chatbot handling customer inquiries for an e-commerce platform. Uses GPT-4 to understand customer questions and provide product recommendations. Processes order history, customer preferences, and payment information. Integrated with CRM and order management systems. Handles 10K+ conversations daily with 95% accuracy.`

async function test() {
  console.log('='.repeat(80))
  console.log('Testing Qdrant Search WITHOUT INDUSTRY FILTER')
  console.log('Assessment: cmhvalzy20003fsw85c8ue94l')
  console.log('System: AI-powered e-commerce chatbot')
  console.log('='.repeat(80))
  console.log('')

  try {
    console.log('Searching for similar incidents...')
    const startTime = Date.now()

    const incidents = await findSimilarIncidents(systemDescription, {
      limit: 10,
      minSimilarity: 0.3,
      // NO INDUSTRY FILTER - let's see what we get
    })

    const duration = Date.now() - startTime

    console.log('')
    console.log(`✅ Search completed in ${duration}ms`)
    console.log(`Found ${incidents.length} similar incidents`)
    console.log('')

    if (incidents.length === 0) {
      console.log('❌ WARNING: No incidents found!')
      console.log('This should not happen with the new Qdrant integration.')
      process.exit(1)
    }

    console.log('Top 10 Incidents:')
    console.log('-'.repeat(80))

    incidents.slice(0, 10).forEach((incident, i) => {
      console.log(`\n${i + 1}. ID: ${incident.incidentId}`)
      console.log(`   Type: ${incident.incidentType}`)
      console.log(`   Industry: ${incident.industry || 'N/A'}`)
      console.log(`   Severity: ${incident.severity || 'N/A'}`)
      console.log(`   Similarity: ${(incident.similarity * 100).toFixed(1)}%`)
      console.log(`   Cost: ${incident.estimatedCost ? '$' + incident.estimatedCost.toLocaleString() : 'N/A'}`)
      console.log(`   Date: ${incident.incidentDate ? incident.incidentDate.toISOString().split('T')[0] : 'N/A'}`)
      console.log(`   Summary: ${incident.embeddingText.substring(0, 120)}...`)
    })

    console.log('')
    console.log('='.repeat(80))
    console.log('✅ TEST PASSED - Incidents successfully retrieved')
    console.log('='.repeat(80))

    // Show unique industries in results
    const uniqueIndustries = [...new Set(incidents.map(i => i.industry).filter(Boolean))]
    console.log('')
    console.log(`Industries represented: ${uniqueIndustries.length > 0 ? uniqueIndustries.join(', ') : 'NONE'}`)

  } catch (error) {
    console.error('')
    console.error('❌ TEST FAILED')
    console.error('Error:', error)
    process.exit(1)
  }
}

test()
