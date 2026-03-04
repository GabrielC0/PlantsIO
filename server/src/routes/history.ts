import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client'
import { getState } from '../state'
import { env } from '../config/env'
import type { WateringSession } from '@prisma/client'

const router = Router()

function fmt(s: WateringSession & { schedule?: { name: string } | null }) {
  const d = s.startedAt
  return {
    id:              s.id,
    startedAt:       d.toISOString(),
    endedAt:         s.endedAt?.toISOString() ?? null,
    durationSeconds: s.durationSeconds,
    volumeLiters:    s.volumeLiters,
    mode:            s.mode,
    scheduleId:      s.scheduleId,
    scheduleName:    s.schedule?.name ?? null,
    triggeredBy:     s.triggeredBy,
    status:          s.status,
    date:            d.toISOString().split('T')[0],
    startTime:       d.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: env.TIMEZONE,
    }),
  }
}

function relativeLabel(d: Date): string {
  const now     = new Date()
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yest    = new Date(today.getTime() - 86_400_000)
  const sessDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const time    = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: env.TIMEZONE })

  if (sessDay.getTime() === today.getTime())     return `Aujourd'hui ${time}`
  if (sessDay.getTime() === yest.getTime())      return `Hier ${time}`
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${time}`
}

// ── Routes (specific before generic) ─────────────────────────────

router.get('/history/current', (_req, res) => {
  const { pumpOn, currentSessionId } = getState()
  if (!pumpOn || !currentSessionId) {
    return res.json({ success: true, data: null, error: null })
  }
  res.json({ success: true, data: { sessionId: currentSessionId, on: true }, error: null })
})

router.get('/history/last', async (_req, res, next) => {
  try {
    const s = await db.wateringSession.findFirst({
      where:   { status: 'completed' },
      orderBy: { startedAt: 'desc' },
    })
    if (!s) return res.json({ success: true, data: null, error: null })

    res.json({
      success: true,
      data:    { ...fmt(s), relativeLabel: relativeLabel(s.startedAt) },
      error:   null,
    })
  } catch (err) { next(err) }
})

router.get('/history/recent', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '5'), 10), 20)
    const items = await db.wateringSession.findMany({
      where:   { status: { in: ['completed', 'aborted'] } },
      orderBy: { startedAt: 'desc' },
      take:    limit,
    })
    res.json({ success: true, data: items.map(fmt), error: null })
  } catch (err) { next(err) }
})

router.get('/history', async (req, res, next) => {
  try {
    const { page, limit, mode, from, to } = z.object({
      page:  z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      mode:  z.enum(['auto', 'manual']).optional(),
      from:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(req.query)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      status: { in: ['completed', 'aborted'] },
    }
    if (mode) where.mode = mode
    if (from) (where.startedAt as Record<string, unknown>) = { ...(where.startedAt as object ?? {}), gte: new Date(from) }
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      ;(where.startedAt as Record<string, unknown>) = { ...(where.startedAt as object ?? {}), lte: toDate }
    }

    const [items, total] = await Promise.all([
      db.wateringSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      db.wateringSession.count({ where }),
    ])

    res.json({
      success: true,
      data: {
        items:      items.map(fmt),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      error: null,
    })
  } catch (err) { next(err) }
})

export default router
