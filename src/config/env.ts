import dotenv from 'dotenv'

dotenv.config()

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000'),
  apiVersion: process.env.API_VERSION || 'v1',

  // Database
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL,

  // d-vecDB
  dvecdbHost: process.env.DVECDB_HOST!,
  dvecdbPort: parseInt(process.env.DVECDB_PORT || '8080'),
  dvecdbCollection: process.env.DVECDB_COLLECTION || 'incidents',
  dvecdbTimeout: parseInt(process.env.DVECDB_TIMEOUT || '30000'),
  dvecdbMaxRetries: parseInt(process.env.DVECDB_MAX_RETRIES || '3'),

  // Auth
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  apiAuthToken: process.env.API_AUTH_TOKEN, // Optional: for API endpoint authentication

  // External services
  openaiApiKey: process.env.OPENAI_API_KEY!,
  openaiTimeout: parseInt(process.env.OPENAI_TIMEOUT || '60000'),
  openaiMaxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
  pythonBackendUrl: process.env.PYTHON_BACKEND_URL!,

  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Caching
  cacheEnabled: process.env.CACHE_ENABLED !== 'false',
  cacheTtl: parseInt(process.env.CACHE_TTL || '3600'), // 1 hour default
  cacheMaxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),

  // Resilience
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '120000'), // 2 minutes
  shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '30000'), // 30 seconds
}

// Validate required env vars
const required = ['DATABASE_URL', 'JWT_SECRET', 'OPENAI_API_KEY']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}
