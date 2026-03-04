import cron, { type ScheduledTask } from 'node-cron'
import { db } from '../db/client'
import { getState } from '../state'
import { startPump } from './pump.service'
import type { DayOfWeek } from '../types'

// ── Day-of-week mapping ─────────────────────────────────────────
const DAY_TO_CRON: Record<DayOfWeek, number> = {
  Dim: 0, Lun: 1, Mar: 2, Mer: 3, Jeu: 4, Ven: 5, Sam: 6,
}

const tasks = new Map<string, ScheduledTask[]>()

// ── Load (or reload) all enabled schedules ──────────────────────

export async function loadSchedules(timezone: string): Promise<void> {
  // Stop and clear all existing tasks
  for (const list of tasks.values()) list.forEach((t) => t.stop())
  tasks.clear()

  const { autoMode } = getState()
  if (!autoMode) {
    console.log('[Scheduler] autoMode is OFF — no tasks registered')
    return
  }

  const schedules = await db.schedule.findMany({ where: { enabled: true } })

  for (const schedule of schedules) {
    const times      = schedule.times      as string[]
    const activeDays = schedule.activeDays as DayOfWeek[]

    if (activeDays.length === 0 || times.length === 0) continue

    const dayList  = activeDays.map((d) => DAY_TO_CRON[d]).join(',')
    const taskList: ScheduledTask[] = []

    for (const time of times) {
      const [h, m] = time.split(':').map(Number)
      const expr   = `${m} ${h} * * ${dayList}`

      const task = cron.schedule(
        expr,
        async () => {
          const state = getState()
          if (!state.autoMode) return
          if (state.pumpOn) {
            console.log(`[Scheduler] Skip "${schedule.name}" — pump already ON`)
            return
          }

          // Re-check schedule still exists and is enabled
          const fresh = await db.schedule.findUnique({ where: { id: schedule.id } })
          if (!fresh?.enabled) return

          console.log(`[Scheduler] Triggering "${schedule.name}" (${time})`)
          try {
            await startPump({
              durationSeconds: schedule.duration,
              mode:            'auto',
              scheduleId:      schedule.id,
              triggeredBy:     'scheduler',
            })
          } catch (err: any) {
            if (err?.code === 'AIO_DISCONNECTED') {
              // Retry once after 30 s — Adafruit IO might be briefly unavailable
              setTimeout(async () => {
                const s = getState()
                if (!s.autoMode || s.pumpOn) return
                try {
                  await startPump({ durationSeconds: schedule.duration, mode: 'auto', scheduleId: schedule.id, triggeredBy: 'scheduler-retry' })
                  console.log(`[Scheduler] Retry succeeded for "${schedule.name}"`)
                } catch (retryErr) {
                  console.error(`[Scheduler] Retry failed for "${schedule.name}":`, retryErr)
                }
              }, 30_000)
            }
            console.error(`[Scheduler] Failed to start "${schedule.name}":`, err)
          }
        },
        { timezone },
      )

      taskList.push(task)
      console.log(`[Scheduler] Registered "${schedule.name}" @ ${expr} (tz: ${timezone})`)
    }

    tasks.set(schedule.id, taskList)
  }

  console.log(`[Scheduler] ${schedules.length} schedule(s) loaded, ${[...tasks.values()].flat().length} task(s) active`)
}

// ── Compute next upcoming watering ────────────────────────────────

export interface NextWatering {
  scheduledAt:     string
  scheduleId:      string
  scheduleName:    string
  durationSeconds: number
}

export async function getNextWatering(): Promise<NextWatering | null> {
  const { autoMode } = getState()
  if (!autoMode) return null

  const schedules = await db.schedule.findMany({ where: { enabled: true } })
  const now       = new Date()
  let earliest: { at: Date; schedule: typeof schedules[0] } | null = null

  for (const schedule of schedules) {
    const times      = schedule.times      as string[]
    const activeDays = schedule.activeDays as DayOfWeek[]

    for (const time of times) {
      const [h, m] = time.split(':').map(Number)

      // Check next 7 days
      for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(now)
        candidate.setDate(candidate.getDate() + offset)
        candidate.setHours(h, m, 0, 0)

        if (candidate <= now) continue

        const dow      = candidate.getDay()
        const dayLabel = (Object.entries(DAY_TO_CRON) as [DayOfWeek, number][])
          .find(([, v]) => v === dow)?.[0]

        if (!dayLabel || !activeDays.includes(dayLabel)) continue

        if (!earliest || candidate < earliest.at) {
          earliest = { at: candidate, schedule }
        }
        break
      }
    }
  }

  if (!earliest) return null

  return {
    scheduledAt:     earliest.at.toISOString(),
    scheduleId:      earliest.schedule.id,
    scheduleName:    earliest.schedule.name,
    durationSeconds: earliest.schedule.duration,
  }
}
