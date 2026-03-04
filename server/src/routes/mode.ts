import { Router } from 'express'
import { z } from 'zod'
import { setAutoMode, getState } from '../state'
import { stopPump } from '../services/pump.service'
import { loadSchedules } from '../services/scheduler.service'
import { db } from '../db/client'
import { env } from '../config/env'

const router = Router()

router.get('/mode', (_req, res) => {
  res.json({ success: true, data: { autoMode: getState().autoMode }, error: null })
})

router.put('/mode', async (req, res, next) => {
  try {
    const { autoMode } = z.object({ autoMode: z.boolean() }).parse(req.body)

    const prev = getState()

    // If disabling auto while pump runs in auto mode → stop it
    if (!autoMode && prev.pumpOn && prev.currentSessionId) {
      await stopPump('mode-change').catch(() => {})
    }

    setAutoMode(autoMode)

    // Persist autoMode
    await db.systemConfig.upsert({
      where:  { key: 'autoMode' },
      update: { value: String(autoMode) },
      create: { key: 'autoMode', value: String(autoMode) },
    })

    // Reload scheduler (will clear tasks if autoMode=false)
    await loadSchedules(env.TIMEZONE)

    res.json({
      success: true,
      data:    { autoMode, updatedAt: new Date().toISOString() },
      error:   null,
    })
  } catch (err) { next(err) }
})

export default router
