import mqtt from 'mqtt'
import { env } from '../config/env'
import { setEspConnected } from '../state'

const AIO_BROKER  = 'mqtts://io.adafruit.com'
const POMPE_FEED  = `${env.AIO_USERNAME}/feeds/pompe`

let client: mqtt.MqttClient | null = null

// ── Connect ───────────────────────────────────────────────────────

export function connectAdafruit(): void {
  client = mqtt.connect(AIO_BROKER, {
    username:        env.AIO_USERNAME,
    password:        env.AIO_KEY,
    reconnectPeriod: 5_000,
    keepalive:       60,
  })

  client.on('connect', () => {
    console.log('[Adafruit IO] Connected — broker io.adafruit.com')
    setEspConnected(true)
  })

  client.on('reconnect', () =>
    console.log('[Adafruit IO] Reconnecting…'),
  )

  client.on('offline', () => {
    console.warn('[Adafruit IO] Offline')
    setEspConnected(false)
  })

  client.on('error', (err) =>
    console.error('[Adafruit IO] Error:', err.message),
  )

  client.on('close', () => {
    console.warn('[Adafruit IO] Connection closed')
    setEspConnected(false)
  })
}

// ── Publish ───────────────────────────────────────────────────────

export function publishPompe(value: '1' | '0'): boolean {
  if (!client?.connected) {
    console.warn('[Adafruit IO] Cannot publish — not connected')
    return false
  }
  client.publish(POMPE_FEED, value, { qos: 1, retain: true })
  console.log(`[Adafruit IO] Published → ${POMPE_FEED} = ${value}`)
  return true
}

export function isAdafruitConnected(): boolean {
  return client?.connected === true
}
