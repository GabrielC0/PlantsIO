// ── Types partagés front ↔ back ──────────────────────────────────

export type DayOfWeek = 'Lun' | 'Mar' | 'Mer' | 'Jeu' | 'Ven' | 'Sam' | 'Dim'
export type WateringMode = 'auto' | 'manual'

export interface Schedule {
  id: string
  name: string
  enabled: boolean
  times: string[]
  activeDays: DayOfWeek[]
  duration: number
}

export interface Session {
  id: string
  date: string
  startTime: string
  durationSeconds: number
  volumeLiters: number
  mode: WateringMode
  status: string
}

export interface LastWatering {
  date: string
  startTime: string
  durationSeconds: number
  volumeLiters: number
  mode: string
  relativeLabel: string
}

export interface NextWatering {
  scheduledAt: string
  scheduleId: string
  scheduleName: string
  durationSeconds: number
}

export interface SystemState {
  pumpOn: boolean
  autoMode: boolean
  espConnected: boolean
  espLastSeen: string | null
  currentSessionId: string | null
  lastWatering: LastWatering | null
  nextWatering: NextWatering | null
  todayConsumptionLiters: number
}

export interface WeeklyStat {
  day: string
  date: string
  durationSeconds: number
  volumeLiters: number
  sessions: number
}

export interface MonthlyStat {
  month: string
  year: number
  volumeLiters: number
  durationSeconds: number
  sessions: number
}

export interface HistoryPage {
  items: Session[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

// ── HTTP client ──────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error?.message || `API error ${res.status}`)
  }
  return json.data as T
}

// ── API surface ───────────────────────────────────────────────────

export const api = {
  // ── System ──────────────────────────────────────────────────────
  getSystemState: () =>
    request<SystemState>('/api/v1/system/state'),

  // ── Pump ────────────────────────────────────────────────────────
  pumpOn: (durationSeconds?: number) =>
    request<{ sessionId: string; startedAt: string; autoStopAt: string; mode: string }>(
      '/api/v1/pump/on',
      { method: 'POST', body: JSON.stringify(durationSeconds ? { durationSeconds } : {}) },
    ),

  pumpOff: () =>
    request<{ sessionId: string; endedAt: string; durationSeconds: number; volumeLiters: number }>(
      '/api/v1/pump/off',
      { method: 'POST', body: '{}' },
    ),

  // ── Mode ────────────────────────────────────────────────────────
  setMode: (autoMode: boolean) =>
    request<{ autoMode: boolean; updatedAt: string }>(
      '/api/v1/mode',
      { method: 'PUT', body: JSON.stringify({ autoMode }) },
    ),

  // ── Schedules ───────────────────────────────────────────────────
  getSchedules: () =>
    request<Schedule[]>('/api/v1/schedules'),

  saveSchedules: (schedules: Partial<Schedule>[]) =>
    request<{ saved: number; created: number; updated: number }>(
      '/api/v1/schedules',
      { method: 'PUT', body: JSON.stringify({ schedules }) },
    ),

  deleteSchedule: (id: string) =>
    request<{ deleted: boolean }>(`/api/v1/schedules/${id}`, { method: 'DELETE' }),

  // ── History ─────────────────────────────────────────────────────
  getHistory: (limit = 20) =>
    request<HistoryPage>(`/api/v1/history?limit=${limit}`),

  getRecentActivity: (limit = 5) =>
    request<Session[]>(`/api/v1/history/recent?limit=${limit}`),

  // ── Stats ────────────────────────────────────────────────────────
  getWeeklyStats: () =>
    request<WeeklyStat[]>('/api/v1/stats/weekly'),

  getMonthlyStats: (months = 6) =>
    request<MonthlyStat[]>(`/api/v1/stats/monthly?months=${months}`),
}
