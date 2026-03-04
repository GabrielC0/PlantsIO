import { WebSocket, WebSocketServer } from 'ws'
import { setEspConnected, heartbeatEsp, getState } from '../state'
// Called from index.ts to break the pump.service circular dep
type OnEspDisconnectFn = (currentSessionId: string) => Promise<void>
let onEspDisconnect: OnEspDisconnectFn = async () => {}

export function setOnEspDisconnect(fn: OnEspDisconnectFn): void {
  onEspDisconnect = fn
}

const ESP_HEARTBEAT_TIMEOUT_MS = 30_000

let espSocket: WebSocket | null = null
let heartbeatTimer: NodeJS.Timeout | null = null

export function attachEspGateway(wss: WebSocketServer): void {
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress ?? 'unknown'
    console.log(`[WS:ESP] Connected from ${ip}`)

    espSocket = ws
    setEspConnected(true, { ip })

    resetHeartbeatTimer()

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>
        handleMessage(msg)
        resetHeartbeatTimer()
      } catch {
        console.warn('[WS:ESP] Could not parse message')
      }
    })

    ws.on('close', () => handleDisconnect())
    ws.on('error', (err) => {
      console.error('[WS:ESP] Error:', err.message)
      handleDisconnect()
    })
  })
}

function handleMessage(msg: Record<string, unknown>): void {
  switch (msg.type) {
    case 'heartbeat': {
      const p = (msg.payload ?? {}) as { firmware?: string; uptime?: number }
      heartbeatEsp({ firmware: p.firmware })
      break
    }
    case 'pump:ack':
      console.log('[WS:ESP] pump:ack', msg.payload)
      break
    case 'pump:error':
      console.error('[WS:ESP] pump:error', msg.payload)
      break
    default:
      console.log('[WS:ESP] Unknown message:', msg.type)
  }
}

function resetHeartbeatTimer(): void {
  if (heartbeatTimer) clearTimeout(heartbeatTimer)
  heartbeatTimer = setTimeout(() => {
    console.warn('[WS:ESP] Heartbeat timeout — marking disconnected')
    handleDisconnect()
  }, ESP_HEARTBEAT_TIMEOUT_MS)
}

function handleDisconnect(): void {
  espSocket = null
  if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null }
  setEspConnected(false)

  const { pumpOn, currentSessionId } = getState()
  if (pumpOn && currentSessionId) {
    onEspDisconnect(currentSessionId).catch(console.error)
  }
}

export function sendToEsp(cmd: Record<string, unknown>): boolean {
  if (!espSocket || espSocket.readyState !== WebSocket.OPEN) return false
  espSocket.send(JSON.stringify(cmd))
  return true
}

export function isEspConnected(): boolean {
  return espSocket !== null && espSocket.readyState === WebSocket.OPEN
}
