import { Router } from 'express'
import { z } from 'zod'
import { startPump, stopPump } from '../services/pump.service'
import { getState } from '../state'

const router = Router()

router.get('/pump/status', (_req, res) => {
  const { pumpOn, currentSessionId } = getState()
  res.json({
    success: true,
    data:    { on: pumpOn, sessionId: currentSessionId },
    error:   null,
  })
})

router.post('/pump/on', async (req, res, next) => {
  try {
    const { durationSeconds } = z.object({
      durationSeconds: z.number().int().min(1).max(3600).optional(),
    }).parse(req.body)

    const result = await startPump({ durationSeconds, mode: 'manual', triggeredBy: 'user' })
    res.json({ success: true, data: { ...result, mode: 'manual' }, error: null })
  } catch (err) { next(err) }
})

router.post('/pump/off', async (_req, res, next) => {
  try {
    const result = await stopPump('user')
    res.json({ success: true, data: result, error: null })
  } catch (err) { next(err) }
})

export default router
