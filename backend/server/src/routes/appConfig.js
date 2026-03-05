import { pool } from '../db/pool.js'

function normalizeHardId(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeWhitelist(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(normalizeHardId).filter(Boolean))]
}

function isHardIdWhitelisted(hardId, whitelist) {
  const normalizedHardId = normalizeHardId(hardId)
  if (!normalizedHardId) return false
  return normalizeWhitelist(whitelist).includes(normalizedHardId)
}

function toNumberOrZero(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toClientAndroidConfig(rawAndroid) {
  const safe = rawAndroid && typeof rawAndroid === 'object' ? rawAndroid : {}
  return {
    latestVersionCode:      toNumberOrZero(safe.latestVersionCode),
    latestVersionName:      typeof safe.latestVersionName === 'string' ? safe.latestVersionName : '',
    minRequiredVersionCode: toNumberOrZero(safe.minRequiredVersionCode),
    updateUrl:              typeof safe.updateUrl === 'string' ? safe.updateUrl : '',
    forceUpdateMessage:     typeof safe.forceUpdateMessage === 'string' ? safe.forceUpdateMessage : null,
    optionalUpdateMessage:  typeof safe.optionalUpdateMessage === 'string' ? safe.optionalUpdateMessage : null,
    releaseNotes:           Array.isArray(safe.releaseNotes) ? safe.releaseNotes.filter(s => typeof s === 'string') : [],
  }
}

/**
 * GET /api/app/config
 *
 * 返回 Android 升级配置，数据来源：DB app_config 表（由 admin UI 管理）。
 * 若 DB 无数据或查询失败，返回全零默认值（客户端视为无需升级）。
 */
export default async function appConfigRoutes(fastify) {
  fastify.get('/app/config', async (request, _reply) => {
    const hardId = request.query?.hard_id
    try {
      const res = await pool.query(
        'SELECT data FROM app_config WHERE id = 1'
      )
      const androidRaw = res.rows[0]?.data?.android ?? {}
      const android = toClientAndroidConfig(androidRaw)
      const showStreaming = isHardIdWhitelisted(hardId, androidRaw?.streamingHardIdWhitelist)
      return { android, ss: showStreaming }
    } catch {
      // DB 查询失败时静默降级，不影响 App 正常使用
    }

    return {
      android: toClientAndroidConfig(null),
      ss: false,
    }
  })
}
