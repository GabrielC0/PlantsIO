import { Router } from 'express'
import { getEsp } from '../state'

const router = Router()

router.get('/esp/status', (_req, res) => {
  res.json({ success: true, data: getEsp(), error: null })
})

export default router
