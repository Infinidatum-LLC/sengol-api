/**
 * Response Helpers
 * 
 * Standardized response formatting for consistent API responses
 */

import { FastifyReply } from 'fastify'

/**
 * Standard success response
 */
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode = 200
): void {
  reply.status(statusCode).send({
    success: true,
    data,
  })
}

/**
 * Standard success response with message
 */
export function sendSuccessMessage(
  reply: FastifyReply,
  message: string,
  statusCode = 200
): void {
  reply.status(statusCode).send({
    success: true,
    message,
  })
}

/**
 * Standard created response
 */
export function sendCreated<T>(
  reply: FastifyReply,
  data: T
): void {
  sendSuccess(reply, data, 201)
}

/**
 * Standard error response
 */
export function sendError(
  reply: FastifyReply,
  error: string,
  code: string,
  statusCode: number
): void {
  reply.status(statusCode).send({
    success: false,
    error,
    code,
    statusCode,
  })
}

/**
 * Standard paginated response
 */
export function sendPaginated<T>(
  reply: FastifyReply,
  items: T[],
  total: number,
  page: number,
  limit: number,
  itemsKey = 'items'
): void {
  reply.status(200).send({
    success: true,
    [itemsKey]: items,
    total,
    page,
    limit,
  })
}

/**
 * Standard not found response
 */
export function sendNotFound(
  reply: FastifyReply,
  resource = 'Resource'
): void {
  sendError(reply, `${resource} not found`, 'NOT_FOUND', 404)
}

/**
 * Standard unauthorized response
 */
export function sendUnauthorized(
  reply: FastifyReply,
  message = 'User authentication required'
): void {
  sendError(reply, message, 'UNAUTHORIZED', 401)
}

/**
 * Standard forbidden response
 */
export function sendForbidden(
  reply: FastifyReply,
  message = 'You do not have permission to perform this action'
): void {
  sendError(reply, message, 'FORBIDDEN', 403)
}

/**
 * Standard validation error response
 */
export function sendValidationError(
  reply: FastifyReply,
  message: string,
  code = 'VALIDATION_ERROR'
): void {
  sendError(reply, message, code, 400)
}

/**
 * Standard internal error response
 */
export function sendInternalError(
  reply: FastifyReply,
  message = 'An internal error occurred',
  logError?: unknown
): void {
  if (logError) {
    // Log error for debugging (request.log should be available in context)
    console.error('Internal error:', logError)
  }
  sendError(reply, message, 'INTERNAL_ERROR', 500)
}

