import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

const UPSTREAM_CFG = {
  apiBase: process.env.UPSTREAM_API_BASE || 'https://cineframeplayer.com/module-movie/',
  requestedWith: process.env.UPSTREAM_REQUESTED_WITH || 'com.cine.frame.hd.video.player',
  appVersion: process.env.UPSTREAM_APP_VERSION || '1.1.1',
  language: process.env.UPSTREAM_LANGUAGE || 'en',
  decryptKey: process.env.UPSTREAM_DECRYPT_KEY || '8fOsTegF23mV43Nr6xiOisP34ZPN41WC',
  decryptAlgorithm: process.env.UPSTREAM_DECRYPT_ALGORITHM || 'aes-256-cbc',
  // 视频 CDN 会屏蔽服务器 IP，无法从服务端做 HEAD 验证
  // 缓存策略：纯时间 TTL，客户端播放失败时传 force=true 强制刷新
  cacheTtlMs: Number(process.env.UPSTREAM_CACHE_TTL_MS || 2 * 60 * 60 * 1000)
};

// ── Decrypt ──────────────────────────────────────────────────────────────────

function decodeWrappedPayload(rawText) {
  const outer = Buffer.from(rawText.trim(), 'base64').toString('utf8');
  const wrapped = JSON.parse(outer);
  if (!wrapped?.value || !wrapped?.iv) throw new Error('invalid wrapped payload');
  const iv = Buffer.from(String(wrapped.iv), 'utf8');
  const encrypted = Buffer.from(String(wrapped.value), 'base64');
  const key = Buffer.from(UPSTREAM_CFG.decryptKey, 'utf8');
  const decipher = crypto.createDecipheriv(UPSTREAM_CFG.decryptAlgorithm, key, iv);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
}

// ── Upstream API call ────────────────────────────────────────────────────────

async function callUpstreamApi(watchUrl) {
  const endpoint = new URL('pl/ad', UPSTREAM_CFG.apiBase);
  endpoint.searchParams.set('url', watchUrl);
  endpoint.searchParams.set('force', 'false');

  const res = await fetch(endpoint.toString(), {
    headers: {
      'x-requested-with': UPSTREAM_CFG.requestedWith,
      'x-app-version': UPSTREAM_CFG.appVersion,
      language: UPSTREAM_CFG.language
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!res.ok) throw new Error(`upstream http ${res.status}`);
  const rawText = await res.text();

  let payload;
  try {
    payload = decodeWrappedPayload(rawText);
  } catch {
    payload = JSON.parse(rawText);
  }

  const data = payload?.data || {};
  let files = [];
  let captions = [];
  try { files = typeof data.files === 'string' ? JSON.parse(data.files) : (data.files || []); } catch { files = []; }
  try { captions = typeof data.caption === 'string' ? JSON.parse(data.caption) : (data.caption || []); } catch { captions = []; }

  files = Array.isArray(files) ? files.filter((f) => f?.file) : [];
  captions = Array.isArray(captions) ? captions.filter((c) => c?.file) : [];

  if (files.length === 0) throw new Error('upstream returned no files');

  return { files, captions };
}

// ── DB cache ─────────────────────────────────────────────────────────────────

async function getCached(watchUrl) {
  const { rows } = await pool.query(
    'SELECT files, captions, resolved_at FROM upstream_resolve_cache WHERE watch_url = $1',
    [watchUrl]
  );
  return rows[0] || null;
}

async function upsertCache(watchUrl, files, captions) {
  await pool.query(
    `INSERT INTO upstream_resolve_cache (watch_url, files, captions, resolved_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (watch_url) DO UPDATE
       SET files = EXCLUDED.files,
           captions = EXCLUDED.captions,
           resolved_at = EXCLUDED.resolved_at`,
    [watchUrl, JSON.stringify(files), JSON.stringify(captions)]
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {string} watchUrl
 * @param {boolean} force  true = 跳过缓存强制重新解析（客户端播放失败时使用）
 */
export async function resolveUpstream(watchUrl, force = false) {
  if (!force) {
    const cached = await getCached(watchUrl);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.resolved_at).getTime();
      if (ageMs < UPSTREAM_CFG.cacheTtlMs) {
        return { ok: true, files: cached.files, captions: cached.captions, fromCache: true };
      }
    }
  }

  // 缓存 miss / 过期 / force 刷新 → 调上游
  const result = await callUpstreamApi(watchUrl);

  // 写缓存，不阻塞响应
  upsertCache(watchUrl, result.files, result.captions).catch(() => {});

  return { ok: true, files: result.files, captions: result.captions, fromCache: false };
}
