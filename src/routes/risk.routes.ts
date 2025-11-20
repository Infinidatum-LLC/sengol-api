import { FastifyInstance } from 'fastify'
import {
  calculateRiskWeightsController,
  evidenceBasedAnalysisController,
} from '../controllers/risk.controller'

export async function riskRoutes(fastify: FastifyInstance) {
  fastify.post('/risk/calculate-weights', calculateRiskWeightsController)
  fastify.post('/risk/evidence-based-analysis', evidenceBasedAnalysisController)
}
