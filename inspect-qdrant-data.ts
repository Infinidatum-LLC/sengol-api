/**
 * Inspect Qdrant Data Structure
 *
 * This script directly examines the payload structure of points
 * in the Qdrant collection to understand what fields exist.
 */

import { QdrantClient } from '@qdrant/js-client-rest'

const QDRANT_HOST = (process.env.QDRANT_HOST || '34.44.96.148').trim()
const QDRANT_PORT = parseInt((process.env.QDRANT_PORT || '6333').trim())
const COLLECTION_NAME = 'sengol_incidents_full'

async function inspectData() {
  console.log('\n========================================')
  console.log('Qdrant Data Structure Inspection')
  console.log('========================================\n')

  const qdrant = new QdrantClient({
    url: `http://${QDRANT_HOST}:${QDRANT_PORT}`,
  })

  // Get 10 sample points to examine structure
  const sample = await qdrant.scroll(COLLECTION_NAME, {
    limit: 10,
    with_payload: true,
    with_vector: false,
  })

  console.log(`Total points retrieved: ${sample.points.length}\n`)

  sample.points.forEach((point, idx) => {
    console.log(`\n========== Point ${idx + 1} (ID: ${point.id}) ==========`)
    console.log('Payload keys:', Object.keys(point.payload || {}))
    console.log('\nFull payload:')
    console.log(JSON.stringify(point.payload, null, 2))
  })

  console.log('\n========================================')
  console.log('Inspection Complete')
  console.log('========================================\n')
}

inspectData().catch(console.error)
