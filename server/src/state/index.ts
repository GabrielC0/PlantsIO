import { env } from '../config/env'
import type { SystemStateDto, EspStateDto } from '../types'

// ── In-memory runtime state (not persisted except autoMode) ─────

interface MutableSystemState extends SystemStateDto {
  flowRate: number
}

const _state: MutableSystemState = {
  pumpOn:           false,
  autoMode:         false,
  espConnected:     false,
  espLastSeen:      null,
  currentSessionId: null,
  flowRate:         env.FLOW_RATE_LITERS_PER_SECOND,
}

const _esp: EspStateDto & { wsConnected: boolean } = {
  connected:   false,
  lastSeen:    null,
  ip:          null,
  firmware:    null,
  wsConnected: false,
}

// ── Readers ──────────────────────────────────────────────────────

export const getState  = (): Readonly<MutableSystemState> => ({ ..._state })
export const getEsp    = (): Readonly<typeof _esp>        => ({ ..._esp })

// ── Mutators ─────────────────────────────────────────────────────

export function setPump(on: boolean, sessionId: string | null = null): void {
  _state.pumpOn           = on
  _state.currentSessionId = on ? sessionId : null
}

export function setAutoMode(autoMode: boolean): void {
  _state.autoMode = autoMode
}

export function setEspConnected(
  connected: boolean,
  opts: { ip?: string; firmware?: string } = {},
): void {
  _esp.connected   = connected
  _esp.wsConnected = connected
  _esp.lastSeen    = new Date().toISOString()
  if (opts.ip)       _esp.ip       = opts.ip
  if (opts.firmware) _esp.firmware = opts.firmware

  _state.espConnected = connected
  _state.espLastSeen  = _esp.lastSeen
}

export function heartbeatEsp(opts: { ip?: string; firmware?: string } = {}): void {
  _esp.lastSeen       = new Date().toISOString()
  _state.espLastSeen  = _esp.lastSeen
  if (opts.ip)       _esp.ip       = opts.ip
  if (opts.firmware) _esp.firmware = opts.firmware
}

/** Called on boot to restore persisted value from DB */
export function restoreAutoMode(autoMode: boolean): void {
  _state.autoMode = autoMode
}
