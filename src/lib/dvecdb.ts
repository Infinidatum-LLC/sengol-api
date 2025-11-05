import { VectorDBClient } from 'd-vecdb'
import { config } from '../config/env'

export const dvecdbClient = new VectorDBClient({
  host: config.dvecdbHost,
  port: config.dvecdbPort,
  timeout: 30000
})
