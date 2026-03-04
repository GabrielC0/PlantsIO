import { Router } from 'express'
import { db } from '../db/client'

const router = Router()

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']
const DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

router.get('/stats/today', async (_req, res, next) => {
  try {
    const start = new Date()
    start.setHours(0, 0, 0, 0)

    const rows = await db.wateringSession.findMany({
      where: { startedAt: { gte: start }, status: { in: ['completed', 'aborted'] } },
    })

    const volumeLiters    = rows.reduce((s, r) => s + r.volumeLiters, 0)
    const durationSeconds = rows.reduce((s, r) => s + r.durationSeconds, 0)
    const last = rows.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]

    res.json({
      success: true,
      data: {
        date:            start.toISOString().split('T')[0],
        volumeLiters:    +volumeLiters.toFixed(2),
        durationSeconds,
        sessions:        rows.length,
        lastSession:     last?.startedAt.toISOString() ?? null,
      },
      error: null,
    })
  } catch (err) { next(err) }
})

router.get('/stats/weekly', async (_req, res, next) => {
  try {
    const from = new Date()
    from.setDate(from.getDate() - 6)
    from.setHours(0, 0, 0, 0)

    const rows = await db.wateringSession.findMany({
      where: { startedAt: { gte: from }, status: { in: ['completed', 'aborted'] } },
    })

    const result = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)
      const key  = dayKey(date)
      const day  = rows.filter((r) => dayKey(r.startedAt) === key)

      result.push({
        day:             DAYS_FR[date.getDay()],
        date:            key,
        durationSeconds: day.reduce((s, r) => s + r.durationSeconds, 0),
        volumeLiters:    +day.reduce((s, r) => s + r.volumeLiters, 0).toFixed(2),
        sessions:        day.length,
      })
    }

    res.json({ success: true, data: result, error: null })
  } catch (err) { next(err) }
})

router.get('/stats/monthly', async (req, res, next) => {
  try {
    const months = Math.min(parseInt(String(req.query.months ?? '6'), 10), 12)

    const from = new Date()
    from.setMonth(from.getMonth() - months + 1)
    from.setDate(1)
    from.setHours(0, 0, 0, 0)

    const rows = await db.wateringSession.findMany({
      where: { startedAt: { gte: from }, status: { in: ['completed', 'aborted'] } },
    })

    const result = []
    for (let i = months - 1; i >= 0; i--) {
      const d     = new Date()
      d.setMonth(d.getMonth() - i)
      const year  = d.getFullYear()
      const month = d.getMonth()

      const monthRows = rows.filter((r) => {
        const rd = r.startedAt
        return rd.getFullYear() === year && rd.getMonth() === month
      })

      result.push({
        month:           MONTHS_FR[month],
        year,
        volumeLiters:    +monthRows.reduce((s, r) => s + r.volumeLiters, 0).toFixed(2),
        durationSeconds: monthRows.reduce((s, r) => s + r.durationSeconds, 0),
        sessions:        monthRows.length,
      })
    }

    res.json({ success: true, data: result, error: null })
  } catch (err) { next(err) }
})

export default router
