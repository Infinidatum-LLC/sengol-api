import { query, transaction, getClient } from './db'
import { PoolClient, QueryResult } from 'pg'

/**
 * Database query builders and helpers
 * Provides type-safe, parameterized query builders
 */

// ============ SELECT QUERIES ============

export async function selectOne<T = any>(
  table: string,
  where: Record<string, any>,
): Promise<T | null> {
  const keys = Object.keys(where)
  const whereClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
  const values = keys.map((k) => where[k])

  const result = await query<T>(
    `SELECT * FROM "${table}" WHERE ${whereClause} LIMIT 1`,
    values,
  )

  return result.rows[0] || null
}

export async function selectMany<T = any>(
  table: string,
  where?: Record<string, any>,
  limit?: number,
  offset?: number,
): Promise<T[]> {
  let sql = `SELECT * FROM "${table}"`
  const values: any[] = []

  if (where && Object.keys(where).length > 0) {
    const keys = Object.keys(where)
    const whereClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
    sql += ` WHERE ${whereClause}`
    values.push(...keys.map((k) => where[k]))
  }

  if (limit) {
    sql += ` LIMIT $${values.length + 1}`
    values.push(limit)
  }

  if (offset) {
    sql += ` OFFSET $${values.length + 1}`
    values.push(offset)
  }

  const result = await query<T>(sql, values)
  return result.rows
}

export async function count(
  table: string,
  where?: Record<string, any>,
): Promise<number> {
  let sql = `SELECT COUNT(*) as count FROM "${table}"`
  const values: any[] = []

  if (where && Object.keys(where).length > 0) {
    const keys = Object.keys(where)
    const whereClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
    sql += ` WHERE ${whereClause}`
    values.push(...keys.map((k) => where[k]))
  }

  const result = await query<{ count: string }>(sql, values)
  return parseInt(result.rows[0]?.count || '0', 10)
}

// ============ INSERT QUERIES ============

export async function insertOne<T = any>(
  table: string,
  data: Record<string, any>,
): Promise<T> {
  const keys = Object.keys(data)
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  const columns = keys.map((k) => `"${k}"`).join(', ')
  const values = keys.map((k) => data[k])

  const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`

  const result = await query<T>(sql, values)
  return result.rows[0]
}

export async function insertMany<T = any>(
  table: string,
  data: Record<string, any>[],
): Promise<T[]> {
  if (!data || data.length === 0) {
    return []
  }

  const keys = Object.keys(data[0])
  const columns = keys.map((k) => `"${k}"`).join(', ')

  let valueIndex = 1
  const placeholders = data
    .map(() => {
      const ph = keys.map(() => `$${valueIndex++}`).join(', ')
      return `(${ph})`
    })
    .join(', ')

  const values = data.flatMap((row) => keys.map((k) => row[k]))

  const sql = `INSERT INTO "${table}" (${columns}) VALUES ${placeholders} RETURNING *`

  const result = await query<T>(sql, values)
  return result.rows
}

// ============ UPDATE QUERIES ============

export async function updateOne<T = any>(
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
): Promise<T | null> {
  const updateKeys = Object.keys(data)
  const whereKeys = Object.keys(where)

  let valueIndex = 1
  const setClause = updateKeys
    .map((k) => `"${k}" = $${valueIndex++}`)
    .join(', ')

  const whereClause = whereKeys
    .map((k) => `"${k}" = $${valueIndex++}`)
    .join(' AND ')

  const values = [
    ...updateKeys.map((k) => data[k]),
    ...whereKeys.map((k) => where[k]),
  ]

  const sql = `UPDATE "${table}" SET ${setClause} WHERE ${whereClause} RETURNING *`

  const result = await query<T>(sql, values)
  return result.rows[0] || null
}

export async function updateMany<T = any>(
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
): Promise<T[]> {
  const updateKeys = Object.keys(data)
  const whereKeys = Object.keys(where)

  let valueIndex = 1
  const setClause = updateKeys
    .map((k) => `"${k}" = $${valueIndex++}`)
    .join(', ')

  const whereClause = whereKeys
    .map((k) => `"${k}" = $${valueIndex++}`)
    .join(' AND ')

  const values = [
    ...updateKeys.map((k) => data[k]),
    ...whereKeys.map((k) => where[k]),
  ]

  const sql = `UPDATE "${table}" SET ${setClause} WHERE ${whereClause} RETURNING *`

  const result = await query<T>(sql, values)
  return result.rows
}

// ============ DELETE QUERIES ============

export async function deleteOne(
  table: string,
  where: Record<string, any>,
): Promise<boolean> {
  const keys = Object.keys(where)
  const whereClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
  const values = keys.map((k) => where[k])

  const result = await query(
    `DELETE FROM "${table}" WHERE ${whereClause}`,
    values,
  )
  return result.rowCount ? result.rowCount > 0 : false
}

export async function deleteMany(
  table: string,
  where: Record<string, any>,
): Promise<number> {
  const keys = Object.keys(where)
  const whereClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
  const values = keys.map((k) => where[k])

  const result = await query(
    `DELETE FROM "${table}" WHERE ${whereClause}`,
    values,
  )
  return result.rowCount || 0
}

// ============ TRANSACTION HELPERS ============

export async function transactionInsertOne<T = any>(
  client: PoolClient,
  table: string,
  data: Record<string, any>,
): Promise<T> {
  const keys = Object.keys(data)
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  const columns = keys.map((k) => `"${k}"`).join(', ')
  const values = keys.map((k) => data[k])

  const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) RETURNING *`

  const result = await client.query<T>(sql, values)
  return result.rows[0]
}

export async function transactionUpdateOne<T = any>(
  client: PoolClient,
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
): Promise<T | null> {
  const updateKeys = Object.keys(data)
  const whereKeys = Object.keys(where)

  let valueIndex = 1
  const setClause = updateKeys
    .map((k) => `"${k}" = $${valueIndex++}`)
    .join(', ')

  const whereClause = whereKeys
    .map((k) => `"${k}" = $${valueIndex++}`)
    .join(' AND ')

  const values = [
    ...updateKeys.map((k) => data[k]),
    ...whereKeys.map((k) => where[k]),
  ]

  const sql = `UPDATE "${table}" SET ${setClause} WHERE ${whereClause} RETURNING *`

  const result = await client.query<T>(sql, values)
  return result.rows[0] || null
}

export async function transactionSelectOne<T = any>(
  client: PoolClient,
  table: string,
  where: Record<string, any>,
): Promise<T | null> {
  const keys = Object.keys(where)
  const whereClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
  const values = keys.map((k) => where[k])

  const result = await client.query<T>(
    `SELECT * FROM "${table}" WHERE ${whereClause} LIMIT 1`,
    values,
  )

  return result.rows[0] || null
}
