import 'dotenv/config'

function req(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

export const env = {
  PORT:                        parseInt(process.env.PORT ?? '3001', 10),
  NODE_ENV:                    process.env.NODE_ENV ?? 'development',
  DATABASE_URL:                req('DATABASE_URL'),
  ESP32_WS_SECRET:             process.env.ESP32_WS_SECRET ?? 'esp32-plantsio-secret',
  PUMP_MAX_DURATION_SECONDS:   parseInt(process.env.PUMP_MAX_DURATION_SECONDS ?? '3600', 10),
  FLOW_RATE_LITERS_PER_SECOND: parseFloat(process.env.FLOW_RATE_LITERS_PER_SECOND ?? '0.15'),
  TIMEZONE:                    process.env.TIMEZONE ?? 'Europe/Paris',
  CORS_ORIGIN:                 process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  AIO_USERNAME:                req('AIO_USERNAME'),
  AIO_KEY:                     req('AIO_KEY'),
}
