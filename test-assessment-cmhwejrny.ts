/**
 * Test incident search for assessment cmhwejrny0001xyl42xjy9kua
 * Medical imaging AI system for radiology
 */
import { findSimilarIncidents } from './src/services/incident-search'

const systemDescription = `AI system assisting radiologists in detecting anomalies in medical imaging. Processes X-rays, CT scans, and MRIs using computer vision. Trained on 100K+ anonymized medical images. Provides confidence scores and highlights regions of interest. Integrated with hospital PACS system. Used by 20+ radiologists daily.`

async function test() {
  console.log('='.repeat(80))
  console.log('Testing Incident Search for Assessment: cmhwejrny0001xyl42xjy9kua')
  console.log('Industry: Financial Services & Banking')
  console.log('System: Medical imaging AI for radiology')
  console.log('='.repeat(80))
  console.log('')

  try {
    console.log('Searching for similar incidents...')
    const startTime = Date.now()

    const incidents = await findSimilarIncidents(systemDescription, {
      limit: 10,
      minSimilarity: 0.3,
    })

    const duration = Date.now() - startTime

    console.log('')
    console.log(`✅ Search completed in ${duration}ms`)
    console.log(`Found ${incidents.length} similar incidents`)
    console.log('')

    if (incidents.length === 0) {
      console.log('❌ WARNING: No incidents found!')
      console.log('Frontend will show 0 incidents - this is the problem!')
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
    console.log(`Frontend should show ${incidents.length} incidents, not 0!`)
    console.log('='.repeat(80))

    // Show unique industries
    const uniqueIndustries = [...new Set(incidents.map(i => i.industry).filter(Boolean))]
    console.log('')
    console.log(`Industries: ${uniqueIndustries.length > 0 ? uniqueIndustries.join(', ') : 'NONE'}`)

  } catch (error) {
    console.error('')
    console.error('❌ TEST FAILED')
    console.error('Error:', error)
    process.exit(1)
  }
}

test()
