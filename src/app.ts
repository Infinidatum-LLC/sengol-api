import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config/env'
import { reviewRoutes } from './routes/review.routes'
import { authRoutes } from './routes/auth.routes'
import { healthRoutes } from './routes/health.routes'
import { embeddingsRoutes } from './routes/embeddings.routes'
import { projectsRoutes } from './routes/projects.routes'
import { riskRoutes } from './routes/risk.routes'
import { assessmentsRoutes } from './routes/assessments.routes'
import { projectsGatedRoutes } from './routes/projects-gated.routes'
import { userRoutes } from './routes/user.routes'
import { vectorSearchRoutes } from './routes/vector-search.routes'
import { questionsRoutes } from './routes/questions.routes'
import { councilRoutes } from './routes/council.routes'
import { orchestratorRoutes } from './routes/orchestrator.routes'
import { requestTimeoutMiddleware } from './middleware/request-timeout'
import { requestLoggingMiddleware } from './middleware/request-logging'
import { AppError } from './lib/errors'
import { prisma } from './lib/prisma'
import { scheduleDailySync } from './services/incremental-sync.service'

export async function build() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            headers: request.headers,
            hostname: request.hostname,
            remoteAddress: request.ip,
            remotePort: request.socket?.remotePort,
          }
        },
      },
    },
    requestTimeout: config.requestTimeout,
    // Increase body size limits for large requests
    bodyLimit: 10 * 1024 * 1024, // 10MB
  })

  // Register plugins
  await fastify.register(cors, {
    origin: config.allowedOrigins,
    credentials: true,
  })

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    cache: 10000,
    allowList: ['127.0.0.1'],
    redis: config.redisUrl ? config.redisUrl : undefined,
    skipOnError: true,
  })

  // Global middleware
  fastify.addHook('onRequest', requestLoggingMiddleware)
  fastify.addHook('onRequest', requestTimeoutMiddleware)

  // Register routes
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(reviewRoutes)
  await fastify.register(embeddingsRoutes)
  await fastify.register(projectsRoutes)
  await fastify.register(riskRoutes)
  await fastify.register(assessmentsRoutes)
  await fastify.register(projectsGatedRoutes)
  await fastify.register(userRoutes)
  await fastify.register(vectorSearchRoutes)
  await fastify.register(questionsRoutes)
  await fastify.register(councilRoutes)
  await fastify.register(orchestratorRoutes, { prefix: '/api/orchestrator' })

  // Error handler with AppError support
  fastify.setErrorHandler((error, request, reply) => {
    // Log error with full details
    fastify.log.error({
      err: error,
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        body: request.body,
      },
    })

    // Handle AppError instances
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
        metadata: error.metadata,
      })
    }

    // Handle Fastify validation errors
    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: error.validation,
      })
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: 'Too many requests',
        code: 'RATE_LIMIT_ERROR',
        statusCode: 429,
        retryAfter: reply.getHeader('Retry-After'),
      })
    }

    // Default error response
    const statusCode = error.statusCode || 500
    const message = statusCode === 500 ? 'Internal Server Error' : error.message

    reply.code(statusCode).send({
      error: message,
      code: 'INTERNAL_ERROR',
      statusCode,
    })
  })

  // Graceful shutdown hooks
  fastify.addHook('onClose', async (instance) => {
    instance.log.info('Gracefully closing connections...')

    // Close database connections
    try {
      await prisma.$disconnect()
      instance.log.info('Database connections closed')
    } catch (error) {
      instance.log.error({ err: error }, 'Error closing database')
    }
  })

  return fastify
}

// Start server with graceful shutdown
async function start() {
  let fastify: any

  try {
    fastify = await build()

    await fastify.listen({
      port: config.port,
      host: '0.0.0.0',
    })

    console.log(`🚀 Sengol API running at http://localhost:${config.port}`)
    console.log(`📊 Health check: http://localhost:${config.port}/health`)
    console.log(`🔍 Detailed health: http://localhost:${config.port}/health/detailed`)

    // Start incremental sync for crawler data
    console.log(`🔄 Starting incremental data sync...`)
    const syncInterval = scheduleDailySync()

    // Store sync interval for cleanup on shutdown
    ;(fastify as any).syncInterval = syncInterval
  } catch (err) {
    console.error('Error starting server:', err)
    process.exit(1)
  }

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`)

    if (fastify) {
      try {
        // Clear sync interval
        if ((fastify as any).syncInterval) {
          clearInterval((fastify as any).syncInterval)
          console.log('Stopped incremental sync')
        }

        // Set timeout for graceful shutdown
        const shutdownTimer = setTimeout(() => {
          console.error('Forced shutdown after timeout')
          process.exit(1)
        }, config.shutdownTimeout)

        await fastify.close()
        clearTimeout(shutdownTimer)

        console.log('Server closed successfully')
        process.exit(0)
      } catch (error) {
        console.error('Error during shutdown:', error)
        process.exit(1)
      }
    }
  }

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error)
    gracefulShutdown('UNCAUGHT_EXCEPTION')
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    gracefulShutdown('UNHANDLED_REJECTION')
  })
}

// For Vercel serverless deployment
export default async function handler(req: any, res: any) {
  const fastify = await build()
  await fastify.ready()
  fastify.server.emit('request', req, res)
}

// For local development and traditional deployments
if (require.main === module) {
  start()
}
