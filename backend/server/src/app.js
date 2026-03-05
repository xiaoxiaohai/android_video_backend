import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import importRoutes from './routes/import.js'
import contentRoutes from './routes/content.js'
import homeRoutes from './routes/home.js'
import adminRoutes from './routes/admin.js'
import demoRoutes from './routes/demo.js'
import appConfigRoutes from './routes/appConfig.js'
import adminConfigRoutes from './routes/adminConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function rewriteResizeUrl(url) {
  if (typeof url !== 'string') return url
  return url.replace(/\/resize\/\d+x\d+\//i, '/resize/300x450/')
}

function normalizeImageFieldsDeep(value) {
  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (const item of value) normalizeImageFieldsDeep(item)
    return
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if ((key === 'img' || key === 'cover_img') && typeof fieldValue === 'string') {
      value[key] = rewriteResizeUrl(fieldValue)
      continue
    }
    normalizeImageFieldsDeep(fieldValue)
  }
}

function stripRawDeep(value) {
  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (const item of value) stripRawDeep(item)
    return
  }

  if (Object.prototype.hasOwnProperty.call(value, 'raw')) {
    delete value.raw
  }

  for (const v of Object.values(value)) {
    stripRawDeep(v)
  }
}

export function buildApp() {
  const app = Fastify({ logger: { level: config.logLevel } })

  app.addHook('preSerialization', async (_request, _reply, payload) => {
    normalizeImageFieldsDeep(payload)
    stripRawDeep(payload)
    return payload
  })

  app.get('/health', async () => ({ ok: true }))

  // ── API routes ──────────────────────────────────────────────────
  app.register(importRoutes,      { prefix: '/api' })
  app.register(contentRoutes,     { prefix: '/api' })
  app.register(homeRoutes,        { prefix: '/api' })
  app.register(adminRoutes,       { prefix: '/api' })
  app.register(demoRoutes,        { prefix: '/api' })
  app.register(appConfigRoutes,   { prefix: '/api' })
  app.register(adminConfigRoutes, { prefix: '/api/admin' })

  // ── Admin UI (Vue 3 SPA) ────────────────────────────────────────
  // Serve built assets: /admin/assets/*, /admin/favicon.ico, etc.
  const adminDist = path.resolve(__dirname, '../../admin-ui/dist')
  app.register(fastifyStatic, {
    root:           adminDist,
    prefix:         '/admin/',
    decorateReply:  false,
  })

  // SPA fallback: /admin and /admin/* → index.html (hash router handles the rest)
  app.get('/admin', async (_req, reply) =>
    reply.sendFile('index.html', adminDist)
  )

  return app
}
