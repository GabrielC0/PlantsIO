import { Router } from 'express'

const router  = Router()
const startAt = Date.now()

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status:    'ok',
      uptime:    Math.floor((Date.now() - startAt) / 1_000),
      timestamp: new Date().toISOString(),
    },
    error: null,
  })
})

export default router
