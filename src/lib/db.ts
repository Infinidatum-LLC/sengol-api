import { Pool, PoolClient, QueryResult } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

/**
 * PostgreSQL connection pool
 * Manages database connections with configurable pooling
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max number of connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
})

/**
 * Execute a query with automatic connection management
 */
export async function query<T = any>(
  text: string,
  values?: (string | number | boolean | null)[],
): Promise<QueryResult<T>> {
  const start = Date.now()
  try {
    const result = await pool.query<T>(text, values)
    const duration = Date.now() - start
    console.log(`Query executed: ${duration}ms`)
    return result
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

/**
 * Execute multiple queries in a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Get a single client for manual transaction control
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect()
}

/**
 * Close the pool
 */
export async function closePool(): Promise<void> {
  await pool.end()
}

export default pool
