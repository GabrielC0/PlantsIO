// ── Domain types ────────────────────────────────────────────────

export type DayOfWeek = 'Lun' | 'Mar' | 'Mer' | 'Jeu' | 'Ven' | 'Sam' | 'Dim'
export type WateringMode = 'auto' | 'manual'
export type SessionStatus = 'completed' | 'in_progress' | 'aborted'

export interface ScheduleDto {
  id: string
  name: string
  enabled: boolean
  times: string[]
  activeDays: DayOfWeek[]
  duration: number
  createdAt: string
  updatedAt: string
}

export interface SessionDto {
  id: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  volumeLiters: number
  mode: WateringMode
  scheduleId: string | null
  scheduleName?: string | null
  triggeredBy: string
  status: SessionStatus
  date: string
  startTime: string
}

export interface SystemStateDto {
  pumpOn: boolean
  autoMode: boolean
  espConnected: boolean
  espLastSeen: string | null
  currentSessionId: string | null
}

export interface EspStateDto {
  connected: boolean
  lastSeen: string | null
  ip: string | null
  firmware: string | null
}

// ── API response wrapper ─────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true
  data: T
  error: null
}

export interface ApiError {
  success: false
  data: null
  error: { code: string; message: string }
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ── WebSocket messages ───────────────────────────────────────────

export type WsEventType =
  | 'state:pump'
  | 'state:esp'
  | 'state:mode'
  | 'session:started'
  | 'session:ended'
  | 'session:tick'
  | 'schedules:updated'

export interface WsMessage {
  type: string
  payload: Record<string, unknown>
  ts: string
}

// ── Custom error ─────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
