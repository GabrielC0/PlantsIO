import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client'
import { loadSchedules } from '../services/scheduler.service'
import { getNextWatering } from '../services/scheduler.service'
import { AppError } from '../types'
import { env } from '../config/env'

const router = Router()

// ── Validation schema ─────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DAYS    = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

const ScheduleSchema = z.object({
  name:       z.string().min(1).max(50),
  enabled:    z.boolean(),
  times:      z.array(z.string().regex(TIME_RE, 'Format HH:MM requis')).min(1),
  activeDays: z.array(z.enum(DAYS)),
  duration:   z.number().int().min(10).max(3600),
})

// ── Formatter ────────────────────────────────────────────────────

function fmt(s: {
  id: string; name: string; enabled: boolean; times: unknown
  activeDays: unknown; duration: number; createdAt: Date; updatedAt: Date
}) {
  return {
    ...s,
    times:      s.times      as string[],
    activeDays: s.activeDays as string[],
    createdAt:  s.createdAt.toISOString(),
    updatedAt:  s.updatedAt.toISOString(),
  }
}

async function afterChange(): Promise<void> {
  await loadSchedules(env.TIMEZONE)
}

// ── Routes (order matters: /next and bulk PUT before /:id) ────────

router.get('/schedules/next', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await getNextWatering(), error: null })
  } catch (err) { next(err) }
})

router.get('/schedules', async (_req, res, next) => {
  try {
    const list = await db.schedule.findMany({ orderBy: { createdAt: 'asc' } })
    res.json({ success: true, data: list.map(fmt), error: null })
  } catch (err) { next(err) }
})

router.post('/schedules', async (req, res, next) => {
  try {
    const data     = ScheduleSchema.parse(req.body)
    const schedule = await db.schedule.create({ data })
    await afterChange()
    res.status(201).json({ success: true, data: fmt(schedule), error: null })
  } catch (err) { next(err) }
})

// Bulk save — must be before /:id to avoid ambiguity
router.put('/schedules', async (req, res, next) => {
  try {
    const { schedules } = z.object({
      schedules: z.array(ScheduleSchema.extend({ id: z.string().optional() })),
    }).parse(req.body)

    let created = 0, updated = 0

    for (const s of schedules) {
      const { id, ...rest } = s as typeof s & { id?: string }
      if (id) {
        await db.schedule.upsert({ where: { id }, update: rest, create: rest })
        updated++
      } else {
        await db.schedule.create({ data: rest })
        created++
      }
    }

    await afterChange()
    res.json({ success: true, data: { saved: created + updated, created, updated }, error: null })
  } catch (err) { next(err) }
})

router.get('/schedules/:id', async (req, res, next) => {
  try {
    const s = await db.schedule.findUnique({ where: { id: req.params.id } })
    if (!s) throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'Programme introuvable.')
    res.json({ success: true, data: fmt(s), error: null })
  } catch (err) { next(err) }
})

router.put('/schedules/:id', async (req, res, next) => {
  try {
    const data = ScheduleSchema.parse(req.body)
    const exists = await db.schedule.findUnique({ where: { id: req.params.id } })
    if (!exists) throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'Programme introuvable.')
    const s = await db.schedule.update({ where: { id: req.params.id }, data })
    await afterChange()
    res.json({ success: true, data: fmt(s), error: null })
  } catch (err) { next(err) }
})

router.patch('/schedules/:id', async (req, res, next) => {
  try {
    const data   = ScheduleSchema.partial().parse(req.body)
    const exists = await db.schedule.findUnique({ where: { id: req.params.id } })
    if (!exists) throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'Programme introuvable.')
    const s = await db.schedule.update({ where: { id: req.params.id }, data })
    await afterChange()
    res.json({ success: true, data: fmt(s), error: null })
  } catch (err) { next(err) }
})

router.delete('/schedules/:id', async (req, res, next) => {
  try {
    const exists = await db.schedule.findUnique({ where: { id: req.params.id } })
    if (!exists) throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'Programme introuvable.')
    await db.schedule.delete({ where: { id: req.params.id } })
    await afterChange()
    res.json({ success: true, data: { deleted: true, id: req.params.id }, error: null })
  } catch (err) { next(err) }
})

export default router
