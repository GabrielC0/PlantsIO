import { db } from '../db/client'
import { setPump, getState } from '../state'
import { publishPompe, isAdafruitConnected } from './adafruit.service'
import { AppError } from '../types'
import { env } from '../config/env'

let autoStopTimer: NodeJS.Timeout | null = null

// ── Start pump ────────────────────────────────────────────────────

export async function startPump(opts: {
  durationSeconds?: number
  mode?:            'auto' | 'manual'
  scheduleId?:      string
  triggeredBy?:     string
}): Promise<{ sessionId: string; startedAt: string; autoStopAt: string }> {

  const state = getState()

  if (state.pumpOn) {
    throw new AppError(409, 'PUMP_ALREADY_ON', 'La pompe est déjà en marche.')
  }
  if (!isAdafruitConnected()) {
    throw new AppError(503, 'AIO_DISCONNECTED', "Adafruit IO n'est pas joignable.")
  }

  const {
    durationSeconds = env.PUMP_MAX_DURATION_SECONDS,
    mode            = 'manual',
    scheduleId      = null,
    triggeredBy     = 'user',
  } = opts

  const effectiveDuration = Math.min(durationSeconds, env.PUMP_MAX_DURATION_SECONDS)
  const startedAt = new Date()

  const session = await db.wateringSession.create({
    data: { startedAt, mode, scheduleId, triggeredBy, status: 'in_progress' },
  })

  setPump(true, session.id)
  publishPompe('1')

  const autoStopAt = new Date(startedAt.getTime() + effectiveDuration * 1_000)

  // Auto-stop watchdog
  autoStopTimer = setTimeout(() => {
    stopPump('auto-stop', session.id).catch(console.error)
  }, effectiveDuration * 1_000)

  return {
    sessionId: session.id,
    startedAt: startedAt.toISOString(),
    autoStopAt: autoStopAt.toISOString(),
  }
}

// ── Stop pump ─────────────────────────────────────────────────────

export async function stopPump(
  triggeredBy: string = 'user',
  sessionIdOverride?: string,
): Promise<{ sessionId: string; endedAt: string; durationSeconds: number; volumeLiters: number; status: string }> {

  const state = getState()
  const sessionId = sessionIdOverride ?? state.currentSessionId

  if (!state.pumpOn && !sessionId) {
    throw new AppError(409, 'PUMP_ALREADY_OFF', 'La pompe est déjà arrêtée.')
  }

  clearTimers()
  publishPompe('0')

  const endedAt = new Date()
  const status  = triggeredBy === 'auto-stop' ? 'completed' : 'aborted'

  let durationSeconds = 0
  let volumeLiters    = 0

  if (sessionId) {
    const session = await db.wateringSession.findUnique({ where: { id: sessionId } })
    if (session) {
      durationSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1_000)
      volumeLiters    = +(durationSeconds * env.FLOW_RATE_LITERS_PER_SECOND).toFixed(2)
      await db.wateringSession.update({
        where: { id: sessionId },
        data:  { endedAt, durationSeconds, volumeLiters, status },
      })
    }
  }

  setPump(false, null)

  return { sessionId: sessionId!, endedAt: endedAt.toISOString(), durationSeconds, volumeLiters, status }
}

// ── Called when ESP32 disconnects mid-session ─────────────────────

export async function abortSessionOnEspDisconnect(sessionId: string): Promise<void> {
  clearTimers()

  const endedAt = new Date()
  const session = await db.wateringSession.findUnique({ where: { id: sessionId } })

  if (session) {
    const durationSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1_000)
    const volumeLiters    = +(durationSeconds * env.FLOW_RATE_LITERS_PER_SECOND).toFixed(2)
    await db.wateringSession.update({
      where: { id: sessionId },
      data:  { endedAt, durationSeconds, volumeLiters, status: 'aborted' },
    })
  }

  setPump(false, null)
}

// ── Helpers ──────────────────────────────────────────────────────

function clearTimers(): void {
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null }
}
