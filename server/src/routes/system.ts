import { Router } from 'express'
import { getState, getEsp } from '../state'
import { getNextWatering } from '../services/scheduler.service'
import { db } from '../db/client'
import { env } from '../config/env'

const router = Router()

router.get('/system/state', async (_req, res, next) => {
  try {
    const state = getState()
    const esp   = getEsp()

    // ── Last completed session ──────────────────────────────────
    const lastSession = await db.wateringSession.findFirst({
      where:   { status: { in: ['completed', 'aborted'] } },
      orderBy: { startedAt: 'desc' },
    })

    let lastWatering = null
    if (lastSession) {
      const d       = lastSession.startedAt
      const now     = new Date()
      const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yest    = new Date(today.getTime() - 86_400_000)
      const sessDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: env.TIMEZONE })

      let relativeLabel: string
      if (sessDay.getTime() === today.getTime())     relativeLabel = `Aujourd'hui ${timeStr}`
      else if (sessDay.getTime() === yest.getTime()) relativeLabel = `Hier ${timeStr}`
      else relativeLabel = `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${timeStr}`

      lastWatering = {
        date:            d.toISOString().split('T')[0],
        startTime:       timeStr,
        durationSeconds: lastSession.durationSeconds,
        volumeLiters:    lastSession.volumeLiters,
        mode:            lastSession.mode,
        relativeLabel,
      }
    }

    // ── Today consumption ───────────────────────────────────────
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todaySessions = await db.wateringSession.findMany({
      where: { startedAt: { gte: todayStart }, status: { in: ['completed', 'aborted'] } },
    })
    const todayConsumptionLiters = +todaySessions
      .reduce((s, r) => s + r.volumeLiters, 0)
      .toFixed(2)

    // ── Next scheduled watering ─────────────────────────────────
    const nextWatering = await getNextWatering()

    res.json({
      success: true,
      data: {
        pumpOn:              state.pumpOn,
        autoMode:            state.autoMode,
        espConnected:        esp.connected,
        espLastSeen:         esp.lastSeen,
        currentSessionId:    state.currentSessionId,
        lastWatering,
        nextWatering,
        todayConsumptionLiters,
      },
      error: null,
    })
  } catch (err) { next(err) }
})

export default router
