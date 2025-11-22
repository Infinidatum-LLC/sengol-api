/**
 * Calculations Routes
 *
 * API endpoints for ROI Calculator calculations (CRUD operations).
 *
 * Created: November 2025
 */

import { FastifyInstance } from 'fastify'
import {
  listCalculations,
  createCalculation,
  getCalculation,
  updateCalculation,
  deleteCalculation
} from '../controllers/calculations.controller'

export async function calculationsRoutes(fastify: FastifyInstance) {
  // List all user calculations
  fastify.get('/calculations', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Optional project ID to filter by' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            calculations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  userId: { type: 'string' },
                  projectId: { type: 'string' },
                  name: { type: 'string' },
                  notes: { type: ['string', 'null'] },
                  inputs: { type: 'object' },
                  results: { type: 'object' },
                  project: {
                    type: ['object', 'null'],
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      color: { type: ['string', 'null'] }
                    }
                  },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, listCalculations)

  // Create new calculation
  fastify.post('/calculations', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          notes: { type: 'string' },
          projectId: { type: 'string' },
          inputs: { type: 'object' },
          results: { type: 'object' }
        },
        required: ['name', 'projectId', 'inputs', 'results']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            calculation: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                projectId: { type: 'string' },
                name: { type: 'string' },
                notes: { type: ['string', 'null'] },
                inputs: { type: 'object' },
                results: { type: 'object' },
                project: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    color: { type: ['string', 'null'] }
                  }
                },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, createCalculation)

  // Get specific calculation
  fastify.get('/api/calculations/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Calculation ID' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            calculation: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                projectId: { type: 'string' },
                name: { type: 'string' },
                notes: { type: ['string', 'null'] },
                inputs: { type: 'object' },
                results: { type: 'object' },
                project: {
                  type: ['object', 'null'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    color: { type: ['string', 'null'] }
                  }
                },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, getCalculation)

  // Update calculation
  fastify.put('/calculations/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Calculation ID' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          notes: { type: 'string' },
          inputs: { type: 'object' },
          results: { type: 'object' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            calculation: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                projectId: { type: 'string' },
                name: { type: 'string' },
                notes: { type: ['string', 'null'] },
                inputs: { type: 'object' },
                results: { type: 'object' },
                project: {
                  type: ['object', 'null'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    color: { type: ['string', 'null'] }
                  }
                },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, updateCalculation)

  // Delete calculation
  fastify.delete('/calculations/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Calculation ID' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, deleteCalculation)
}
