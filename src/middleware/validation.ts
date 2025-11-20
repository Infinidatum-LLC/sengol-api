/**
 * Request Validation Middleware using Zod
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { z, ZodSchema } from 'zod'
import { ValidationError } from '../lib/errors'

/**
 * Validate request body against Zod schema
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.body)
      request.body = validated
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Request validation failed: ' + JSON.stringify(error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        }))))
      }
      throw error
    }
  }
}

/**
 * Validate request query parameters against Zod schema
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.query)
      request.query = validated as any
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Query validation failed: ' + JSON.stringify(error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        }))))
      }
      throw error
    }
  }
}

/**
 * Validate request params against Zod schema
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.params)
      request.params = validated as any
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Params validation failed: ' + JSON.stringify(error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        }))))
      }
      throw error
    }
  }
}

// Common validation schemas
export const schemas = {
  // ID validation
  id: z.object({
    id: z.string().cuid(),
  }),

  // Generate questions request
  generateQuestions: z.object({
    systemDescription: z.string().min(10).max(10000),
    selectedDomains: z.array(z.enum(['ai', 'cyber', 'cloud', 'compliance'])).optional(),
    jurisdictions: z.array(z.string()).optional(),
    industry: z.string().optional(),
    companySize: z.string().optional(),
    budgetRange: z.string().optional(),
    selectedTech: z.array(z.string()).optional(),
    customTech: z.array(z.string()).optional(),
    techStack: z.array(z.string()).optional(),
    dataTypes: z.array(z.string()).optional(),
    systemCriticality: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }),

  // Auth schemas
  login: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),

  register: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(100),
    name: z.string().min(1).max(255).optional(),
    company: z.string().max(255).optional(),
  }),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  // Vector Search
  vectorSearch: z.object({
    query: z
      .string()
      .min(2, 'Query must be at least 2 characters')
      .max(500, 'Query must be at most 500 characters')
      .trim(),
    limit: z
      .coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(50, 'Limit must be at most 50')
      .optional()
      .default(10),
    type: z
      .enum(['research_paper', 'ai_news', 'regulation'])
      .optional()
      .nullable(),
  }),
}
