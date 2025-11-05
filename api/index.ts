/**
 * Vercel Serverless Entry Point
 *
 * This file adapts the Fastify app for Vercel's serverless environment
 */

import { build } from '../src/app'
import { VercelRequest, VercelResponse } from '@vercel/node'

let app: Awaited<ReturnType<typeof build>> | null = null

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Reuse app instance (warm starts)
  if (!app) {
    app = await build()
    await app.ready()
  }

  // Inject Fastify request/response
  app.server.emit('request', req, res)
}
