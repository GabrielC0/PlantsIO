import 'dotenv/config'
import http from 'http'
import { URL } from 'url'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { WebSocketServer } from 'ws'

import { env } from './config/env'
import { db } from './db/client'
import { restoreAutoMode } from './state'
import { loadSchedules } from './services/scheduler.service'
import { abortSessionOnEspDisconnect } from './services/pump.service'
import { attachEspGateway, setOnEspDisconnect } from './websocket/esp.gateway'
import { connectAdafruit } from './services/adafruit.service'
import { errorHandler } from './middleware/errorHandler'
import { serviceRouterMiddleware, SERVICE_PREFIX_PLANTSIO, SERVICE_PREFIX_ENABLED } from './middleware/serviceRouter'

import healthRouter    from './routes/health'
import espRouter       from './routes/esp'
import systemRouter    from './routes/system'
import pumpRouter      from './routes/pump'
import modeRouter      from './routes/mode'
import schedulesRouter from './routes/schedules'
import historyRouter   from './routes/history'
import statsRouter     from './routes/stats'

async function bootstrap(): Promise<void> {

  // ── Adafruit IO MQTT ───────────────────────────────────────────
  connectAdafruit()

  // ── Wire ESP disconnect → pump abort (breaks circular dep) ────
  setOnEspDisconnect(abortSessionOnEspDisconnect)

  // ── Restore persisted state from DB ───────────────────────────
  try {
    const cfg = await db.systemConfig.findUnique({ where: { key: 'autoMode' } })
    if (cfg) restoreAutoMode(cfg.value === 'true')

    // Any session left in_progress means the server crashed — mark aborted
    const aborted = await db.wateringSession.updateMany({
      where: { status: 'in_progress' },
      data:  { status: 'aborted', endedAt: new Date() },
    })
    if (aborted.count > 0) {
      console.warn(`[Boot] Marked ${aborted.count} stale session(s) as aborted`)
    }
  } catch (err) {
    console.error('[Boot] DB restore failed:', err)
  }

  // ── Express ────────────────────────────────────────────────────
  const app = express()
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  app.use(express.json())
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'))

  // ── Service router : préfixe /plantsio (optionnel si SERVICE_PREFIX_ENABLED=false) ──
  app.use(serviceRouterMiddleware)

  // ── Routes ─────────────────────────────────────────────────────────────────
  // Avec préfixe activé  : /plantsio/health, /plantsio/api/v1/...
  // Avec préfixe désactivé : /health, /api/v1/... (compatibilité)
  app.use('/',        healthRouter)
  app.use('/api/v1',  espRouter)
  app.use('/api/v1',  systemRouter)
  app.use('/api/v1',  pumpRouter)
  app.use('/api/v1',  modeRouter)
  app.use('/api/v1',  schedulesRouter)
  app.use('/api/v1',  historyRouter)
  app.use('/api/v1',  statsRouter)

  app.use(errorHandler)

  // ── HTTP server ────────────────────────────────────────────────
  const server = http.createServer(app)

  // ── WebSocket server (ESP32 only) ─────────────────────────────
  const espWss = new WebSocketServer({ noServer: true })

  attachEspGateway(espWss)

  // Chemins WebSocket acceptés :  /plantsio/esp  (préfixe activé)
  //                                /esp           (préfixe désactivé / backward compat)
  const WS_PATH_PREFIXED = `/${SERVICE_PREFIX_PLANTSIO}/esp`
  const WS_PATH_BARE     = '/esp'

  server.on('upgrade', (req, socket, head) => {
    const url      = new URL(req.url!, `http://${req.headers.host}`)
    const accepted = SERVICE_PREFIX_ENABLED ? WS_PATH_PREFIXED : WS_PATH_BARE

    // Accepter aussi le chemin sans préfixe pour l'ESP32 existant
    if (url.pathname === accepted || url.pathname === WS_PATH_BARE || url.pathname === WS_PATH_PREFIXED) {
      if (url.searchParams.get('token') !== env.ESP32_WS_SECRET) {
        console.warn('[WS:ESP] Rejected — invalid token')
        socket.destroy()
        return
      }
      espWss.handleUpgrade(req, socket, head, (ws) => espWss.emit('connection', ws, req))
      return
    }

    socket.destroy()
  })

  // ── Start cron scheduler ────────────────────────────────────────
  await loadSchedules(env.TIMEZONE)

  // ── Listen ─────────────────────────────────────────────────────
  server.listen(env.PORT, () => {
    const prefix = SERVICE_PREFIX_ENABLED ? `/${SERVICE_PREFIX_PLANTSIO}` : ''
    console.log(`\n🌱 PlantsIO Server`)
    console.log(`   HTTP  → http://localhost:${env.PORT}${prefix}`)
    console.log(`   API   → http://localhost:${env.PORT}${prefix}/api/v1`)
    console.log(`   WS    → ws://localhost:${env.PORT}${prefix}/esp  (ESP32)`)
    console.log(`   Env   → ${env.NODE_ENV}`)
    console.log(`   Préfixe → ${SERVICE_PREFIX_ENABLED ? `activé (${prefix})` : 'désactivé'}\n`)
  })

  // ── Graceful shutdown ───────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Server] Received ${signal} — shutting down…`)
    await db.$disconnect()
    server.close(() => process.exit(0))
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

bootstrap().catch((err) => {
  console.error('[Boot] Fatal:', err)
  process.exit(1)
})
