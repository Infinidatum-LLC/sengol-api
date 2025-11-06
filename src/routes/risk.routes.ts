import { FastifyInstance } from 'fastify'
import {
  calculateRiskWeightsController,
  evidenceBasedAnalysisController,
} from '../controllers/risk.controller'

export async function riskRoutes(fastify: FastifyInstance) {
  fastify.post('/api/risk/calculate-weights', calculateRiskWeightsController)
  fastify.post('/api/risk/evidence-based-analysis', evidenceBasedAnalysisController)
}
