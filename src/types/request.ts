/**
 * Common Request Types
 * 
 * Shared type definitions for Fastify requests to improve type safety
 */

import { FastifyRequest } from 'fastify'

/**
 * Authenticated request with user ID from JWT
 */
export interface AuthenticatedRequest extends FastifyRequest {
  userId?: string
}

/**
 * Request with geography account ID in headers
 */
export interface GeographyRequest extends AuthenticatedRequest {
  headers: {
    'x-geography-account-id'?: string
    [key: string]: string | undefined
  }
}

/**
 * Pagination query parameters
 */
export interface PaginationQuery {
  page?: string
  limit?: string
}

/**
 * Standard pagination response
 */
export interface PaginationResponse<T> {
  success: true
  data?: T[]
  total: number
  page: number
  limit: number
}

/**
 * Extract user ID from authenticated request
 */
export function getUserId(request: AuthenticatedRequest): string {
  const userId = (request as any).userId
  if (!userId) {
    throw new Error('User ID not found in token')
  }
  return userId
}

/**
 * Extract geography account ID from request headers
 */
export function getGeographyAccountId(request: GeographyRequest, defaultValue = 'default'): string {
  return request.headers['x-geography-account-id'] || defaultValue
}

/**
 * Parse pagination parameters from query
 */
export function parsePagination(query: PaginationQuery): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10))
  const limit = Math.min(parseInt(query.limit || '50', 10), 100)
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

