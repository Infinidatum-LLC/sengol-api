import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { config } from './config/env'
import { reviewRoutes } from './routes/review.routes'
import { authRoutes } from './routes/auth.routes'
import { healthRoutes } from './routes/health.routes'

export async function build() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel
    }
  })

  // Register plugins
  await fastify.register(cors, {
    origin: config.allowedOrigins,
    credentials: true
  })

  await fastify.register(helmet)

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  })

  // Register routes
  await fastify.register(healthRoutes)
  await fastify.register(authRoutes)
  await fastify.register(reviewRoutes)

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error)

    const statusCode = error.statusCode || 500
    const message = statusCode === 500 ? 'Internal Server Error' : error.message

    reply.code(statusCode).send({
      error: message,
      statusCode
    })
  })

  return fastify
}

// Start server
async function start() {
  try {
    const fastify = await build()

    await fastify.listen({
      port: config.port,
      host: '0.0.0.0'
    })

    console.log(`🚀 Sengol API running at http://localhost:${config.port}`)
  } catch (err) {
    console.error('Error starting server:', err)
    process.exit(1)
  }
}

if (require.main === module) {
  start()
}
