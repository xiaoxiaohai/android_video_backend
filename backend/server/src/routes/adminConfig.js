import crypto from 'node:crypto'
import { pool } from '../db/pool.js'
import { config } from '../config.js'

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

// ── Token helpers (HMAC, no external deps) ────────────────────────

function signToken(secret) {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS })
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyToken(token, secret) {
  const [payload, sig] = (token || '').split('.')
  if (!payload || !sig) return false

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false

  const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
  return exp > Date.now()
}

// ── Auth guard ────────────────────────────────────────────────────

function requireAuth(request, reply) {
  const key = config.adminApiKey
  if (!key) {
    reply.code(503).send({ error: 'ADMIN_API_KEY is not configured on the server' })
    return false
  }

  // Bearer token (issued by /login)
  const authHeader = String(request.headers.authorization || '')
  if (authHeader.startsWith('Bearer ')) {
    if (verifyToken(authHeader.slice(7), key)) return true
    reply.code(401).send({ error: 'Token expired or invalid, please login again' })
    return false
  }

  // Raw key header (for programmatic / curl access)
  const rawKey = String(request.headers['x-admin-key'] || '')
  if (rawKey) {
    const a = Buffer.from(rawKey)
    const b = Buffer.from(key)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }

  reply.code(401).send({ error: 'Unauthorized' })
  return false
}

// ── Routes ────────────────────────────────────────────────────────

export default async function adminConfigRoutes(fastify) {

  // POST /api/admin/login
  fastify.post('/login', async (request, reply) => {
    const key = config.adminApiKey
    if (!key) return reply.code(503).send({ error: 'ADMIN_API_KEY not configured' })

    const password = String(request.body?.password || '')
    if (!password) return reply.code(400).send({ error: 'Password is required' })

    const a = Buffer.from(password)
    const b = Buffer.from(key)
    const match = a.length === b.length && crypto.timingSafeEqual(a, b)
    if (!match) return reply.code(401).send({ error: 'Invalid password' })

    return { token: signToken(key) }
  })

  // GET /api/admin/app-config
  fastify.get('/app-config', async (request, reply) => {
    if (!requireAuth(request, reply)) return

    const res = await pool.query(
      'SELECT data, updated_at FROM app_config WHERE id = 1'
    )
    return {
      config:    res.rows[0]?.data      ?? {},
      updatedAt: res.rows[0]?.updated_at ?? null,
    }
  })

  // PUT /api/admin/app-config
  fastify.put('/app-config', async (request, reply) => {
    if (!requireAuth(request, reply)) return

    const body = request.body
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'Invalid request body' })
    }

    await pool.query(
      `INSERT INTO app_config (id, data, updated_at)
       VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
      [JSON.stringify(body)]
    )

    return { ok: true }
  })
}
